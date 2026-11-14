# Bitácora de uso de IA

Registro de cómo se usó la IA para resolver los requerimientos de la prueba: herramientas, prompts clave, propuestas aceptadas y rechazadas, y correcciones. Se actualiza al cerrar cada sesión de trabajo.

## Herramientas

| Herramienta | Modelo | Uso |
|---|---|---|
| Claude (chat en claude.ai) | Claude Opus 5.5 | Esqueleto de diseño y revisión de decisiones |
| Claude Code (terminal) | Claude Opus 5.5 | Specs e implementación, en **plan mode** (flujo plan-first: propone, yo apruebo, luego escribe) |

### Skills de Claude Code instaladas en el repo (`.claude/skills/`)

| Skill | Origen | Para qué |
|---|---|---|
| `spec-driven-development` | `jasonkneen/kiro` | Flujo estilo Kiro: Requisitos → Diseño → Tareas, con aprobación entre fases |
| `grill-with-docs` | `mattpocock/skills` | Interrogatorio para cuestionar el diseño y registrar decisiones |
| `grilling` | Dependencia de `grill-with-docs` | Interrogatorio por rondas sobre el árbol de decisiones |
| `domain-modeling` | Dependencia de `grill-with-docs` | Glosario del dominio (`GLOSSARY.md`) y registro de decisiones |
| `tdd` | `mattpocock/skills` | Implementación guiada por pruebas |

## Flujo de trabajo

1. Yo defino y valido el diseño general (`specs/esqueleto.md`).
2. La IA me interroga sobre decisiones abiertas (`grill-with-docs`) y registro las respuestas.
3. La IA redacta cada fase de la spec en plan mode; yo reviso y apruebo antes de pasar a la siguiente.
4. Cada tarea de `tasks.md` se implementa en uno o más commits que citan la tarea y el requerimiento.

---

## Sesiones

### Sesión 1 — 2026-11-13 · Esqueleto general del sistema

**Herramienta:** Claude (chat), Opus 5.5

**Prompt clave:**
> "De acuerdo a las especificaciones indicadas, dame el esqueleto. No quiero que utilices aún tecnologías específicas, sino un diagrama general."

**Resultado:** `specs/esqueleto.md` con 5 diagramas Mermaid (vista del sistema, módulos, modelo de datos conceptual, flujo de transferencia, mapa de pantallas). Revisado por mí antes de subirlo.

**Correcciones a la IA:**
- En la primera versión del diagrama ER, los atributos venían en una sola línea, que no es sintaxis válida de Mermaid; GitHub no lo habría dibujado. Se corrigió a un atributo por línea con su tipo.

**Decisiones de diseño revisadas con la IA:**
- **Montos en centavos como enteros (`BIGINT`), nunca float.** En JavaScript `0.1 + 0.2 = 0.30000000000000004` y `1.15 * 100 = 114.99999999999999`; con float el saldo no cuadraría al centavo en la prueba de concurrencia.
  - Alternativa considerada: `NUMERIC(14,2)`. Es exacto en PostgreSQL, pero el driver de Node lo entrega como texto y es fácil convertirlo a `Number` por error. Centavos enteros es una sola regla para API, web y móvil.
  - Riesgo anotado: el driver también entrega `BIGINT` como texto; hay que configurar el parser explícitamente.
  - En el cliente, el monto capturado se convierte a centavos **procesando el texto**, no multiplicando por 100.
- **Auditoría de solo inserción** separada de los asientos: registra también los intentos fallidos (login fallido, transferencia rechazada por saldo), que no generan asientos. Se garantiza con `REVOKE UPDATE, DELETE` en la base, no solo en el código.

**Huecos detectados en el modelo (pendientes para el interrogatorio):**
1. Saldo guardado vs. suma de asientos: cómo garantizar que coincidan.
2. Llave de idempotencia única por usuario y con hash del cuerpo de la petición.
3. `usuario_id` en `TRANSFERENCIA` para calcular el límite diario.
4. Familia de sesiones para detectar reúso de refresh token.
5. Contador de intentos en el código de confirmación.
6. `fecha_programada` si se implementa el bonus de transferencias programadas.
7. Índice `(cuenta_id, fecha DESC, id DESC)` para el historial por cursor.

---

### Sesión 2 — 2026-11-13 · Interrogatorio de decisiones previo a `requirements.md`

**Herramienta:** Claude Code (Opus 5.5) con la skill `grill-with-docs`, invocada por mí con `/grill-with-docs`. La skill exige invocación explícita del usuario: la IA no puede lanzarla por su cuenta. Usa dos dependencias, `grilling` y `domain-modeling`. Claude en el chat sirvió de apoyo para analizar las opciones.

