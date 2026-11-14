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
- Lo consumido es `SUM(monto_centavos)` de las transferencias aplicadas del usuario dentro del día. La ventana del día se define en la decisión sobre medianoche.
- No cuentan para el límite:
  - las transferencias `FONDEO` (D-02);
  - las transferencias entre cuentas del mismo usuario, porque el dinero no sale de su control;
  - las transferencias rechazadas (D-03).
- Una transferencia es "entre cuentas propias" según el dueño real de la cuenta destino al momento de aplicarla, no según cómo se eligió el destino. Un beneficiario cuya CLABE apunta a una cuenta del mismo usuario cuenta como transferencia entre cuentas propias.
- Un índice parcial sobre `(usuario_id, creado_en)` filtra solo las transferencias que cuentan. El predicado exacto se cierra con el catálogo de tipos de transferencia.
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
- `POST /transferencias/{id}/confirmar` valida que la transferencia sea del usuario, bloquea la fila del código y, si el código es correcto, aplica la transferencia con los bloqueos y la nueva revisión del límite de D-04.
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
- **Regla global:** ningún flujo del sistema puede bloquear una cuenta antes que un usuario, ni bloquear cuentas en otro orden que no sea `id` ascendente. Cualquier operación nueva que bloquee filas debe respetar este orden.
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
