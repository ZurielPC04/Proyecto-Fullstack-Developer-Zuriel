# Registro de decisiones

Decisiones cerradas durante el interrogatorio previo a `requirements.md`. Todos los montos están en centavos como enteros (`BIGINT`).

| ID | Tema | Estado |
|---|---|---|
| D-01 | Saldo guardado vs. suma de asientos | Aceptada |
| D-02 | Cuenta de sistema Fondeo | Aceptada |
| D-03 | Llave de idempotencia | Aceptada |
| D-04 | Cálculo del límite diario y bloqueo por usuario | Aceptada |
| D-05 | Rotación de refresh token con familias de sesión | Aceptada |
| D-06 | Almacenamiento de tokens en web y móvil | Aceptada |
| D-07 | Código de un solo uso | Aceptada |
| D-08 | Alcance del bonus: estado de cuenta CSV | Aceptada |
| D-09 | Tipos de transferencia y de movimiento | Aceptada |
| D-10 | Recursos ajenos responden 404 | Aceptada |
| D-11 | Índice y cursor del historial | Aceptada |
| D-12 | Estrategia de concurrencia | Aceptada |
| D-13 | Monto del límite diario y umbral del código | Aceptada |
| D-14 | Estados de una transferencia | Aceptada |
| D-15 | Día del límite: zona horaria y medianoche | Aceptada |
| D-16 | Doble clic y ciclo de vida de la llave en web | Aceptada |
| D-17 | Red perdida a mitad de una transferencia en móvil | Aceptada |
| D-18 | Montos sin redondeo: captura, transporte y presentación | Aceptada |
| D-19 | Alta de beneficiario y validación de CLABE | Aceptada |
| D-20 | Cuentas al registrarse y primer saldo | Aceptada |

---

## D-01 · Saldo guardado, mantenido por trigger

**Decisión**

- `cuenta.saldo_centavos BIGINT NOT NULL CHECK (saldo_centavos >= 0)`.
- Un trigger `AFTER INSERT ON asiento` suma `NEW.monto_centavos` al saldo de la cuenta. La aplicación nunca escribe el saldo.
- Los asientos son inmutables (sin `UPDATE` ni `DELETE`).
- Las cuentas se bloquean con `SELECT ... FOR UPDATE` en orden determinista antes de insertar los asientos; el trigger solo actualiza filas ya bloqueadas.
- El trigger y los `CHECK` se crean con SQL dentro de las migraciones de TypeORM; `design.md` lo documenta como algo que TypeORM no cubre por sí solo.
- Las pruebas verifican `saldo_centavos = SUM(asiento.monto_centavos)` por cuenta.

**Motivo:** el saldo se lee en O(1), hay una fila concreta que bloquear y la base garantiza el saldo no negativo. Como el saldo solo cambia por el trigger y los asientos no se modifican, no puede desincronizarse.

**Alternativa descartada:** calcular el saldo como `SUM(asientos)` sin guardarlo. Un `CHECK` no puede expresar "la suma no es negativa", no hay fila natural que bloquear y cada lectura de saldo crece con el número de movimientos (más de 100,000 en el seed).

---

## D-02 · Cuenta de sistema Fondeo

**Decisión**

- `cuenta.tipo` es `USUARIO` o `SISTEMA`, y no se puede modificar después de crear la cuenta. Una cuenta de sistema no tiene usuario: `CHECK ((tipo = 'SISTEMA') = (usuario_id IS NULL))`.
- El `CHECK` de saldo de D-01 queda como `CHECK (tipo = 'SISTEMA' OR saldo_centavos >= 0)`. Solo la cuenta Fondeo puede tener saldo negativo; ese saldo representa todo el dinero que ha entrado a la plataforma.
- Todo el dinero entra con una transferencia de tipo `FONDEO`, de Fondeo hacia una cuenta de usuario. Genera dos asientos que suman cero, sin excepciones a esa regla.
- Fondeo no es accesible desde la API pública: ningún usuario puede usarla como origen ni como destino. Solo la usan el seed y los procesos internos.
- Las transferencias `FONDEO` no cuentan para el límite diario. En el historial del usuario aparecen como **depósito**, no como transferencia enviada.
- Cada fondeo genera un evento de auditoría.
- Las pruebas verifican la invariante global `SUM(saldo_centavos) = 0` sobre todas las cuentas.

**Motivo:** la regla "los asientos de cada transferencia suman cero" se cumple sin excepciones, también para el dinero inicial, y la invariante global da una prueba barata de que no se crea ni se pierde dinero.

**Alternativa descartada:** una transferencia `APERTURA` con un solo asiento, exenta del trigger de suma cero. Es más simple, pero mete una excepción justo en la regla que más importa y se pierde la invariante global.

---

## D-03 · Llave de idempotencia

**Decisión**

