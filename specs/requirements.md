# Requisitos — Billetera digital MXN

Fase 1 del flujo spec-driven (Requisitos → Diseño → Tareas). Insumos: `docs/enunciado.md`, `specs/esqueleto.md`, `specs/decisiones.md` (D-01 a D-20) y `GLOSSARY.md`.

Este documento dice **qué** debe cumplir el sistema. El **cómo** (esquema, OpenAPI, componentes) va en `design.md`. Solo aparecen detalles de implementación que ya están cerrados en `decisiones.md`, y cada criterio cita la decisión que lo sustenta.

---

## 1. Convenciones

### 1.1 Formato de los criterios

Los criterios usan EARS en español:

| Patrón | Forma |
|---|---|
| Ubicuo | El sistema DEBE … |
| Evento | CUANDO \<evento\>, el sistema DEBE … |
| Condición no deseada | SI \<condición\>, ENTONCES el sistema DEBE … |
| Estado | MIENTRAS \<estado\>, el sistema DEBE … |
| Opcional | DONDE \<característica\>, el sistema DEBE … |

Los casos borde con valores concretos se escriben además como escenarios **Dado / Cuando / Entonces**, para que se traduzcan directo a pruebas.

### 1.2 Identificadores

- `R-<historia>.<n>`: criterio de aceptación de una historia (`R-4.3`, `R-B1.2`).
- `RNF-<nn>`: requisito no funcional.
- `CB-<n>`: caso borde del enunciado; cada uno apunta a los criterios que lo cubren (sección 10).
- `D-<nn>`: decisión de `decisiones.md`.

`tasks.md` y los mensajes de commit citan estos IDs.

### 1.3 Actores y sujetos

- **Usuario**: persona registrada en la plataforma.
- **La API**: el backend. **La web**: el panel React. **La app móvil**: la app React Native.
- **El sistema**: cualquiera de los anteriores cuando el criterio aplica a todos.

### 1.4 Valores de referencia

Todos los montos están en **centavos enteros** (D-18).

| Parámetro | Valor | Decisión |
|---|---|---|
| Límite diario por usuario | `5000000` ($50,000.00) | D-13 |
| Umbral de código | más de `1000000` ($10,000.00), estricto | D-13 |
| Monto mínimo por transferencia | `1` | D-13 |
| Tope de monto en transporte | `100000000000` | D-18 |
| Vigencia del código | 5 minutos, 6 dígitos, máximo 3 intentos fallidos | D-07 |
| Access token / refresh token | 15 minutos / 7 días | D-05 |
| Zona horaria del sistema | `America/Mexico_City` | D-15 |
| Página del historial | 20 por defecto, 100 máximo | D-11 |
| Fondeo de bienvenida (desarrollo) | `1000000`; en producción `0` | D-20 |

---

## 2. HU-1 · Registro e inicio de sesión

**Historia:** Como usuario, quiero registrarme e iniciar sesión, para acceder a mis cuentas de forma segura.

**Criterios de aceptación**