**Prompt clave:**
> "Retoma el interrogatorio de la billetera digital MXN. […] Continúa con la pregunta 2 (cuenta de sistema), luego los huecos restantes de la bitácora (2 al 7), y después: estrategia de concurrencia, monto del límite diario y umbral del código de un solo uso, estados de una transferencia, y cada caso borde del enunciado […]. Una pregunta a la vez con tu recomendación y la alternativa. Montos siempre en centavos enteros."

**Resultado:**
- Decisiones D-01 a D-20 en `specs/decisiones.md`, cada una con su decisión, motivo y alternativa descartada.
- `GLOSSARY.md` en la raíz, con el vocabulario del dominio: Cuenta, Saldo, Asiento, Fondeo, Depósito, Transferencia, Traspaso, Movimiento, Envío y Recepción.
- Quedan seis ramas para `design.md`, ninguna afecta los requerimientos: parámetros de rate limiting, catálogo de auditoría, enmascaramiento en logs, catálogo de errores RFC 7807, ocultar contenido en segundo plano en móvil y política de contraseñas.

**Huecos de la sesión 1, resueltos:**

| Hueco | Decisión |
|---|---|
| 1. Saldo guardado vs. suma de asientos | D-01 (y D-02, cuenta Fondeo) |
| 2. Llave de idempotencia por usuario con hash | D-03 |
| 3. `usuario_id` en transferencia para el límite | D-03, D-04 |
| 4. Familia de sesiones | D-05 (y D-06, almacenamiento de tokens) |
| 5. Intentos del código de confirmación | D-07 |
| 6. `fecha_programada` | D-08: fuera de alcance, solo bonus CSV |
| 7. Índice del historial por cursor | D-11 |

Casos borde del enunciado: doble clic (D-16), red perdida en móvil (D-17), redondeo (D-18), límite que cruza medianoche (D-15) y transferencia a la propia cuenta (D-04, D-09, D-14).

**Qué propuso la IA y qué decidí:**

| Propuesta | Decisión | Motivo |
|---|---|---|
| Bloqueo explícito `FOR UPDATE` en `READ COMMITTED` | Aceptada (D-12) | `SERIALIZABLE` con 100 transferencias desde una cuenta aborta casi todo |
| Cuenta de sistema Fondeo para el dinero inicial | Aceptada (D-02) | La alternativa, una apertura con un solo asiento, rompía la regla de suma cero |
| Tres estados con motivo de rechazo | Aceptada (D-14) | Estados como `PROCESANDO` no serían observables |
| Límite diario por usuario en una columna | Rechazada (D-13) | Sin un proceso para cambiarlo es configuración disfrazada; va en "qué haría con más tiempo" |
| Transferencias programadas como bonus | Rechazada (D-08) | Abren riesgos de saldo, límite y código que el enunciado pide evitar |

**Correcciones y agregados a las propuestas de la IA:**
- **Path de la cookie de refresh:** la IA propuso `Path=/auth`. La API vive bajo `/api`, así que el navegador no habría mandado la cookie al endpoint de refresh. Se corrigió a `Path=/api/auth` (D-06).
- **Coordinación entre pestañas con Web Locks** (`navigator.locks`), para que dos pestañas no disparen una falsa detección de reúso del refresh (D-05).
- **Traspasos fuera del límite diario:** las transferencias entre cuentas propias no cuentan, porque el dinero no sale del control del usuario (D-04).
- **Clasificación por el dueño real del destino al aplicar**, también cuando el destino es un beneficiario (D-04).
- **Confirmar es idempotente:** una segunda confirmación de una transferencia ya aplicada devuelve el mismo comprobante (D-07).
- **`OTP_SIMULADO` bloqueado en producción:** la API no arranca si está activo. Lo mismo se aplicó después a `DEMO_LATENCIA_MS` y a `FONDEO_BIENVENIDA_CENTAVOS` (D-07, D-17, D-20).
- **Origen = destino** y destino inexistente son `422` antes de crear la fila, porque el `CHECK (cuenta_origen_id <> cuenta_destino_id)` no permite guardarlos; no son motivos de rechazo (D-14).
- **Protección contra inyección en CSV** para los campos de texto (D-08).
- **El intento móvil guardado queda ligado al usuario**, se borra al cerrar sesión y solo se resuelve para su dueño (D-17).
- **Separación de pesos y centavos sobre el texto del entero**, sin aritmética, cubriendo negativos y montos menores a $1.00 (D-18).
- **Verificar `Intl.NumberFormat.formatToParts` en Hermes** en la primera tarea móvil, con un formateo manual de respaldo (D-18).
- **Orden total de bloqueo** usuario → transferencia/código → cuentas como regla global para cualquier flujo nuevo (D-12; la IA señaló que la confirmación de D-07 no lo respetaba).
- Prueba del dígito verificador de CLABE con una suma ponderada que termina en 0, para que el dígito resultante sea 0 y no 10 (D-19).