- El cliente genera un UUID v4 por intento y lo manda en el header `Idempotency-Key`.
- La llave se guarda en la fila de `transferencia`, con `UNIQUE (usuario_id, llave_idempotencia)`, junto con `hash_peticion`: SHA-256 del cuerpo normalizado (origen, destino, `monto_centavos`, concepto, referencia).
- Misma llave y mismo hash: se devuelve el resultado guardado, con el mismo código HTTP y el mismo cuerpo, sin mover dinero.
- Misma llave y hash distinto: `422` con un problem RFC 7807 `idempotency-key-reused`.
- Dos peticiones simultáneas con la misma llave: la segunda espera en el índice único, recibe `23505`, se atrapa y se responde con el resultado de la primera.
- Los rechazos de negocio (saldo insuficiente, límite excedido) también se guardan como transferencia rechazada. Así un reintento devuelve el mismo rechazo y queda registro del intento.
- La llave no expira en esta prueba. Expirarla a las 24 horas va en "qué haría con más tiempo" del README.

**Motivo:** la llave es única por usuario, así que no hay choques ni fugas entre usuarios. El hash evita devolver en silencio el resultado de otra operación, y guardar la llave en la misma fila evita otra escritura y duplicar datos.

**Alternativa descartada:** una tabla `solicitud_idempotente` aparte, con la respuesta HTTP serializada. Es genérica para cualquier endpoint, pero solo las transferencias necesitan idempotencia, y duplicaría datos y escrituras.

---

## D-04 · Cálculo del límite diario y bloqueo por usuario

**Decisión**

- Dentro de la transacción se bloquea primero la fila del usuario (`SELECT ... FROM usuario WHERE id = $1 FOR UPDATE`) y después las cuentas en orden determinista (D-01). El orden fijo, usuario y luego cuentas, evita deadlocks.
- Lo consumido es `SUM(monto_centavos)` de las transferencias aplicadas del usuario cuyo `aplicada_en` cae dentro del día (D-15).
- No cuentan para el límite:
  - las transferencias `FONDEO` (D-02);
  - las transferencias entre cuentas del mismo usuario, porque el dinero no sale de su control;
  - las transferencias rechazadas (D-03).
- Una transferencia es "entre cuentas propias" según el dueño real de la cuenta destino al momento de aplicarla, no según cómo se eligió el destino. Un beneficiario cuya CLABE apunta a una cuenta del mismo usuario cuenta como transferencia entre cuentas propias.
- Índice parcial: `(usuario_id, aplicada_en) WHERE estado = 'APLICADA' AND tipo = 'TERCERO'` (predicado cerrado en D-09, columna en D-15).
- Las transferencias que esperan código de confirmación no reservan límite; el límite se revisa de nuevo, con el bloqueo tomado, al momento de aplicarlas.

**Motivo:** bloquear solo las cuentas no basta. Un usuario con dos cuentas podría lanzar en paralelo dos transferencias, una desde cada cuenta, y rebasar el límite entre las dos. La fila del usuario serializa sus transferencias, y calcular la suma al momento deja una sola fuente de verdad.

**Alternativa descartada:** una tabla contador `limite_diario (usuario_id, dia, consumido_centavos)`. Se lee en O(1), pero es un segundo dato que puede desincronizarse de las transferencias, y ata el modelo a la definición del "día" antes de decidirla.

---

## D-05 · Rotación de refresh token con familias de sesión

**Decisión**

- La tabla `sesion` tiene `id`, `usuario_id`, `familia_id`, `refresh_hash`, `expira_en`, `usada_en` y `revocada_en`.
- El refresh es un valor aleatorio opaco de 256 bits; se guarda solo su SHA-256.
- Access JWT de 15 minutos; refresh de 7 días.
- Al refrescar se bloquea la fila de la sesión con `FOR UPDATE`. Si el refresh es válido y no se ha usado, se marca `usada_en` y se emite uno nuevo en la misma familia.
- Si se presenta un refresh ya usado, es reúso: se revoca toda la familia, se registra el evento de auditoría `refresh-reuse-detected` y se responde `401`.
- Cerrar sesión revoca la familia.
- Sin periodo de gracia. En web, el refresh se coordina entre pestañas con la Web Locks API (`navigator.locks`) para que dos pestañas no disparen una falsa detección de reúso. En móvil basta una sola promesa de refresh en vuelo.

**Motivo:** con familias, si un atacante usa una copia robada, la familia completa se invalida y el robo queda auditado. El refresh tiene alta entropía, así que basta con SHA-256 y no hace falta argon2.

**Alternativa descartada:** rotar sin familias y rechazar solo el token reusado. Si el atacante rota primero, su cadena sigue siendo válida y el usuario no se entera.

---

## D-06 · Almacenamiento de tokens en web y móvil

**Decisión**

- **Web:**
  - El refresh va en una cookie `HttpOnly; Secure; SameSite=Strict`. Su `Path` coincide con la ruta real del endpoint de refresh: como la API vive bajo `/api`, es `Path=/api/auth`.
  - El access se guarda solo en memoria; nunca en `localStorage` ni en `sessionStorage`.
  - Al recargar la página se llama a `POST /api/auth/refresh` para obtener un access nuevo.
  - La cookie es compartida entre pestañas, así que la pestaña que espera el lock de D-05 manda el refresh ya rotado.
  - Contra CSRF: `SameSite=Strict`, CORS restringido al origen del panel y el endpoint de refresh exige el header `X-Requested-With`.
  - En local, el dev server de Vite hace de proxy de `/api` para que web y API compartan origen.