- **R-1.1** CUANDO un visitante se registra con un correo y una contraseña válidos, la API DEBE crear, en una sola operación atómica, el usuario y dos cuentas `Principal` y `Ahorro`, cada una con saldo 0 y una CLABE con dígito verificador válido. _(D-20, D-19)_
- **R-1.2** CUANDO el registro se completa y `FONDEO_BIENVENIDA_CENTAVOS` es mayor que 0, la API DEBE acreditar ese monto a `Principal` con un depósito (transferencia `FONDEO` de Fondeo a `Principal`, con dos asientos que suman cero), dentro de la misma operación atómica del registro, y registrar el evento de auditoría del fondeo. _(D-20, D-02)_
- **R-1.3** SI falla cualquier paso del registro, ENTONCES la API NO DEBE dejar usuario, cuentas, asientos ni eventos de auditoría parciales. _(D-20)_
- **R-1.4** SI el correo ya está registrado, ENTONCES la API DEBE rechazar el registro con un error RFC 7807 y no crear nada. _(RNF-01)_
- **R-1.5** SI el correo o la contraseña no pasan la validación de esquema, ENTONCES la API DEBE responder con un error de validación RFC 7807 que señale el campo. _(RNF-01)_
- **R-1.6** CUANDO un usuario inicia sesión con credenciales correctas, la API DEBE emitir un access token con vigencia de 15 minutos y un refresh token con vigencia de 7 días, perteneciente a una familia de sesión nueva. _(D-05)_
- **R-1.7** SI las credenciales son incorrectas, ENTONCES la API DEBE responder `401` con el mismo problem tanto si el correo no existe como si la contraseña es incorrecta. _(mismo principio que D-10: no revelar existencia)_
- **R-1.8** CUANDO un cliente presenta un refresh token válido y no usado, la API DEBE marcarlo como usado y emitir un access token y un refresh token nuevos en la misma familia. _(D-05)_
- **R-1.9** SI se presenta un refresh token ya usado, ENTONCES la API DEBE revocar toda su familia, registrar el evento de auditoría `refresh-reuse-detected` y responder `401`. _(D-05)_
- **R-1.10** SI el refresh token está expirado, revocado o no existe, ENTONCES la API DEBE responder `401`. _(D-05)_
- **R-1.11** SI una petición a un recurso protegido llega sin access token válido, ENTONCES la API DEBE responder `401`. _(D-05)_
- **R-1.12** CUANDO el usuario cierra sesión, la API DEBE revocar la familia de sesión; la web DEBE borrar la cookie de refresh y el intento de transferencia guardado en `sessionStorage`; la app móvil DEBE borrar el refresh y el intento pendiente de `expo-secure-store`. _(D-05, D-06, D-16, D-17)_
- **R-1.13** La web DEBE recibir el refresh token solo en una cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`, y DEBE guardar el access token solo en memoria. La API NUNCA DEBE devolverle el refresh token a la web en el cuerpo de una respuesta. _(D-06)_
- **R-1.14** CUANDO se recarga la página, la web DEBE obtener un access token nuevo con `POST /api/auth/refresh` antes de mostrar datos protegidos; SI el refresh falla, ENTONCES DEBE mostrar el login. _(D-06)_
- **R-1.15** MIENTRAS haya varias pestañas abiertas, la web DEBE coordinar el refresh con la Web Locks API para que solo una pestaña rote el token a la vez, y la rotación NO DEBE provocar una falsa detección de reúso. _(D-05, D-06)_
- **R-1.16** SI una petición de refresh por cookie no trae el header `X-Requested-With`, ENTONCES la API DEBE rechazarla. _(D-06)_
- **R-1.17** La app móvil DEBE enviar el refresh token en el cuerpo de la petición de refresh y DEBE tener como máximo una petición de refresh en vuelo; las peticiones concurrentes esperan esa misma promesa. _(D-05, D-06)_
- **R-1.18** SI se excede el rate limit de intentos de login o de registros, ENTONCES la API DEBE responder `429` con un problem RFC 7807 y no procesar la petición. _(D-20, RNF-04)_

---

## 3. HU-2 · Cuentas y saldo disponible

**Historia:** Como usuario, quiero ver mis cuentas con su saldo disponible, para saber cuánto dinero tengo.

**Criterios de aceptación**

- **R-2.1** CUANDO un usuario autenticado consulta sus cuentas, la API DEBE devolver solo las cuentas de ese usuario, cada una con su nombre, su CLABE y su saldo en centavos enteros. _(D-01, D-18, D-20)_
- **R-2.2** El saldo de cada cuenta DEBE ser igual, en todo momento, a la suma de sus asientos. _(D-01)_
- **R-2.3** La API NUNCA DEBE mostrar la cuenta Fondeo en una respuesta pública ni aceptarla en ninguna operación pública. _(D-02)_
- **R-2.4** SI un usuario pide una cuenta que no existe o que no es suya, ENTONCES la API DEBE responder `404` con el problem `not-found`, idéntico en ambos casos. _(D-10)_
- **R-2.5** La web y la app móvil DEBEN mostrar los saldos con `formatearMXN` en `es-MX`, sin aritmética de punto flotante. _(D-18)_

  | Centavos | Se muestra |
  |---|---|
  | `5` | `$0.05` |
  | `100` | `$1.00` |
  | `123456` | `$1,234.56` |
  | `-250` (historial) | `-$2.50` |

- **R-2.6** La pantalla de resumen de cuentas (web) y la de saldo (móvil) DEBEN contemplar los estados cargando, error y éxito. _(RNF-17)_

---

## 4. HU-3 · Alta de beneficiario con CLABE

**Historia:** Como usuario, quiero registrar un beneficiario con nombre, alias y CLABE de 18 dígitos, para enviarle dinero sin capturar sus datos cada vez.

**Criterios de aceptación**

- **R-3.1** CUANDO un usuario registra un beneficiario con nombre, alias y una CLABE válida que pertenece a una cuenta de usuario de la plataforma, la API DEBE crear el beneficiario ligado a esa cuenta. _(D-19)_
- **R-3.2** La API DEBE validar la CLABE en este orden y reportar el primer fallo: (1) 18 dígitos; (2) dígito verificador correcto; (3) pertenece a una cuenta de usuario de la plataforma. _(D-19)_
- **R-3.3** SI la CLABE no tiene exactamente 18 dígitos numéricos, ENTONCES el sistema DEBE rechazarla con un error de validación del campo. _(D-19)_
- **R-3.4** SI el dígito verificador no coincide, ENTONCES el sistema DEBE rechazar la CLABE con un error de validación del campo. El dígito se calcula multiplicando los primeros 17 dígitos por los pesos 3, 7, 1 en ciclo, tomando cada producto módulo 10, y aplicando `(10 - (suma % 10)) % 10`. _(D-19)_
  - Dado una CLABE cuya suma ponderada termina en 0, Cuando se valida, Entonces el dígito verificador esperado es `0` (no `10`).
- **R-3.5** SI la CLABE es válida pero no pertenece a ninguna cuenta de usuario de la plataforma, incluida Fondeo, ENTONCES la API DEBE responder `422` con el problem `clabe-not-found`. _(D-19, D-02)_
- **R-3.6** La respuesta del alta NUNCA DEBE revelar el nombre del titular de la cuenta; el nombre del beneficiario es el que captura el usuario. _(D-19)_
- **R-3.7** SI el usuario ya tiene un beneficiario con esa CLABE, o con ese alias sin distinguir mayúsculas y minúsculas, ENTONCES la API DEBE rechazar el alta con un error RFC 7807. _(D-19)_
- **R-3.8** CUANDO la CLABE pertenece a una cuenta del mismo usuario, la API DEBE permitir el alta; las transferencias a ese beneficiario son traspasos (R-4.5). _(D-19, D-09)_
- **R-3.9** SI un usuario excede el rate limit de altas de beneficiario (del orden de 10 por hora), ENTONCES la API DEBE responder `429` con un problem RFC 7807. _(D-19)_
- **R-3.10** La web DEBE validar longitud y dígito verificador antes de enviar el formulario, con la misma función que usa la API. _(D-19, RNF-18)_
- **R-3.11** CUANDO un usuario consulta sus beneficiarios, la API DEBE devolver solo los suyos; SI pide un beneficiario ajeno o inexistente, ENTONCES DEBE responder `404`. _(D-10)_
- **R-3.12** Toda CLABE generada por la plataforma (registro y seed) DEBE pasar la misma validación de R-3.2. _(D-19)_

---

## 5. HU-4 · Envío de transferencia

**Historia:** Como usuario, quiero enviar una transferencia a un beneficiario o a otra cuenta mía, con concepto y referencia numérica, para mover mi dinero con un comprobante.

### 5.1 Aplicación y clasificación

- **R-4.1** CUANDO un usuario envía una transferencia desde una cuenta propia hacia un beneficiario suyo o hacia otra cuenta propia, con monto en centavos, concepto, referencia numérica y header `Idempotency-Key`, y la transferencia no requiere código, hay saldo suficiente y no se excede el límite diario, ENTONCES la API DEBE, en una sola operación atómica: crear la transferencia en estado `APLICADA`, insertar dos asientos que suman cero, disminuir el saldo origen y aumentar el saldo destino en el monto exacto, y responder `201` con el comprobante. _(D-01, D-14)_
- **R-4.2** Al aplicar una transferencia, la API DEBE clasificarla según el dueño real de la cuenta destino en ese momento: `TRASPASO` si es del mismo usuario, `TERCERO` si es de otro. Los asientos DEBEN registrar `ENVIO`/`RECEPCION` para un `TERCERO` y `TRASPASO_SALIDA`/`TRASPASO_ENTRADA` para un `TRASPASO`. _(D-04, D-09)_
- **R-4.3** SI la cuenta origen no tiene saldo suficiente, ENTONCES la API NO DEBE mover dinero, DEBE guardar la transferencia como `RECHAZADA` con motivo `SALDO_INSUFICIENTE` y DEBE responder `422` con un problem cuyo `type` es el motivo y que incluye `transferenciaId`. _(D-03, D-12, D-14)_
- **R-4.4** SI la cuenta origen y la cuenta destino son la misma, ENTONCES la API DEBE responder `422` antes de crear la transferencia, y la base de datos DEBE impedir esa transferencia aunque el código no la valide. _(D-14)_
- **R-4.5** CUANDO la cuenta destino pertenece al mismo usuario, ya sea elegida como cuenta propia o mediante un beneficiario cuya CLABE es propia, la API DEBE tratarla como traspaso: no pide código y no cuenta para el límite diario. _(D-04, D-09, D-13, D-19)_
- **R-4.6** El destino de una transferencia DEBE ser un beneficiario del usuario o una cuenta propia. SI la cuenta origen, la cuenta destino o el beneficiario indicados no existen o no son del usuario, ENTONCES la API DEBE responder `404` con el problem `not-found`, idéntico en ambos casos, sin crear la transferencia. El `422` previo a crear la transferencia queda solo para origen = destino (R-4.4). _(D-10; precisa D-14, que respondía `422` para un destino inexistente)_
- **R-4.7** La API NUNCA DEBE aceptar la cuenta Fondeo como origen ni como destino. _(D-02)_
- **R-4.8** SI el monto no es un entero JSON entre 1 y `100000000000` centavos, ENTONCES la API DEBE responder con un error de validación y no crear la transferencia. _(D-13, D-18)_
- **R-4.9** SI la referencia contiene caracteres no numéricos, o falta el concepto, ENTONCES el sistema DEBE rechazar la petición con un error de validación del campo. _(enunciado HU-4; longitudes en design.md)_
- **R-4.10** CUANDO un usuario consulta una transferencia propia por su id, la API DEBE devolver su estado real; SI es ajena o no existe, ENTONCES DEBE responder `404`. _(D-10, D-14)_
- **R-4.11** CUANDO la transferencia termina `APLICADA`, la web DEBE mostrar un comprobante con los datos de la transferencia; la app móvil DEBE mostrarlo también. _(D-14, D-17)_
- **R-4.12** CUANDO la API responde `422` con `SALDO_INSUFICIENTE`, la web y la app móvil DEBEN mostrar el motivo del rechazo en lenguaje claro y NO DEBEN mostrar un comprobante. _(D-14, D-17)_

### 5.2 Idempotencia

- **R-4.13** SI la petición no trae el header `Idempotency-Key` con un UUID, ENTONCES la API DEBE rechazarla con un error de validación y no crear la transferencia. _(D-03)_
- **R-4.14** CUANDO llega una petición con una llave ya usada por el mismo usuario y el mismo cuerpo normalizado, la API DEBE devolver el mismo código HTTP y el mismo cuerpo que la primera vez, sin mover dinero. Aplica también a los rechazos de negocio y a las pendientes, sin generar un código nuevo. _(D-03, D-14)_
- **R-4.15** SI llega una llave ya usada por el mismo usuario con un cuerpo distinto, ENTONCES la API DEBE responder `422` con el problem `idempotency-key-reused` y no mover dinero. _(D-03)_
- **R-4.16** CUANDO llegan simultáneamente dos peticiones con la misma llave y el mismo cuerpo, la API DEBE crear una sola transferencia y responder a ambas con el mismo resultado. _(D-03)_
- **R-4.17** La llave de idempotencia DEBE ser única por usuario: la misma llave usada por dos usuarios distintos produce dos transferencias independientes. _(D-03)_

### 5.3 Concurrencia

- **R-4.18** CUANDO un mismo usuario lanza transferencias simultáneas, incluso desde cuentas distintas, la API DEBE serializarlas de modo que ninguna combinación deje un saldo negativo ni rebase el límite diario. _(D-04, D-12)_
- **R-4.19** SI la API no obtiene los bloqueos en 5 s o la operación excede 10 s, ENTONCES DEBE responder `503` con un problem `retryable` y no mover dinero; un reintento con la misma llave DEBE completar la operación una sola vez. _(D-12, D-03)_

### 5.4 Doble clic y reintentos en web (CB-1)

- **R-4.20** CUANDO el usuario pasa del formulario a la pantalla de confirmación, la web DEBE congelar los datos (origen, destino, monto en centavos, concepto, referencia) y generar una llave nueva con `crypto.randomUUID()` para ese intento. _(D-16)_
- **R-4.21** MIENTRAS la petición está en vuelo, la web DEBE deshabilitar "Enviar" con `aria-busy` e ignorar cualquier segundo disparo, sea clic o Enter. _(D-16)_
  - Dado la pantalla de confirmación, Cuando el usuario hace doble clic en "Enviar" o presiona Enter dos veces, Entonces sale exactamente una petición.
- **R-4.22** SI la petición falla por red, por timeout o con `503`, ENTONCES la web DEBE ofrecer "Reintentar" con la misma llave y los mismos datos. _(D-16)_
- **R-4.23** CUANDO la API responde `201`, `202` o `422` de negocio, la web DEBE dar el intento por terminado; un nuevo envío exige volver al formulario y genera una llave nueva. _(D-16)_
- **R-4.24** CUANDO el usuario modifica cualquier dato del intento, la web DEBE descartar la llave. _(D-16)_
- **R-4.25** MIENTRAS un intento está en vuelo, la web DEBE guardarlo (llave y cuerpo, sin tokens) en `sessionStorage`. CUANDO la página se recarga con un intento guardado, la web DEBE mostrar "Verificando operación anterior…" y reenviarlo con la misma llave antes de permitir otro envío. _(D-16, D-06)_

### 5.5 Red perdida en móvil (CB-2)

- **R-4.26** La app móvil DEBE permitir transferir solo a un beneficiario ya registrado. _(enunciado, Fase 3 móvil)_
- **R-4.27** CUANDO el usuario confirma una transferencia, la app móvil DEBE congelar los datos, generar una llave con `Crypto.randomUUID()` de `expo-crypto` y guardar el intento (llave, cuerpo e id del usuario) en `expo-secure-store` hasta que se resuelva. _(D-17)_
- **R-4.28** SI se pierde la conexión o pasan 15 s sin respuesta, ENTONCES la app móvil DEBE mostrar "Verificando estado de tu transferencia…", NUNCA "falló", y reenviar el mismo POST con la misma llave, esperando 1, 2, 4, 8 y 16 s entre intentos, y de inmediato cuando vuelva la conexión. _(D-17)_
  - Dado un servidor que no responde dos veces y a la tercera responde `201`, Cuando el usuario confirma una transferencia, Entonces las tres peticiones llevan la misma llave y la app muestra el comprobante.
- **R-4.29** SI el access token expira durante los reintentos, ENTONCES la app móvil DEBE refrescarlo (R-1.17) y continuar con la misma llave. _(D-05, D-17)_
- **R-4.30** SI se agotan los reintentos, ENTONCES la app móvil DEBE mostrar "Estado desconocido" con un solo botón, "Verificar de nuevo", que reenvía con la misma llave. MIENTRAS haya un intento sin resolver, la app NO DEBE permitir iniciar otra transferencia. _(D-17)_
- **R-4.31** CUANDO la app móvil se abre con un intento pendiente del usuario autenticado, DEBE resolverlo antes de mostrar el saldo; SI el intento pertenece a otro usuario, ENTONCES NO DEBE enviarlo. _(D-17)_
- **R-4.32** CUANDO la API responde `201`, `202` o `422`, la app móvil DEBE mostrar el comprobante, la captura del código o el rechazo con su motivo, respectivamente, y después borrar el intento guardado. _(D-17)_

### 5.6 Montos sin redondeo (CB-3)

- **R-4.33** La web y la app móvil DEBEN convertir el texto del monto a centavos con `montoTextoACentavos`, sin multiplicar ni redondear. _(D-18)_

  | Texto | Resultado |
  |---|---|
  | `"1.15"` | `115` |
  | `"0.1"` | `10` |
  | `"0.10"` | `10` |
  | `"1,000"` | `100000` |
  | `"$ 1,234.56"` | `123456` |
  | `"10.999"` | error "Máximo 2 decimales" |
  | `"0"`, `"-5"`, `"1e3"`, `"1,00"` | error |

- **R-4.34** SI el texto tiene más de 2 decimales, es negativo, es cero, usa notación exponencial, tiene comas mal agrupadas o supera el tope, ENTONCES el sistema DEBE rechazarlo sin truncarlo ni redondearlo. _(D-18)_
- **R-4.35** La API DEBE recibir el monto solo como `monto_centavos` entero (R-4.8). El sistema NO DEBE contener ninguna operación de redondeo de montos. _(D-18)_

---

## 6. HU-5 · Historial de movimientos

**Historia:** Como usuario, quiero consultar mi historial de movimientos con filtros por fecha y tipo, paginado, para revisar en qué se fue mi dinero.

**Criterios de aceptación**

- **R-5.1** CUANDO un usuario consulta los movimientos de una cuenta propia, la API DEBE devolverlos del más reciente al más antiguo, cada uno con su tipo de movimiento, monto con signo en centavos, fecha, concepto y referencia. _(D-09, D-11)_
- **R-5.2** La API DEBE devolver páginas de 20 movimientos por defecto y aceptar como máximo 100; SI el tamaño pedido está fuera de 1 a 100, ENTONCES DEBE responder con un error de validación. _(D-11)_
- **R-5.3** La respuesta DEBE tener la forma `{ items, siguienteCursor }`, con `siguienteCursor = null` en la última página. _(D-11)_
- **R-5.4** CUANDO el cliente pide la página siguiente con `siguienteCursor`, la API DEBE devolver los movimientos siguientes sin omitir ni repetir ninguno, aunque haya movimientos con la misma fecha y hora y aunque entren movimientos nuevos entre una página y otra. _(D-11)_
  - Dado una cuenta con varios movimientos con el mismo instante que caen en el borde de una página, Cuando se recorren todas las páginas, Entonces cada movimiento aparece exactamente una vez.
  - _Corregido durante la fase de diseño (`design.md` §8.3):_ el ejemplo original eran "los dos asientos de un traspaso", pero esos asientos caen en cuentas distintas y nunca aparecen juntos en el historial de una cuenta.
- **R-5.5** CUANDO se filtra por `desde` y `hasta`, la API DEBE interpretarlos como días calendario en `America/Mexico_City` e incluir los movimientos del rango `[desde 00:00, hasta + 1 día 00:00)`. SI `desde` es posterior a `hasta`, ENTONCES DEBE responder con un error de validación. _(D-11, D-15)_
- **R-5.6** CUANDO se filtra por tipo, la API DEBE aceptar `DEPOSITO`, `ENVIO`, `RECEPCION`, `TRASPASO_SALIDA` y `TRASPASO_ENTRADA`, y devolver solo los movimientos de ese tipo. _(D-09)_
- **R-5.7** SI el parámetro `cursor` viene vacío o tiene más de 512 caracteres, ENTONCES la API DEBE responder con un error de validación del parámetro (`validation-error`). SI el cursor no se puede decodificar o se generó con filtros distintos a los de la petición, ENTONCES la API DEBE responder `400` con el problem `invalid-cursor`. _(D-11)_
- **R-5.8** Las transferencias rechazadas y las pendientes de confirmación NO DEBEN aparecer en el historial de movimientos. _(D-09, D-14)_
- **R-5.9** El sistema DEBE presentar las entradas desde Fondeo como **Depósito**, nunca como transferencia. _(D-02, D-09)_
- **R-5.10** SI la cuenta consultada no existe o no es del usuario, ENTONCES la API DEBE responder `404`. _(D-10)_
- **R-5.11** La web DEBE ofrecer filtros por fecha y tipo y paginación hacia adelante, con estados cargando, vacío (sin movimientos o sin resultados para el filtro) y error. _(RNF-17)_
- **R-5.12** La app móvil DEBE mostrar los últimos 20 movimientos de la cuenta seleccionada. _(enunciado, Fase 3 móvil; D-11)_

---

## 7. HU-6 · Límite diario y código de un solo uso

**Historia:** Como usuario, quiero un límite diario de transferencias y confirmar con un código las operaciones grandes, para que nadie pueda vaciar mi cuenta aunque tome mi sesión.

### 7.1 Límite diario

- **R-6.1** La API DEBE permitir una transferencia a tercero solo si `consumido + monto <= 5000000`, donde "consumido" es la suma de las transferencias a tercero del usuario aplicadas dentro del día. Llegar exactamente al límite está permitido. _(D-04, D-13)_
  - Dado un consumido de `4000000`, Cuando el usuario envía `1000000` a un tercero, Entonces la transferencia se aplica y el disponible queda en 0.
- **R-6.2** SI la transferencia a tercero haría que el consumido supere el límite, ENTONCES la API DEBE guardarla como `RECHAZADA` con motivo `LIMITE_DIARIO_EXCEDIDO` y responder `422`, sin mover dinero. _(D-03, D-14)_
- **R-6.3** Los traspasos, los depósitos y las transferencias rechazadas o pendientes NO DEBEN contar para el límite diario. _(D-02, D-04, D-14)_
- **R-6.4** CUANDO un usuario lanza en paralelo transferencias a tercero desde dos cuentas distintas, la API NO DEBE permitir que juntas rebasen el límite. _(D-04)_

### 7.2 Límite que cruza medianoche (CB-4)

- **R-6.5** La API DEBE calcular el día del límite como `[00:00, 24:00)` en `America/Mexico_City`, con zona con nombre y nunca con un desfase fijo. _(D-15)_
- **R-6.6** Una transferencia DEBE contar para el día en que se aplicó (`aplicada_en`), no para el día en que se creó. _(D-15)_
  - Dado un usuario que agotó su límite con transferencias aplicadas a las 23:59:59.999999, Cuando envía una transferencia a tercero a las 00:00:00 del día siguiente, Entonces se evalúa contra un consumido de 0.
  - Dado una transferencia pendiente creada a las 23:58, Cuando se confirma a las 00:01, Entonces cuenta en el día nuevo y se valida contra el límite de ese día.
- **R-6.7** CUANDO un usuario consulta sus límites, la API DEBE devolver el límite, lo consumido hoy y lo disponible, para que web y móvil no lo recalculen. _(D-13)_

### 7.3 Código de un solo uso

- **R-6.8** CUANDO una transferencia a tercero supera `1000000` centavos, la API DEBE crearla en `PENDIENTE_CONFIRMACION`, generar un código de 6 dígitos con vigencia de 5 minutos y responder `202` con el id de la transferencia y la expiración del código, sin mover dinero ni reservar saldo o límite. _(D-07, D-13, D-14)_
  - Dado un monto de exactamente `1000000`, Cuando el usuario lo envía a un tercero, Entonces no se pide código.
- **R-6.9** Los traspasos NO DEBEN pedir código, sin importar el monto. _(D-13)_
- **R-6.10** CUANDO el usuario confirma con el código correcto y vigente, la API DEBE volver a validar saldo y límite con la hora de la confirmación y dejar la transferencia `APLICADA` (`201` con comprobante) o `RECHAZADA` por `SALDO_INSUFICIENTE` o `LIMITE_DIARIO_EXCEDIDO` (`422`). _(D-07, D-14)_
- **R-6.11** SI el código es incorrecto, ENTONCES la API DEBE contar el intento fallido de forma persistente, aunque la petición falle después, y registrar un evento de auditoría. SI es el tercer fallo, ENTONCES DEBE dejar la transferencia `RECHAZADA` con motivo `CODIGO_AGOTADO`. _(D-07, D-14)_
- **R-6.12** SI el código expiró, ENTONCES la primera petición que toque la transferencia, al confirmarla o al consultar su estado, DEBE dejarla `RECHAZADA` con motivo `CODIGO_EXPIRADO`, sin un proceso en segundo plano. _(D-14)_
- **R-6.13** CUANDO se confirma una transferencia que ya está `APLICADA`, la API DEBE devolver el mismo comprobante, sin error y sin consumir intentos (doble clic en "Confirmar"). _(D-07)_
- **R-6.14** SI se intenta confirmar una transferencia ajena o inexistente, ENTONCES la API DEBE responder `404`. _(D-07, D-10)_
- **R-6.15** CUANDO una transferencia termina rechazada por código, el sistema DEBE exigir un intento nuevo, con una llave nueva, para volver a enviarla. _(D-07, D-16)_
- **R-6.16** La comparación del código DEBE ser de tiempo constante, y el código NUNCA DEBE guardarse en claro ni escribirse en los logs. _(D-07)_
- **R-6.17** DONDE `OTP_SIMULADO=true`, la API DEBE devolver el código en el campo `codigoSimulado` de la respuesta `202`. SI `OTP_SIMULADO=true` y `NODE_ENV=production`, ENTONCES la API NO DEBE arrancar. _(D-07)_
- **R-6.18** CUANDO la API responde `202`, la web DEBE mostrar la pantalla de captura del código y la app móvil DEBE mostrar la captura del código. _(D-17, esqueleto §5)_

---

## 8. HU-B1 · Estado de cuenta mensual en CSV (bonus)

**Historia:** Como usuario, quiero descargar el estado de cuenta de un mes en CSV, para conservarlo o revisarlo en una hoja de cálculo.

**Criterios de aceptación**

- **R-B1.1** CUANDO un usuario pide el estado de cuenta de una cuenta propia para un mes `AAAA-MM`, la API DEBE devolver un CSV en UTF-8 con BOM con los movimientos del mes, calculado en `America/Mexico_City`. _(D-08, D-15)_
- **R-B1.2** Los montos del CSV DEBEN ir en pesos con dos decimales, derivados de los centavos enteros sin aritmética de punto flotante (`-5` → `-0.05`, `123456` → `1234.56`). _(D-08, D-18)_
- **R-B1.3** SI un campo de texto (concepto, nombre, alias) empieza con `=`, `+`, `-`, `@`, tabulador o retorno de carro, ENTONCES la API DEBE anteponerle un apóstrofo. Los campos de monto NO DEBEN alterarse. _(D-08)_
- **R-B1.4** SI la cuenta no existe o no es del usuario, ENTONCES la API DEBE responder `404`. _(D-08, D-10)_
- **R-B1.5** SI el mes no tiene el formato `AAAA-MM` o no es un mes válido, ENTONCES la API DEBE responder con un error de validación. _(D-08, RNF-01)_
- **R-B1.6** La web DEBE ofrecer un botón para descargar el estado de cuenta del mes elegido. _(D-08)_

---

## 9. Requisitos no funcionales

### Errores y validación

- **RNF-01** Todos los errores de la API DEBEN tener formato RFC 7807 (`type`, `title`, `status`, `detail`), con `type` estables (`not-found`, `idempotency-key-reused`, `invalid-cursor`, `clabe-not-found`, `retryable` y los motivos de rechazo), y NUNCA DEBEN incluir trazas, SQL, nombres de tablas ni otros detalles internos. Toda entrada se valida con esquema (Zod) antes de llegar a la lógica de dominio. _(enunciado Fase 2; D-03, D-11, D-12, D-14, D-19)_

### Autenticación y sesión

- **RNF-02** El access token DEBE ser un JWT de 15 minutos. El refresh token DEBE ser un valor aleatorio opaco de 256 bits, rotativo, con vigencia de 7 días, organizado en familias de sesión y guardado solo como SHA-256. _(D-05)_
- **RNF-03** Las contraseñas DEBEN guardarse con argon2 o bcrypt y NUNCA en claro. _(enunciado Fase 2)_
- **RNF-04** La API DEBE aplicar rate limit al login, al registro y al alta de beneficiarios; SI se excede, ENTONCES DEBE responder `429` con un problem RFC 7807. _(enunciado Fase 2; D-19, D-20)_
- **RNF-05** La web DEBE protegerse de CSRF con `SameSite=Strict`, CORS restringido al origen del panel y el header `X-Requested-With` en el refresh. NUNCA DEBE guardar tokens en `localStorage` ni en `sessionStorage`. _(D-06)_

### Integridad del dinero

- **RNF-06** La base de datos, y no solo el código, DEBE rechazar: un saldo negativo en una cuenta de usuario; una llave de idempotencia repetida para el mismo usuario; una transferencia aplicada cuyos asientos no sean exactamente dos que suman cero, o una no aplicada con asientos; una transición de estado distinta de `PENDIENTE_CONFIRMACION → APLICADA | RECHAZADA`; cambios en monto, origen, destino, tipo, llave o hash; `UPDATE` o `DELETE` de asientos; origen igual a destino; monto ≤ 0; un tipo de movimiento cuyo signo contradiga al monto; y referencias rotas (llaves foráneas). _(D-01, D-02, D-03, D-09, D-13, D-14)_
- **RNF-07** El sistema DEBE mantener dos invariantes verificables en todo momento: `saldo = SUM(asientos)` por cuenta y `SUM(saldo)` de todas las cuentas `= 0`. Ningún camino escribe saldos directamente. _(D-01, D-02, D-20)_
- **RNF-08** Las transferencias DEBEN ejecutarse en `READ COMMITTED` con bloqueo explícito, siguiendo el orden total **usuario → transferencia/código → cuentas por `id` ascendente** en todos los flujos, de modo que no ocurran deadlocks; si ocurre uno, se reintenta hasta 3 veces y se registra como `warn`. _(D-04, D-07, D-12)_
- **RNF-09** Todos los montos DEBEN manejarse como centavos enteros en todo el sistema. El driver NUNCA DEBE perder precisión en silencio al leer `int8`, y el lint DEBE prohibir `parseFloat` y `/ 100` sobre montos en `web`, `mobile` y `shared`. _(D-18)_
- **RNF-10** Todas las marcas de tiempo DEBEN guardarse en UTC; la zona `America/Mexico_City` solo se usa para calcular ventanas (día del límite, filtros de fecha, mes del CSV). La hora actual DEBE provenir de un reloj inyectable para poder probar la medianoche. _(D-15)_

### Auditoría y observabilidad

- **RNF-11** El sistema DEBE registrar en una tabla de auditoría de solo inserción, como mínimo: cada fondeo, cada transferencia aplicada o rechazada, cada intento fallido de código y cada detección de reúso de refresh. El usuario de base de datos de la aplicación NO DEBE tener permiso de `UPDATE` ni `DELETE` sobre esa tabla. _(enunciado Fase 2; D-02, D-05, D-07, D-09; esqueleto §4)_
- **RNF-12** La API DEBE emitir logs estructurados en JSON; cada línea de una petición DEBE incluir su request ID. Los logs NUNCA DEBEN contener contraseñas, access ni refresh tokens, cookies, el header `Authorization` ni códigos de un solo uso, y DEBEN enmascarar los demás datos sensibles. _(enunciado Fase 2; D-07)_

### Historial y rendimiento

- **RNF-13** El historial DEBE paginarse por cursor opaco y NUNCA con `OFFSET`. _(enunciado Fase 2; D-11)_
- **RNF-14** Con 100,000 movimientos o más en el seed, la consulta del historial, con y sin filtro de tipo, DEBE resolverse con un recorrido de índice, y `design.md` DEBE incluir su `EXPLAIN ANALYZE`. _(enunciado Fase 2; D-11)_

### Configuración y arranque

- **RNF-15** La API DEBE validar su configuración al arrancar y negarse a arrancar si: `LIMITE_DIARIO_CENTAVOS` o `UMBRAL_CODIGO_CENTAVOS` no son enteros positivos seguros, o el umbral no es menor que el límite; o si con `NODE_ENV=production` están activos `OTP_SIMULADO`, `DEMO_LATENCIA_MS` o un `FONDEO_BIENVENIDA_CENTAVOS` mayor que 0. _(D-07, D-13, D-17, D-20)_
- **RNF-16** El backend DEBE usar Node.js 20+, Express, PostgreSQL 15+, TypeScript estricto y TypeORM, con migraciones de TypeORM y `synchronize` desactivado; lo que TypeORM no cubre (triggers, `CHECK`, permisos) va como SQL dentro de las migraciones. La lógica financiera NO DEBE vivir en los handlers de Express. _(enunciado Fase 2; D-01)_

### Clientes

- **RNF-17** Cada pantalla de la web y de la app móvil DEBE contemplar los estados cargando, vacío (cuando aplique), error y éxito. _(enunciado Fase 3; esqueleto §5)_
- **RNF-18** Web, móvil y API DEBEN compartir tipos y validaciones (CLABE, monto) desde `packages/shared`, con tipos generados desde el contrato OpenAPI. _(enunciado Fase 3; D-18, D-19)_
- **RNF-19** La web DEBE ser accesible: todo flujo se completa solo con teclado, con foco visible; cada campo tiene una etiqueta asociada y sus errores se anuncian; el contraste de texto es suficiente (objetivo WCAG AA). _(enunciado Fase 3; D-16)_
- **RNF-20** La app móvil DEBE guardar el refresh token y los intentos pendientes solo en `expo-secure-store` (Keychain/Keystore) y el access token solo en memoria; NUNCA DEBE usar `AsyncStorage` para ellos. _(D-06, D-17)_
- **RNF-21** CUANDO la app móvil pasa a segundo plano o queda inactiva, DEBE ocultar saldos, movimientos y datos de transferencias, incluida la vista previa del selector de apps. _(enunciado Fase 3 móvil)_

### Pruebas, entorno y entrega

- **RNF-22** DEBE haber pruebas unitarias de la lógica de servicios, incluidas la validación de CLABE (R-3.4), `montoTextoACentavos` (R-4.33) y `formatearMXN` (R-2.5). _(enunciado Pruebas; D-18, D-19)_
- **RNF-23** DEBE haber pruebas de integración contra un PostgreSQL real en local que cubran, como mínimo: idempotencia (R-4.14 a R-4.17), límite diario incluida la medianoche (R-6.1 a R-6.6), saldo no negativo (R-4.3, RNF-06), suma cero, máquina de estados y auditoría inmutable (RNF-11). _(enunciado Pruebas; D-03, D-14, D-15)_
- **RNF-24** DEBE haber una prueba que dispare 100 transferencias simultáneas desde una cuenta, con un pool de 10 conexiones, y verifique: aplicadas × monto + saldo final = saldo inicial; `saldo = SUM(asientos)` por cuenta; `SUM(saldos) = 0`; y cero deadlocks. _(enunciado Pruebas; D-12)_
- **RNF-25** DEBE haber pruebas con Testing Library del flujo de transferencia web que cubran el éxito, el error de saldo insuficiente, el doble clic y el doble Enter con una sola petición, y el borrado del intento al cerrar sesión. _(enunciado Fase 3; D-16)_
- **RNF-26** DEBE haber una prueba de la app móvil con un fetch simulado que falla dos veces y luego responde `201`, que verifique que las tres peticiones llevan la misma llave. _(D-17)_
- **RNF-27** API, base de datos con seed y web DEBEN levantarse en local siguiendo el README con `npm run db:migrate`, `npm run db:seed` y `npm run dev`. El seed DEBE generar 100,000 movimientos o más y usuarios demo que permitan mostrar una transferencia normal, una con código, una con saldo insuficiente y una que excede el límite, todo mediante depósitos. _(enunciado Fase 2; D-13, D-20)_
- **RNF-28** La documentación OpenAPI DEBE poder navegarse en local (Swagger UI o Redoc). _(enunciado Entregables)_
- **RNF-29** Un pipeline de CI DEBE correr lint y pruebas de API, web y móvil, en verde en la rama principal. _(enunciado Entregables)_

### Documentación y entregables

- **RNF-30** El repositorio DEBE incluir `docs/aws-deploy.md` con un diagrama de arquitectura en Mermaid y la propuesta de producción para una empresa regulada, sin desplegar nada. Debe cubrir: cómputo de la API (servicio elegido y por qué se descartan los demás); base de datos (RDS PostgreSQL o Aurora, Multi-AZ, recuperación a un punto en el tiempo, RPO y RTO objetivo); hosting de la web; distribución de la app móvil y su conexión segura a la API; observabilidad y auditoría (dónde y cuánto tiempo se retienen los logs de auditoría); y CI/CD con OIDC y ambientes dev, staging y prod. Además responde por escrito: manejo de conexiones a PostgreSQL al escalar horizontalmente, qué cambiaría con 100 veces el volumen (incluido el punto caliente de la cuenta Fondeo) y qué herramienta de infraestructura como código usaría. _(enunciado Fase 4; D-20)_
- **RNF-31** El `README.md` DEBE explicar cómo correr el sistema en local (RNF-27), cómo correr las pruebas de los tres proyectos y una sección "qué haría con más tiempo" que incluya, como mínimo, los elementos de la sección 11. _(enunciado Entregables; D-03, D-07, D-08, D-13, D-20)_
- **RNF-32** El repositorio DEBE incluir instrucciones para correr la app móvil con Expo Go o con un simulador, apuntando a la API local. _(enunciado Entregables)_
- **RNF-33** La carpeta `/specs` DEBE contener `requirements.md`, `design.md`, `tasks.md` y `ai-log.md`. El historial de Git DEBE mostrar las specs antes que la implementación, conservarse completo y sin squash, y cada tarea de `tasks.md` DEBE corresponder a uno o más commits que citen sus IDs, para trazar requerimiento → diseño → tarea → commit → prueba. _(enunciado Fase 1 y Entregables)_

---

## 10. Casos borde del enunciado

| ID | Caso borde | Criterios que lo cubren |
|---|---|---|
| CB-1 | Doble clic en "Enviar" | R-4.20, R-4.21, R-4.22, R-4.23, R-4.24, R-4.25, R-4.14, R-4.16, R-6.13 (doble clic en "Confirmar"), RNF-25 |
| CB-2 | Pérdida de red a mitad de una transferencia en móvil | R-4.27, R-4.28, R-4.29, R-4.30, R-4.31, R-4.32, R-4.14, R-4.19, RNF-26 |
| CB-3 | Redondeo | R-4.33, R-4.34, R-4.35, R-4.8, R-2.5, R-B1.2, RNF-09, RNF-22 |
| CB-4 | Límite diario que cruza medianoche | R-6.5, R-6.6, R-5.5, RNF-10, RNF-23 |
| CB-5 | Transferencia a la propia cuenta | R-4.4 (misma cuenta, rechazo), R-4.5 y R-3.8 (otra cuenta propia, traspaso), R-6.3, R-6.9 |

Casos borde adicionales detectados durante el interrogatorio:

| Caso | Criterios |
|---|---|
| Misma llave con datos distintos | R-4.15 |
| Dos peticiones simultáneas con la misma llave | R-4.16 |
| Transferencias paralelas desde dos cuentas del mismo usuario contra el límite | R-4.18, R-6.4 |
| Monto exactamente igual al límite o al umbral | R-6.1, R-6.8 |
| Pendiente con código vencido sin proceso en segundo plano | R-6.12 |
| Recarga de la página web a mitad de la petición | R-4.25 |
| Dos pestañas refrescando el token a la vez | R-1.15 |
| Reúso de refresh token robado | R-1.9 |
| Movimientos con el mismo instante en el borde de una página | R-5.4 |
| Beneficiario cuya CLABE es propia | R-3.8, R-4.5 |
| Dígito verificador que da 10 | R-3.4 |
| Inyección de fórmulas en el CSV | R-B1.3 |

---

## 11. Fuera de alcance

| Elemento | Motivo |
|---|---|
| Transferencias programadas | D-08 |
| Estado de cuenta en PDF | D-08 |
| Reenvío del código de un solo uso | D-07 |
| Expiración de llaves de idempotencia a las 24 h | D-03 |
| Límite diario por usuario configurable | D-13 |
| Abrir cuentas adicionales | D-20 |
| Transferencias fuera de la plataforma (SPEI) | D-19, enunciado |
| Cognito | opcional en el enunciado; no se usa |
| Desbloqueo biométrico en móvil | opcional, última tarea de `tasks.md` (D-08) |

---

## 12. Pendientes para la fase de Diseño

Puntos que estos requisitos necesitan pero que `decisiones.md` no cierra. Se resuelven en `design.md` sin cambiar ningún criterio:

1. Política de contraseña (longitud mínima, reglas) para R-1.5.
2. Código HTTP del correo ya registrado (R-1.4) y de beneficiario duplicado (R-3.7).
3. Longitudes máximas de nombre, alias, concepto y referencia (R-3.1, R-4.9).
4. Umbrales y ventanas del rate limit de login y registro (RNF-04).
5. Contenido exacto del comprobante (R-4.11).
6. Qué datos se enmascaran en logs además de los listados, por ejemplo la CLABE (RNF-12).
7. Contenido del CSV cuando el mes no tiene movimientos (R-B1.1).

---

## 13. Matriz de cobertura

### 13.1 Historias de usuario → criterios

| Historia | Enunciado | Criterios |
|---|---|---|
| HU-1 Registro e inicio de sesión | HU 1 | R-1.1 a R-1.18 |
| HU-2 Cuentas y saldo | HU 2 | R-2.1 a R-2.6 |
| HU-3 Beneficiario con CLABE | HU 3 | R-3.1 a R-3.12 |
| HU-4 Transferencia | HU 4 | R-4.1 a R-4.35 |
| HU-5 Historial con filtros y paginación | HU 5 | R-5.1 a R-5.12 |
| HU-6 Límite diario y código | HU 6 | R-6.1 a R-6.18 |
| HU-B1 Estado de cuenta CSV | Bonus | R-B1.1 a R-B1.6 |

### 13.2 Puntos técnicos del enunciado → criterios

| Fase | Punto del enunciado | Criterios |
|---|---|---|
| 2 | Stack obligatorio, TypeORM, migraciones, `synchronize` off | RNF-16 |
| 2 | Capas o módulos; lógica financiera fuera de los handlers | RNF-16 |
| 2 | Validación con esquema y errores RFC 7807 sin detalles internos | RNF-01, R-1.5, R-4.8, R-4.9, R-5.2 |
| 2 | JWT corto y refresh rotativo | RNF-02, R-1.6 a R-1.10 |
| 2 | Contraseñas con argon2 o bcrypt | RNF-03 |
| 2 | Rate limit en login | R-1.18, RNF-04 |
| 2 | Transacción con bloqueo explícito u orden determinista, justificado | RNF-08, R-4.18, R-4.19 |
| 2 | `CHECK` de saldo no negativo | RNF-06, R-4.3 |
| 2 | Llaves foráneas | RNF-06 |
| 2 | Única sobre la llave de idempotencia | RNF-06, R-4.16, R-4.17 |
| 2 | Asientos de cada transferencia suman cero | RNF-06, RNF-07, R-4.1 |
| 2 | Auditoría de solo inserción con permisos | RNF-11 |
| 2 | Índices del historial y `EXPLAIN ANALYZE` con 100,000 movimientos | RNF-14, RNF-27 |
| 2 | Paginación por cursor, no `OFFSET` | RNF-13, R-5.3, R-5.4, R-5.7 |
| 2 | Logs JSON con request ID y datos enmascarados | RNF-12, R-6.16 |
| 2 | Pruebas unitarias, incluida la CLABE | RNF-22 |
| 2 | Integración: idempotencia, límite diario, saldo no negativo | RNF-23 |
| 2 | 100 transferencias simultáneas que cuadran al centavo | RNF-24 |
| 2 | `db:migrate`, `db:seed`, `dev` | RNF-27 |
| 3 | Monorepo y tipos compartidos desde OpenAPI | RNF-18 |
| 3 web | Login, resumen, historial, beneficiarios, transferencia con confirmación y comprobante | R-1.14, R-2.6, R-5.11, R-3.10, R-4.20, R-4.11, R-6.18 |
| 3 web | Estados de carga, vacío y error | RNF-17, R-2.6, R-5.11 |
| 3 web | Validación compartida; botón bloqueado; llave una vez por intento | RNF-18, R-3.10, R-4.20 a R-4.25 |
| 3 web | `Intl.NumberFormat` `es-MX` sin float | R-2.5, R-4.33, RNF-09 |
| 3 web | Accesibilidad básica | RNF-19, R-4.21 |
| 3 web | Testing Library del flujo, incluido saldo insuficiente | RNF-25, R-4.12 |
| 3 móvil | Login, saldo, últimos 20 movimientos, transferencia a beneficiario | R-1.17, R-2.6, R-5.12, R-4.26 |
| 3 móvil | Tokens en almacenamiento seguro, nunca `AsyncStorage` | RNF-20, R-4.27 |
| 3 móvil | Red inestable: misma llave y estado real | R-4.27 a R-4.32, RNF-26 |
| 3 móvil | Ocultar contenido en segundo plano | RNF-21 |
| 3 móvil | Bonus biometría | Fuera de alcance (opcional) |
| Entregables | OpenAPI navegable en local | RNF-28 |
| Entregables | CI con lint y pruebas de los tres proyectos | RNF-29 |
| Entregables | Video con saldo insuficiente | RNF-27 (usuario demo), R-4.12 |
| Entregables | `README.md`: correr en local, correr pruebas, "qué haría con más tiempo" | RNF-31, RNF-27 |
| Entregables | Instrucciones de la app móvil con Expo Go o simulador | RNF-32 |
| 4 | `docs/aws-deploy.md` con diagrama Mermaid, temas mínimos y respuestas escritas | RNF-30 |
| 1 | Carpeta `/specs` con los cuatro archivos, specs antes que la implementación, historial sin squash, tarea ↔ commit | RNF-33 |
| 1 | Casos borde del enunciado | Sección 10 (CB-1 a CB-5) |

### 13.3 Decisiones → criterios

Cada decisión de `decisiones.md` está citada por al menos un criterio.

| Decisión | Criterios |
|---|---|
| D-01 | R-2.2, R-4.1, RNF-06, RNF-07, RNF-16 |
| D-02 | R-1.2, R-2.3, R-3.5, R-4.7, R-5.9, R-6.3, RNF-06, RNF-07, RNF-11 |
| D-03 | R-4.3, R-4.13 a R-4.17, R-4.19, R-6.2, RNF-06, RNF-23 |
| D-04 | R-4.2, R-4.5, R-4.18, R-6.1, R-6.3, R-6.4, RNF-08 |
| D-05 | R-1.6 a R-1.12, R-1.15, R-1.17, R-4.29, RNF-02, RNF-11 |
| D-06 | R-1.12 a R-1.17, R-4.25, RNF-05, RNF-20 |
| D-07 | R-6.8, R-6.10, R-6.11, R-6.13 a R-6.17, RNF-08, RNF-11, RNF-12, RNF-15 |
| D-08 | R-B1.1 a R-B1.6, sección 11 |
| D-09 | R-3.8, R-4.2, R-4.5, R-5.1, R-5.6, R-5.8, R-5.9, RNF-06 |
| D-10 | R-1.7, R-2.4, R-3.11, R-4.6, R-4.10, R-5.10, R-6.14, R-B1.4 |
| D-11 | R-5.1 a R-5.5, R-5.7, R-5.12, RNF-13, RNF-14 |
| D-12 | R-4.3, R-4.18, R-4.19, RNF-08, RNF-24 |
| D-13 | R-4.5, R-4.8, R-6.1, R-6.7, R-6.8, R-6.9, RNF-15, RNF-27 |
| D-14 | R-4.1, R-4.3, R-4.4, R-4.10, R-4.14, R-5.8, R-6.2, R-6.3, R-6.8, R-6.10 a R-6.12, RNF-06 |
| D-15 | R-5.5, R-6.5, R-6.6, R-B1.1, RNF-10, RNF-23 |
| D-16 | R-1.12, R-4.20 a R-4.25, R-6.15, RNF-19, RNF-25 |
| D-17 | R-1.12, R-4.11, R-4.12, R-4.27 a R-4.32, R-6.18, RNF-15, RNF-20, RNF-26 |
| D-18 | R-2.1, R-2.5, R-4.8, R-4.33 a R-4.35, R-B1.2, RNF-09, RNF-18, RNF-22 |
| D-19 | R-1.1, R-3.1 a R-3.12, R-4.5, RNF-04, RNF-18, RNF-22 |
| D-20 | R-1.1 a R-1.3, R-1.18, R-2.1, RNF-04, RNF-07, RNF-15, RNF-27, RNF-30, RNF-31 |