**Lo que la IA detectó bien:**
- **La trampa de los microsegundos en el cursor:** PostgreSQL guarda microsegundos y `Date` de JavaScript milisegundos. Si el cursor pasara por `Date`, se saltarían o repetirían movimientos en el borde de una página (D-11).
- **La cuenta de sistema Fondeo:** sin una contrapartida, el saldo inicial rompía la regla de suma cero (D-02).
- El riesgo de rebasar el límite con dos transferencias en paralelo desde cuentas distintas del mismo usuario, que se resolvió bloqueando la fila del usuario (D-04).
- **El hueco de clasificación que abrió la regla "traspasos fuera del límite":** si se clasificara por cómo se eligió el destino y no por su dueño real, se podría disfrazar el tipo de transferencia para el límite. La IA lo señaló y yo decidí clasificar por el dueño real (D-04).

**Commits relacionados:** _(pendiente: commit manual)_

---

### Sesión 3 — 2026-11-13 · Fase de Requisitos (`requirements.md`)

**Herramienta:** Claude Code (Opus 5.5) con la skill `spec-driven-development`, invocada por mí con `/spec-driven-development`. Primera de las tres fases (Requisitos → Diseño → Tareas), con aprobación mía antes de pasar a Diseño.

**Prompt clave:**
> "Fase de Requisitos de la billetera digital MXN. Lee: @docs/enunciado.md, @specs/esqueleto.md, @specs/decisiones.md y @GLOSSARY.md. Escribe specs/requirements.md (NO uses otra ruta como .kiro/specs) con: historias HU-1 a HU-6 y HU-B1 […]; criterios de aceptación en formato EARS o Given/When/Then, numerados por historia (R-1.1, R-1.2, R-4.1…) […]; requisitos no funcionales que exige el enunciado, con IDs RNF-xx […]; todos los casos borde del enunciado como criterios explícitos […]; cada criterio cita las decisiones que lo sustentan (D-xx). Usa los términos del glosario. Sin detalles de implementación que no estén ya en decisiones.md. Al final, una matriz que muestre que cada historia y cada punto técnico del enunciado tiene al menos un criterio. Detente para mi aprobación antes de pasar a la fase de Diseño."

**Resultado:**
- `specs/requirements.md`: criterios EARS por historia (R-1.x a R-6.x y R-B1.x), escenarios Dado/Cuando/Entonces para los casos con valores concretos, RNF-01 a RNF-33, tabla de casos borde CB-1 a CB-5 y matriz de cobertura en tres direcciones: historia → criterios, punto técnico del enunciado → criterios y decisión → criterios.
- Sección "Pendientes para la fase de Diseño" con siete puntos que `decisiones.md` no cierra (política de contraseña, códigos HTTP de duplicados, longitudes de campos, umbrales de rate limit, comprobante, enmascarado de CLABE, CSV de un mes vacío). La IA los señaló en vez de inventarlos.

**Qué propuso la IA y qué decidí:**

| Propuesta | Decisión | Motivo |
|---|---|---|
| R-1.7: login con el mismo `401` exista o no el correo | Aceptada | Mismo principio que D-10: no revelar qué correos existen |
| R-5.5: `desde > hasta` es error de validación | Aceptada | Un rango invertido nunca es intencional |
| RNF-19: WCAG AA como objetivo de contraste | Aceptada | El enunciado solo dice "suficiente"; AA lo vuelve medible |
| RNF-11: eventos mínimos de auditoría, incluidas transferencias aplicadas y rechazadas | Aceptada | Sale del esqueleto §4 y de D-09 |
| Siete pendientes para `design.md` | Aceptada | No afectan ningún criterio |