- **Móvil:** el refresh va en `expo-secure-store` (Keychain/Keystore) y el access en memoria. Móvil manda el refresh en el cuerpo de la petición; nunca usa `AsyncStorage`.
- **API:** el endpoint de refresh acepta el refresh por cookie (web) o por cuerpo (móvil). A web nunca le devuelve el refresh en el cuerpo de la respuesta.
- **Cerrar sesión:** la API revoca la familia (D-05); web borra la cookie y móvil borra su entrada en SecureStore.

**Motivo:** un XSS en web no puede leer el refresh, que vale 7 días. La cookie compartida hace que la coordinación entre pestañas de D-05 funcione, y el proxy evita configurar cookies entre orígenes distintos en local.

**Alternativa descartada:** guardar los dos tokens en `localStorage`. Es más simple, pero cualquier XSS se lleva el refresh, y en una app financiera eso es inaceptable.

---

## D-07 · Código de un solo uso

**Decisión**

- Código de 6 dígitos generado con `crypto.randomInt`, con 5 minutos de vigencia. Uno por transferencia: `UNIQUE (transferencia_id)` en `codigo_confirmacion`.
- Se guarda un HMAC-SHA256 del código con un secreto del servidor.
- Máximo 3 intentos fallidos: `intentos SMALLINT NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 3)`. Cada fallo incrementa el contador en su propia transacción ya confirmada y genera un evento de auditoría. La comparación es de tiempo constante (`crypto.timingSafeEqual`).
- Al tercer fallo, o si el código expira, la transferencia termina sin mover dinero; el estado se define con el modelo de estados. Para reintentar, el usuario empieza un intento nuevo con una llave de idempotencia nueva.
- `POST /transferencias/{id}/confirmar` valida que la transferencia sea del usuario y sigue el orden total de bloqueo de D-12:
  1. bloquea al usuario;
  2. bloquea la transferencia y su código, y valida el código;
  3. si es correcto, bloquea las cuentas por `id` ascendente y aplica la transferencia con la nueva revisión del límite de D-04.
- La transacción que registra un intento fallido también bloquea primero al usuario y después el código.
- Confirmar es idempotente: si la transferencia ya se aplicó, una segunda confirmación devuelve el mismo comprobante, sin error y sin consumir intentos. Esto cubre el doble clic en "Confirmar".
- Sin reenvío del código en esta prueba; va en "qué haría con más tiempo".
- La entrega es simulada: una interfaz `ProveedorOtp` con una implementación simulada que solo se activa con `OTP_SIMULADO=true` y devuelve el código en el campo `codigoSimulado` de la respuesta. El código nunca se escribe en los logs.
- La API se niega a arrancar si `OTP_SIMULADO=true` y `NODE_ENV=production`.

**Motivo:** un código de 6 dígitos tiene solo 10⁶ combinaciones. El HMAC impide romperlo por fuerza bruta si se filtra la tabla, y el contador confirmado en su propia transacción impide adivinarlo en línea. Que confirmar sea idempotente evita errores falsos por doble clic.

**Alternativa descartada:** TOTP con una app autenticadora (exige un alta con QR y un secreto por usuario, y se sale del alcance). También se descarta quitar el contador y confiar solo en el rate limit.

---

## D-08 · Alcance del bonus: estado de cuenta CSV

**Decisión**

- Se implementa solo el estado de cuenta mensual en CSV: `GET /cuentas/{id}/estado-cuenta?mes=AAAA-MM` y un botón en web.
- Solo se exporta una cuenta que pertenezca al usuario autenticado.
- Los montos se exportan en pesos con dos decimales, formateados desde los centavos enteros con división entera y residuo; nunca con `/ 100` en float.
- El archivo va en UTF-8 con BOM. El mes se calcula en la zona horaria que se decida para el límite diario.
- Protección contra inyección en CSV: si un campo de texto (concepto, nombre, alias) empieza con `=`, `+`, `-`, `@`, tabulador o retorno de carro, se le antepone un apóstrofo. Los campos de monto son numéricos y no se alteran.
- Transferencias programadas: fuera de alcance. `fecha_programada` no entra al modelo (cierra el hueco 6).
- La biometría en móvil queda como la última tarea opcional de `tasks.md`.
- Si no da tiempo, PDF, transferencias programadas y biometría van en "qué haría con más tiempo".

**Motivo:** el CSV es de solo lectura, no mueve dinero y reutiliza la consulta del historial. Las programadas abren riesgos de saldo, límite, código y proceso de ejecución, que es justo el alcance grande que el enunciado pide evitar.

**Alternativa descartada:** transferencias programadas, que necesitan un proceso de ejecución, estados nuevos y revisar saldo, límite y código el día de ejecución.

---

## D-09 · Tipos de transferencia y de movimiento

**Decisión**

- **Tipo de transferencia** (la operación), fijado al aplicar según el dueño real de la cuenta destino (D-04):
  - `FONDEO`: de la cuenta Fondeo a una cuenta de usuario.
  - `TRASPASO`: entre cuentas del mismo usuario.
  - `TERCERO`: a una cuenta de otro usuario.
- **Tipo de movimiento**, guardado en cada asiento al insertarlo e inmutable:
  - `DEPOSITO`: abono de un `FONDEO`.
  - `ENVIO`: cargo de un `TERCERO`.
  - `RECEPCION`: abono de un `TERCERO`.
  - `TRASPASO_SALIDA` y `TRASPASO_ENTRADA`: cargo y abono de un `TRASPASO`.
- `CHECK (monto_centavos <> 0)` y `CHECK ((tipo_movimiento IN ('DEPOSITO','RECEPCION','TRASPASO_ENTRADA')) = (monto_centavos > 0))`.
- El filtro "tipo" del historial usa `tipo_movimiento`.
- Cierra el predicado del índice parcial de D-04: `WHERE estado = 'APLICADA' AND tipo = 'TERCERO'`.
- Las transferencias rechazadas no aparecen en el historial de movimientos, porque no tienen asientos. Quedan en la tabla de transferencias y en la auditoría.
- Vocabulario: "Movimiento" es lo que ve el usuario; "Asiento" es el registro contable. En la interfaz, un depósito nunca se llama "transferencia".
- _Completada durante la fase de diseño (DD-13 de `design.md`):_ el catálogo no tenía tipo para el cargo en la cuenta Fondeo de un `FONDEO`, y el `CHECK` de signo lo exige. Se agrega `FONDEO_SALIDA` (signo negativo), que solo existe en Fondeo. No se expone en la API: el filtro del historial sigue aceptando solo los cinco tipos de usuario. El `CHECK` de signo no cambia, porque `FONDEO_SALIDA` no está en la lista de tipos positivos.

**Motivo:** filtrar por una columna guardada permite usar índices en el historial. Calcular el tipo con un `JOIN` y el signo del monto no los podría usar. Como los asientos son inmutables, guardar el tipo no puede desincronizarse, y el `CHECK` impide que el signo y el tipo se contradigan.

**Alternativa descartada:** calcular el tipo de movimiento al consultar, con un `JOIN` a la transferencia y el signo del monto. No duplica datos, pero no aprovecha el índice del historial.

---

## D-10 · Recursos ajenos responden 404

**Decisión:** si un usuario pide una cuenta, transferencia o beneficiario que no es suyo, la API responde `404` (problem RFC 7807 `not-found`), igual que si no existiera. Nunca responde `403`.

**Motivo:** un `403` confirmaría que el recurso existe y permitiría enumerar IDs ajenos.

**Alternativa descartada:** responder `403 Forbidden`. Es semánticamente más exacto, pero revela que el recurso existe.

---

## D-11 · Índice y cursor del historial

**Decisión**

- `asiento.id BIGINT GENERATED ALWAYS AS IDENTITY` sirve para desempatar. Los dos asientos de una transferencia comparten `creado_en`, porque `now()` es el inicio de la transacción.
- Orden: `ORDER BY creado_en DESC, id DESC LIMIT n + 1`. La fila de más indica si hay página siguiente sin hacer `COUNT`.
- Índices:
  - `(cuenta_id, creado_en DESC, id DESC)`;
  - `(cuenta_id, tipo_movimiento, creado_en DESC, id DESC)`, para el filtro por tipo.
  - Los dos se miden en el `EXPLAIN ANALYZE` de `design.md`, con 100,000 movimientos o más.
- Cursor: base64url opaco de `{creado_en, id, filtros_hash}`, con la condición `WHERE (creado_en, id) < ($1, $2)`.
- `creado_en` va en el cursor como texto tal como sale de PostgreSQL, con microsegundos, y nunca pasa por `Date` de JavaScript, que solo tiene milisegundos.
- Si `filtros_hash` no coincide con los filtros de la petición, se responde `400` con `invalid-cursor`.
- Tamaño de página: 20 por defecto y máximo 100.
- Respuesta: `{ items, siguienteCursor: string | null }`.
- `desde` y `hasta` son días calendario en la zona horaria del sistema (ver la decisión sobre medianoche) y se traducen al rango `[desde 00:00, hasta + 1 día 00:00)`.

**Motivo:** la paginación por cursor sobre `(creado_en, id)` usa el índice como rango, tanto para el orden como para el filtro de fechas, y no se degrada con el número de páginas. Si los microsegundos se truncaran, se saltarían o repetirían movimientos en el borde de una página.

**Alternativa descartada:** un cursor con solo `id` y orden `id DESC`. Es más simple, pero el filtro por fecha deja de ser un rango del índice, y el orden de los `id` no siempre coincide con el de `creado_en` cuando hay transacciones concurrentes.

---

## D-12 · Estrategia de concurrencia

**Decisión**