**Correcciones a la IA:**
- **R-4.6, destino ajeno o inexistente:** la IA respondía `404` para un origen o beneficiario ajeno, pero `422` para un destino inexistente, copiando D-14. Esa diferencia permitiría distinguir si un identificador de cuenta existe. Corregí: el destino solo puede ser un beneficiario del usuario o una cuenta propia; cualquier otro identificador se trata como ajeno y responde `404` (D-10). El `422` previo a crear la fila queda solo para origen = destino. Pendiente: alinear el texto de D-14 en `decisiones.md`.
- **Trazabilidad del rate limit de login:** la matriz citaba R-3.9, que es el rate limit del alta de beneficiarios, y HU-1 no tenía un criterio propio. Se agregó R-1.18 (rate limit de login y registro, D-20) y la matriz lo cita.
- **Entregables omitidos:** la IA no convirtió en requisitos `docs/aws-deploy.md` (Fase 4), el README con "qué haría con más tiempo", las instrucciones de Expo Go o simulador, ni la carpeta `/specs` con su historial sin squash. Se agregaron RNF-30 a RNF-33 y sus filas en la matriz.

**Commits relacionados:** commit que agrega `specs/requirements.md` y esta entrada.

---

### Sesión 4 — 2026-11-14 · Fase de Diseño (`design.md` y `openapi.yaml`)

**Herramienta:** Claude Code (Opus 5.5) con la skill `spec-driven-development`, invocada por mí con `/spec-driven-development`. Segunda de las tres fases (Requisitos → **Diseño** → Tareas).

**Método: por bloques, con aprobación en cada uno.**
1. La IA propuso primero solo el índice de secciones de `design.md`, y yo lo aprobé.
2. Escribió el documento en seis bloques y se detuvo al terminar cada uno: A (secciones 0 a 2), B (3), C (4 y `specs/openapi.yaml`), D (5 a 7), E (8 a 12) y F (13 a 17).
3. Toda decisión nueva que no estaba en `decisiones.md` se marcó como `DD-nn · Propuesta`, con contexto, opciones, decisión y motivo. Al final de cada bloque, la IA listó las DD nuevas; yo las aprobé, a veces con precisiones, y solo entonces se hizo el commit del bloque.
4. Al final de cada bloque, la IA verificó que no hubiera secciones duplicadas. En el último, un script comprobó que los 140 criterios de `requirements.md` aparecen en la matriz de §17.

**Prompt clave:**
> "Fase de Diseño de la billetera digital MXN. Lee: @docs/enunciado.md, @specs/requirements.md, @specs/decisiones.md, @specs/esqueleto.md y @GLOSSARY.md. Escribe specs/design.md por partes. Primero muéstrame solo el índice de secciones y espera mi aprobación […]. Contrato de la API en OpenAPI 3.1 en specs/openapi.yaml […]. Cada decisión de diseño nueva que no esté en decisiones.md debe marcarse para que yo la apruebe."

**Resultado:**
- `specs/design.md` con 17 secciones y 46 decisiones de diseño (DD-01 a DD-46), todas aprobadas. La tabla de §16 es su única fuente, y `decisiones.md` remite a ella.
- `specs/openapi.yaml` (OpenAPI 3.1) con 15 rutas y el catálogo de problemas RFC 7807.
- Se cerraron los siete pendientes de `requirements.md` §12 y las seis ramas que dejó el interrogatorio. Queda abierto a propósito solo el `EXPLAIN ANALYZE` (§8.5), que depende del seed.

**Precisiones que hice a las propuestas de la IA:**

| DD | Precisión |
|---|---|
| DD-05 | Las migraciones son clases de TypeORM que implementan `MigrationInterface`, escritas a mano. El script propio solo las ejecuta con `dataSource.runMigrations()`, para cumplir "las migraciones se escriben con TypeORM". Documentar por qué no se usa el CLI (ESM) |
| DD-18 | Toda función `SECURITY DEFINER` fija su `search_path`, para que no se pueda suplantar un objeto desde otro esquema. Pruebas de integración que intentan violar DD-17 y DD-18 (clasificación incorrecta, `UPDATE` directo al saldo, `DELETE` en asientos o auditoría) y verifican que la base las rechaza |
| DD-20 | El seed incluye al menos una cuenta con decenas de miles de movimientos, para que el `EXPLAIN ANALYZE` del historial de una cuenta sea representativo, además del total de 100,000 o más |
| DD-23 | Documentar que el `409` del correo duplicado revela si un correo existe: es una concesión consciente, mitigada por el rate limit del registro, y la verificación por correo va en "qué haría con más tiempo" |
| DD-25 | En modo simulado, web y móvil guardan `codigoSimulado` junto con el intento, para que una recarga en la pantalla del código no deje al usuario sin poder confirmar. En producción el campo no existe y no se guarda nada |
| DD-32 | El intento guardado registra su fase (creación o confirmación). Si la red se pierde al confirmar, se reintenta la confirmación y no la creación. Un `202` recibido por reintento o reanudación se contrasta con `GET /transferencias/{id}` antes de pedir el código. Esto precisa D-16 y D-17 |
| DD-37 | La consulta dinámica solo concatena fragmentos fijos de SQL; todos los valores van como parámetros, nunca dentro del texto |
| DD-39 | El logger oculta los headers `authorization`, `cookie` y `set-cookie`, y la prueba de fugas verifica que ningún token aparezca en la salida |
| DD-41 | Para `docs/aws-deploy.md`: detrás del balanceador, `trust proxy` con el número exacto de saltos, para obtener la IP real sin permitir que se falsifique con `X-Forwarded-For` |
| DD-43 | Al terminar una transferencia, aplicada o rechazada, se invalidan las consultas de TanStack Query de cuentas y movimientos |
| DD-44 | `FLAG_SECURE` se controla con una variable de configuración: activo en producción y desactivable en desarrollo, porque bloquea la grabación de pantalla que exige el video. La capa opaca de `AppState` queda siempre activa |
| R-5.4 | El ejemplo del requisito ("los dos asientos de un traspaso en el borde de una página") no puede darse en el historial de una cuenta, porque esos asientos caen en cuentas distintas. Corregí `requirements.md` con el caso real: varios movimientos con el mismo instante en una cuenta |