- Aislamiento `READ COMMITTED` con bloqueo explícito `FOR UPDATE`.
- Orden de bloqueo en una transferencia:
  1. la fila del usuario emisor (D-04);
  2. las cuentas origen y destino, en un solo `SELECT ... FROM cuenta WHERE id = ANY($1) ORDER BY id FOR UPDATE`.
  - No se bloquea al usuario destino; el límite es solo del emisor.
- **Regla global, orden total de bloqueo:** **usuario → transferencia/código de confirmación → cuentas (`id` ascendente)**.
  - Ningún flujo del sistema puede bloquear una fila de un nivel posterior y después una de un nivel anterior, ni bloquear cuentas en otro orden que no sea `id` ascendente.
  - Aplica a crear, confirmar y registrar intentos fallidos de código (D-07), y a cualquier operación nueva que bloquee filas.
  - Costo: una confirmación hace fila detrás de las demás transferencias del mismo usuario; no afecta a otros usuarios.
  - Se descartó dejar el código fuera del orden y justificar en `design.md` por qué hoy no hay ciclo: es una invariante implícita que el primer flujo nuevo, como expirar códigos o cancelar pendientes, rompería.
- El saldo y el límite se validan en código con las filas ya bloqueadas. Si fallan, se guarda la transferencia rechazada (D-03) en la misma transacción; el `CHECK` de saldo queda como la última red.
- `SET LOCAL lock_timeout = '5s'` y `SET LOCAL statement_timeout = '10s'`. Si se agotan, se responde `503` con un problem `retryable`; el cliente reintenta con la misma llave de idempotencia.
- Ante un deadlock (`40P01`), que no debería ocurrir, el servidor reintenta hasta 3 veces con espera aleatoria y lo registra como `warn`, porque indica un bug en el orden de bloqueo.
- Prueba de concurrencia: 100 transferencias simultáneas desde una cuenta, con un pool de 10 conexiones. Se verifica:
  - aplicadas × monto + saldo final = saldo inicial;
  - `saldo = SUM(asientos)` por cuenta (D-01);
  - `SUM(saldos) = 0` (D-02);
  - cero deadlocks.

**Motivo:** con un orden total de bloqueo no hay ciclos posibles: si A envía a B mientras B envía a A, cada transferencia bloquea a un usuario distinto y después las cuentas en el mismo orden. Con muchas transferencias desde la misma cuenta, el bloqueo explícito las pone en fila de forma predecible.

**Alternativa descartada:** `SERIALIZABLE` con reintentos ante `40001`. Con contención máxima sobre una cuenta, casi todas las transacciones abortan y se reintentan: la latencia y la tasa de fallos se vuelven impredecibles, y habría que manejar la llave de idempotencia entre reintentos.

---

## D-13 · Monto del límite diario y umbral del código

**Decisión**

- **Límite diario:** `5000000` centavos ($50,000.00) por usuario.
  - Solo cuentan las transferencias a tercero aplicadas (D-04, D-09).
  - Regla: `consumido + monto <= límite`. Llegar exactamente al límite está permitido.
- **Umbral del código:** una transferencia a tercero de más de `1000000` centavos ($10,000.00) exige código (`>` estricto, porque el enunciado dice "supera").
- Los traspasos no piden código ni cuentan para el límite.
- Monto mínimo de 1 centavo: `CHECK (monto_centavos > 0)` en `transferencia`. No hay máximo por transferencia; el límite diario y el saldo ya lo acotan.
- **Configuración:**
  - Variables de entorno en centavos enteros: `LIMITE_DIARIO_CENTAVOS` y `UMBRAL_CODIGO_CENTAVOS`.
  - Al arrancar se validan con Zod: deben ser enteros positivos seguros y el umbral debe ser menor que el límite. Si no, la API no arranca.
  - Nunca se configuran en pesos con decimales.
- `GET /limites` devuelve el límite, lo consumido hoy y lo disponible, para que web y móvil no recalculen.
- El seed incluye usuarios de prueba con saldos que permiten demostrar en el video los cuatro casos:
  - transferencia normal;
  - transferencia con código;
  - saldo insuficiente;
  - límite diario excedido. Para este caso, un usuario necesita saldo mayor que el límite.

**Motivo:** son valores globales en centavos, con una sola fuente de configuración validada al arrancar. Las pruebas pueden usar montos pequeños sin tocar el código.

**Alternativa descartada:** un límite por usuario guardado en `usuario.limite_diario_centavos`. Es más realista, pero sin un proceso para cambiarlo es configuración disfrazada. Va en "qué haría con más tiempo".

---

## D-14 · Estados de una transferencia

**Decisión**

- **Estados:** `PENDIENTE_CONFIRMACION`, `APLICADA` y `RECHAZADA`. `APLICADA` y `RECHAZADA` son terminales.
- **Transiciones:**
  - Al crear sin código: `APLICADA` o `RECHAZADA`.
  - Al crear una transferencia a tercero que supera el umbral: `PENDIENTE_CONFIRMACION`.
  - Desde `PENDIENTE_CONFIRMACION`: `APLICADA` o `RECHAZADA`.
- `motivo_rechazo` es obligatorio si y solo si el estado es `RECHAZADA`. Valores: `SALDO_INSUFICIENTE`, `LIMITE_DIARIO_EXCEDIDO`, `CODIGO_AGOTADO` y `CODIGO_EXPIRADO`.
- No hay estado `PROCESANDO`: la transferencia se aplica en una sola transacción, así que nunca sería observable.
- Una pendiente no reserva saldo ni límite. Al confirmar se vuelve a validar todo, y puede terminar `RECHAZADA` por saldo o por límite aunque el código sea correcto.
- **Expiración perezosa, sin proceso en segundo plano:** la petición que toca una pendiente vencida, ya sea al confirmar o al consultar su estado, la pasa a `RECHAZADA/CODIGO_EXPIRADO` respetando el orden de bloqueo de D-12.
- **La base hace cumplir la máquina de estados:**
  - Un trigger `BEFORE UPDATE` en `transferencia` solo permite `PENDIENTE_CONFIRMACION → APLICADA | RECHAZADA`.
  - Monto, origen, destino, tipo, llave y hash son inmutables.
- **Suma cero:** `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`, evaluado al confirmar la transacción.
  - `APLICADA` ⇒ exactamente 2 asientos que suman 0.
  - Cualquier otro estado ⇒ 0 asientos.
  - Solo se insertan asientos para transferencias `APLICADA`.
- **Respuestas HTTP** (idénticas al repetir con la misma llave, D-03):
  - `201`: aplicada, con el comprobante.
  - `202`: pendiente, con el id de la transferencia y la expiración del código; repetir no genera un código nuevo.
  - `422`: rechazada, con un problem cuyo `type` es el motivo y que incluye `transferenciaId`.
- **Errores previos a crear la fila (no son motivos de rechazo):**
  - Transferir a la misma cuenta (origen = destino) responde `422` **antes** de crear la fila de transferencia. `CHECK (cuenta_origen_id <> cuenta_destino_id)` en `transferencia` lo garantiza en la base.
  - El destino solo puede ser un beneficiario del usuario o una cuenta propia. Un destino ajeno o inexistente responde `404 not-found`, idéntico en ambos casos (D-10).
  - Estas peticiones no crean fila; el alcance de D-03 ("los rechazos de negocio se guardan") se limita a los cuatro motivos anteriores.
- _Precisada durante la fase de requisitos (R-4.6):_ la primera versión respondía `422` para un destino inexistente o fuera de la plataforma. Esa diferencia frente al `404` de un recurso ajeno permitía averiguar qué identificadores de cuenta existen.

**Motivo:** cada estado es observable y distinto, sin transiciones de más que probar. La base impide estados ilegales y asientos fuera de lugar, y la expiración perezosa evita un proceso en segundo plano sin perder el estado real.

**Alternativa descartada:** estados finos (`CREADA`, `PROCESANDO`, `FALLIDA`, `EXPIRADA`, `CANCELADA`). Algunos nunca serían observables y otros son rechazos con otro nombre.

---

## D-15 · Día del límite: zona horaria y medianoche

**Decisión**

- **Zona horaria del sistema:** `America/Mexico_City`, siempre como zona con nombre y nunca como desfase fijo `-06:00`.
- Todas las marcas de tiempo se guardan en `timestamptz` (UTC); la zona solo se usa para calcular ventanas.
- El día es `[00:00, 24:00)` en hora local, calculado en SQL: `date_trunc('day', $ahora AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City'`.
- **Para el límite cuenta `aplicada_en`, no `creado_en`.** Una pendiente creada a las 23:58 y confirmada a las 00:01 cuenta en el día nuevo y se valida contra el límite de ese día (D-14).
- `$ahora` sale de un puerto `Reloj` inyectable. En producción toma la hora de la base; en las pruebas se fija en 23:59:59.999999 y en 00:00:00 para probar los dos lados de la medianoche.
- La misma ventana local se usa para el filtro de fechas del historial (D-11) y el mes del estado de cuenta CSV (D-08).

**Motivo:** el usuario sabe exactamente cuándo se le reinicia el límite, que es a la medianoche de su hora local. Contar por `aplicada_en` refleja cuándo salió realmente el dinero, y el reloj inyectable permite probar el borde sin esperar.

**Alternativas descartadas:**
- Ventana rodante de 24 horas: el usuario no puede saber cuándo se le libera el límite, y el enunciado pide un límite diario.
- Día en UTC: el límite se reiniciaría a las 18:00, hora de México.

---

## D-16 · Doble clic y ciclo de vida de la llave en web

**Decisión**

- **El intento nace en la pantalla de confirmación.** Ahí se congelan los datos (origen, destino, monto en centavos, concepto, referencia) y se genera una llave con `crypto.randomUUID()`.
- **Mientras la petición está en vuelo:** el botón "Enviar" se deshabilita con `aria-busy` y la mutación ignora cualquier segundo disparo, sea clic o Enter.
- **Errores y reintentos:**
  - Error de red, timeout o `503`: "Reintentar" reusa la misma llave.
  - Respuesta `201`, `202` o `422` de negocio: el intento terminó. Un nuevo envío exige volver al formulario y genera una llave nueva.
  - Si el usuario cambia cualquier dato, se descarta la llave.