**Hallazgos de la IA:**
- **DD-13, hueco en D-09:** el catálogo de tipos de movimiento no tenía tipo para el cargo en la cuenta Fondeo de cada depósito, y el `CHECK` de signo lo exige. Se agregó `FONDEO_SALIDA`, con una nota en D-09 y una entrada en `GLOSSARY.md`.
- **DD-36, un movimiento podía desaparecer del historial:** la IA detectó un defecto en su propia propuesta anterior, DD-07, ya aprobada. Con el instante tomado de `now()` (inicio de la transacción), una transferencia que empezó antes pero confirmó después podía quedar con un `creado_en` anterior al cursor que el cliente ya había recorrido, y la paginación se la saltaba (R-5.4). Se resolvió leyendo el instante con `clock_timestamp()` después de bloquear las cuentas, y se agregó una prueba de paginación con escrituras concurrentes.
- **`SUM` devuelve decimal:** en PostgreSQL, `SUM` sobre `bigint` devuelve `numeric`, que el driver entrega como texto y es fácil convertir con pérdida. Todas las sumas se convierten a `::bigint`, y un parser global del driver rechaza cualquier valor que no sea un entero seguro (§2.3).
- **Conflicto de `codigoSimulado`:** R-4.14 exige que la repetición con la misma llave devuelva el mismo cuerpo, pero R-6.16 prohíbe guardar el código en claro, así que la repetición de un `202` no puede reproducir `codigoSimulado`. Se resolvió con DD-25: es la única excepción a R-4.14, solo en modo simulado, y los clientes guardan el código junto con el intento.

**Commits relacionados:** `e27ebc0` (bloque A), `eabb380` (B), `1d7b905` (C), `04ec98a` (D), `a33fd8c` (E) y `f0979e9` (F).

---

## Propuestas inseguras o incorrectas con el dinero

Registro específico de lo que la IA propuso y era riesgoso para la integridad del dinero.

| Fecha | Qué propuso la IA | Por qué era incorrecto | Cómo se corrigió |
|---|---|---|---|
| 2026-11-13 | Confirmar el código de un solo uso sin idempotencia (D-07, primera versión) | Con un doble clic en "Confirmar", la segunda petición podía responder error después de que la primera ya había movido el dinero, y el usuario podía creer que la transferencia falló y repetirla | Confirmar es idempotente: si la transferencia ya se aplicó, se devuelve el mismo comprobante sin consumir intentos |
| 2026-11-13 | Separar pesos y centavos con división entera y residuo (D-08 y D-18, primera versión) | Es aritmética sobre el monto, y no cubría explícitamente montos negativos ni menores a $1.00; en JS, `-5 % 100` y `Math.trunc(-5 / 100)` dan `-5` y `-0`, y es fácil mostrar mal un cargo pequeño | La separación se hace sobre el texto del entero (los últimos 2 dígitos son centavos), con el signo aparte, sin `/ 100` y con una regla de lint que lo prohíbe |

---

## Plantilla para nuevas sesiones

```markdown
### Sesión N — AAAA-MM-DD · Tema

**Herramienta:** Claude Code, plan mode / skill usada

**Prompt clave:**
> ...

**Qué propuso la IA y qué decidí:**

| Propuesta | Decisión | Motivo |
|---|---|---|

**Correcciones a la IA:**
- ...

**Commits relacionados:** `abc1234`, `def5678`
```