- **Recarga a mitad de la petición:**
  - El intento en vuelo, es decir la llave y el cuerpo, se guarda en `sessionStorage` hasta que se resuelve. No contiene tokens (D-06).
  - Al recargar, la app muestra "Verificando operación anterior…" y reenvía con la misma llave antes de permitir otro envío.
- Al cerrar sesión se borra el intento guardado en `sessionStorage`.
- **Pruebas con Testing Library:**
  - simular doble clic y Enter, y verificar que sale una sola petición;
  - verificar que al cerrar sesión se borra el intento guardado.

**Motivo:** la llave representa exactamente "esta operación con estos datos". Reintentar no puede duplicar dinero, cambiar los datos no choca con la llave anterior, y una recarga no abre la puerta a un segundo envío.

**Alternativa descartada:** generar la llave al montar el formulario y guardarla solo en memoria. La llave sobreviviría a cambios de monto (`422 idempotency-key-reused`), y una recarga a mitad de la petición permitiría un duplicado real.

---

## D-17 · Red perdida a mitad de una transferencia en móvil

**Decisión**

- **El intento nace al confirmar,** con los datos congelados y una llave `Crypto.randomUUID()` de `expo-crypto`.
- **Se guarda en `expo-secure-store`** (llave, cuerpo e id del usuario) hasta que se resuelve.
  - Nunca va a `AsyncStorage`.
  - Se borra al cerrar sesión.
  - Solo se resuelve si pertenece al usuario autenticado.
- **Timeout del cliente de 15 s**, mayor que el `statement_timeout` de 10 s del servidor (D-12).
- **Si se pierde la red o se agota el timeout:**
  - La pantalla pasa a "Verificando estado de tu transferencia…"; nunca muestra "falló".
  - Reintenta automáticamente el mismo POST con la misma llave, con espera exponencial de 1, 2, 4, 8 y 16 s, y reintenta en cuanto `NetInfo` detecta que volvió la conexión.
  - Si el access expiró, pasa por el refresh de una sola promesa (D-05).
- Se reenvía el mismo POST y no se consulta un GET: si la primera petición nunca llegó, el POST la crea; si llegó, devuelve el resultado guardado (D-03).
- **Si se agotan los reintentos:** la pantalla muestra "Estado desconocido" con un solo botón, "Verificar de nuevo", que usa la misma llave. No se puede iniciar otra transferencia mientras haya un intento sin resolver.
- **Al abrir la app con un intento pendiente,** primero se resuelve y después se muestra el saldo.
- **Estados finales:** `201` muestra el comprobante, `202` la captura del código y `422` el rechazo con su motivo. Después se borra el intento.
- **Demostración en el video:**
  - `DEMO_LATENCIA_MS`, una variable solo de desarrollo, hace que la API espere después de confirmar la transacción y antes de responder. Así se puede activar el modo avión justo en ese momento.
  - La API se niega a arrancar si esa variable está activa con `NODE_ENV=production`.
- **Prueba:** fetch simulado que falla dos veces y luego responde `201`; se verifica que las tres peticiones llevan la misma llave.

**Motivo:** el usuario siempre ve el resultado real de su operación, aunque se corte la red o el sistema mate la app, y reintentar nunca duplica dinero.

**Alternativa descartada:** una cola offline que envía la transferencia cuando vuelve la red. El dinero se movería después, sin que el usuario lo esté viendo, y con un saldo y un límite que pudieron cambiar.

---

## D-18 · Montos sin redondeo: captura, transporte y presentación

**Decisión:** en el sistema no existe ninguna operación de redondeo.

1. **Captura.** Un solo parser, `montoTextoACentavos`, vive en `packages/shared` y lo usan web, móvil y el esquema Zod. Procesa el texto sin multiplicar.
   - Acepta `$` opcional, espacios, separadores de miles `,` bien agrupados y un `.` con 1 o 2 decimales.
   - Rechaza, sin truncar ni redondear: más de 2 decimales ("Máximo 2 decimales"), negativos, cero, notación exponencial, comas mal agrupadas y montos mayores que el tope.
   - Pruebas unitarias con casos como `"1.15"` → `115`, `"0.1"` → `10`, `"0.10"` → `10`, `"1,000"` → `100000` y `"10.999"` → error.
2. **Transporte.** La API solo recibe `monto_centavos` como entero JSON: `z.number().int().positive()` con un tope de `100000000000` centavos.
3. **Driver.** Un parser de `int8` en `pg` convierte a `Number` solo si `Number.isSafeInteger`; si no, lanza un error. Nunca pierde precisión en silencio.
4. **Presentación.** `formatearMXN(centavos)` separa pesos y centavos **sobre el texto del entero** (los últimos 2 dígitos son centavos), sin operaciones aritméticas.
   - Cubre montos negativos del historial, cuyo signo se separa antes, y montos menores a $1.00 (`5` → `$0.05`).
   - Los pesos se formatean con `Intl.NumberFormat('es-MX', {style: 'currency', currency: 'MXN'}).formatToParts(...)`, reemplazando la parte `fraction` por los centavos exactos.
   - El CSV (D-08) usa la misma separación.
5. **Hermes.** El soporte de `formatToParts` en Hermes (Expo) se verifica en la primera tarea móvil. Si no está soportado, se usa un formateo manual de miles que da el mismo resultado que en web y se prueba con los mismos casos.
6. **Lint.** Se prohíbe `parseFloat` y `/ 100` sobre montos en `web`, `mobile` y `shared`, con `no-restricted-syntax`, o con una revisión documentada si la regla resulta ruidosa.

**Motivo:** procesar texto y enteros evita cualquier float en el camino del dinero. Los errores de redondeo no se corrigen con `Math.round`: se vuelven imposibles por construcción.

**Alternativa descartada:** `Math.round(parseFloat(texto) * 100)` para capturar y `format(centavos / 100)` para mostrar. Casi siempre funciona, pero falla en casos como `1.005 * 100 = 100.49999…`, y el enunciado prohíbe los cálculos con float en el cliente.

---

## D-19 · Alta de beneficiario y validación de CLABE

**Decisión**

- **Validación en orden:**
  1. la CLABE tiene 18 dígitos;
  2. el dígito verificador es correcto;
  3. la CLABE pertenece a una cuenta de usuario de la plataforma. Si no, `422 clabe-not-found`. Fondeo nunca se puede registrar (D-02).
- **Dígito verificador:**
  - Los primeros 17 dígitos se multiplican por los pesos 3, 7, 1 en ciclo, y cada producto se toma módulo 10.
  - El dígito es `(10 - (suma % 10)) % 10`.
  - Vive en `packages/shared`, con pruebas unitarias de CLABEs válidas e inválidas. Incluye una CLABE cuya suma ponderada termina en 0, para verificar que el dígito resultante es 0 y no 10.
- La respuesta no revela el nombre del titular; el nombre del beneficiario es el que escribe el usuario.
- El alta de beneficiarios tiene rate limit por usuario (por ejemplo, 10 por hora) para que no sirva como oráculo de qué CLABEs existen.
- Unicidad: `UNIQUE (usuario_id, clabe)` y `UNIQUE (usuario_id, lower(alias))`.
- El beneficiario guarda `cuenta_id` (FK `NOT NULL`, resuelto en el alta) además de la `clabe`. La transferencia usa `cuenta_id` y la clasifica por el dueño real (D-04).
- Se permite registrar como beneficiario una CLABE propia; la transferencia resulta en un `TRASPASO` (D-09).
- Las CLABEs de la plataforma se generan con un código de banco ficticio fijo, más plaza, número de cuenta y un dígito verificador válido, así que el seed pasa la misma validación.

**Motivo:** el enunciado limita las transferencias a la misma plataforma. Rechazar en el alta evita beneficiarios que nunca funcionarían y que el error aparezca justo al enviar dinero.

**Alternativa descartada:** aceptar cualquier CLABE válida y fallar al transferir si no está en la plataforma. Sirve mejor para conectarse a SPEI en el futuro, pero en esta prueba deja beneficiarios que nunca funcionan.

---

## D-20 · Cuentas al registrarse y primer saldo

**Decisión**

- Al registrarse se crean dos cuentas, `Principal` y `Ahorro`, en la misma transacción que el usuario. Cada una tiene una CLABE generada con dígito verificador válido (D-19) y saldo 0.
- No hay endpoint para abrir más cuentas; va en "qué haría con más tiempo".
- **Fondeo de bienvenida:**
  - El registro hace una transferencia `FONDEO` normal hacia `Principal`, con dos asientos, auditoría y depósito en el historial (D-02), solo si `FONDEO_BIENVENIDA_CENTAVOS > 0`. Se hace dentro de la misma transacción.
  - La variable está en centavos y se valida al arrancar. `.env.example` de desarrollo trae `1000000`; en producción debe ser 0, o la API no arranca.
- El fondeo respeta el orden de bloqueo de D-12: primero el usuario recién insertado y después las cuentas por `id` ascendente, incluida Fondeo.
- Los usuarios demo del seed (D-13) reciben sus saldos por el mismo camino, con transferencias `FONDEO`. No existe ningún camino que escriba saldos directamente.
- El registro tiene rate limit, igual que el login.
- Punto caliente conocido: todo fondeo bloquea la fila de Fondeo, así que los registros simultáneos hacen fila. Se documenta en el escenario ×100 de `docs/aws-deploy.md`, con varias subcuentas de fondeo como opción.

**Motivo:** con dos cuentas desde el registro, HU-2 y HU-4 se pueden demostrar sin pantallas extra. Que el primer saldo use el mismo camino que cualquier fondeo mantiene la regla de suma cero y la invariante global sin excepciones.

**Alternativa descartada:** una sola cuenta al registrarse, más un endpoint y una pantalla "Abrir cuenta". Agrega alcance que el enunciado no pide, y un usuario recién registrado no podría demostrar HU-4 sin un paso previo.
