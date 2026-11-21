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

### Sesión 5 — 2026-11-14 · Fase de Tareas (`tasks.md`)

**Herramienta:** Claude Code (Opus 5.5) con la skill `spec-driven-development`, invocada por mí con `/spec-driven-development`. Tercera de las tres fases (Requisitos → Diseño → **Tareas**).

**Método: lista primero, detalle después.**
1. La IA leyó `requirements.md`, `design.md`, `decisiones.md` y el enunciado, y me mostró solo la lista de tareas agrupada por fase, sin el detalle.
2. Aprobé la lista con ajustes (abajo).
3. La IA escribió el detalle de cada tarea: etiqueta, prioridad, dependencias, criterios R/RNF, decisiones DD, alcance, verificación y commit sugerido. Al final agregó la matriz de cobertura.

**Prompt clave:**
> "Fase de Tareas de la billetera digital MXN. Lee: @specs/requirements.md, @specs/design.md, @specs/decisiones.md y @docs/enunciado.md. Escribe specs/tasks.md con un plan de implementación en tareas pequeñas y verificables: cada tarea con ID […], etiqueta api, web, mobile, shared, docs o ci, los criterios R/RNF que cubre, las DD que implementa y cómo se verifica […]. Ordenadas por dependencias, empezando por el esqueleto del monorepo, Docker, migraciones y shared. Incluye tareas para el seed, para llenar §8.5 con el EXPLAIN ANALYZE, para README, docs/aws-deploy.md, el video y CI. […] Al final, una matriz que muestre que cada criterio R/RNF tiene al menos una tarea. Muéstrame primero la lista de tareas agrupada por fase, sin el detalle, y espera mi aprobación."

**Resultado:** `specs/tasks.md` con 52 tareas en 9 fases y una matriz de cobertura: cada R y cada RNF tiene al menos una tarea, y además hay tablas de DD → tareas y de casos borde → tareas.

**Ajustes que hice a la lista:**

| Ajuste | Cómo quedó en `tasks.md` |
|---|---|
| Prioridad P1 (dinero que cuadra y entregables obligatorios) o P2 (bonus o mejora), con una línea de corte: si el tiempo no alcanza, las P2 se omiten y van a "qué haría con más tiempo" | Tres tareas P2 (CSV en la API, botón del CSV en web y biometría) agrupadas en una fase de bonus, después de la línea de corte. Ninguna P1 depende de una P2, y la fase de entrega se ejecuta siempre |
| La app móvil toma la URL de la API de `EXPO_PUBLIC_API_URL`; con Expo Go en un teléfono físico debe ser la IP de la computadora en la red local, no `localhost` | Va en la verificación de T-MOB-01: con la IP de la LAN, Expo Go recibe `/api/health`, y con `localhost` falla. Si la variable falta, la app muestra un error de configuración. También va en el README (T-DOC-02) |
| El README indica los requisitos previos: Node 24, Docker Desktop con WSL2 en Windows y Expo Go | Agregado al alcance de T-DOC-02 |

**Lo que agregó la IA y acepté:**
- **API en `0.0.0.0` y regla del firewall.** Para que el teléfono llegue a la API, no basta con la IP correcta: la API escucha en todas las interfaces (T-MOB-01) y el README explica cómo abrir el puerto 3000 en el firewall de Windows para redes privadas (T-DOC-02).
- **Pruebas filtradas por ID.** Como cada prueba lleva en su nombre los IDs que verifica (DD-46), la verificación de cada tarea indica el filtro: `npx vitest run -t "R-4.14"`.
- **Script de trazabilidad.** T-DOC-04 incluye `npm run trazabilidad`, que falla si algún R o RNF no tiene una prueba con su ID o un commit que lo cite. Así la trazabilidad requerimiento → tarea → commit → prueba se comprueba con un comando y no solo a mano.

**Commits relacionados:** `fbd41b3` (`tasks.md`) y el commit que agrega esta entrada.

### Sesión 6 — 2026-11-14 · Implementación de T-API-01 (PostgreSQL en Docker)

**Herramienta:** Claude Code (Opus 5.5), flujo plan-first: la IA mostró el plan de archivos y comandos, y lo aprobé antes de que escribiera.

**Hueco que descubrió la tarea:** al correr `npm run db:up`, Docker no pudo publicar el puerto `5432` porque ya lo ocupaba un PostgreSQL instalado en mi máquina. `design.md` §1.3 fijaba `5432` en el host. La IA no detuvo el servicio local y me preguntó cómo resolverlo, con tres opciones: detener el PostgreSQL local, cambiar a `5433` o hacer el puerto configurable.

**Decisión:** combiné las dos últimas. El puerto del host se toma de `${POSTGRES_PORT:-5433}`: por defecto `5433`, para no chocar con un PostgreSQL local (común en Windows), y configurable si `5433` también está ocupado. Dentro del contenedor y en CI sigue en `5432`. Siguiendo la regla de `CLAUDE.md`, primero se corrigió `design.md` §1.3 en su propio commit y después se cerró T-API-01, con el README indicando cómo cambiar el puerto.

**Commits relacionados:** el commit que corrige §1.3 y agrega esta entrada, y el de T-API-01.

### Sesión 7 — 2026-11-14 · Implementación de T-CI-01 (CI con `calidad` y `unitarias`)

**Herramienta:** Claude Code (Opus 5.5), flujo plan-first.

**Resultado:** `.github/workflows/ci.yml` validado en local con `actionlint` y reproduciendo los pasos de cada job. Yo hice el push, y el workflow corrió en verde en GitHub (`calidad` y `unitarias`, 54 s). La casilla se marcó solo después de esa confirmación.

**Alertas de `npm audit`:** las alertas moderadas vienen de `minimatch` (GHSA-g3hv-75wg-m249), dependencia de `@typescript-eslint/typescript-estree` dentro de `typescript-eslint`, que se usa solo en desarrollo. **No se aplica** `npm audit fix --force`: el arreglo que propone es bajar `typescript-eslint` a 8.36.0, un cambio incompatible que rompería el lint. Se revisará al actualizar `typescript-eslint`.

**Commits relacionados:** `ad6e213` (workflow) y el commit que marca la casilla y agrega esta entrada.

### Sesión 8 — 2026-11-15 · Implementación de T-SHR-02 (módulo `dinero`)

**Herramienta:** Claude Code (Opus 5.5), skill `tdd`. Antes de escribir pruebas, la IA propuso los seams y los confirmé: `montoTextoACentavos`, `formatearMXN`, `centavosATextoDecimal` (importados desde `src/dinero.ts`) y el re-export desde `@billetera/shared`. Ciclos rojo → verde de uno en uno, con los valores esperados tomados de las tablas de R-2.5, R-4.33 y §13.1, no recalculados.

**Hueco que descubrió la tarea:** `design.md` §13.1 y R-4.34 solo fijaban el texto `"Máximo 2 decimales"`; el resto de los rechazos (formato inválido, cero, tope) no tenían texto. Se agregó a §13.1 una tabla con los cuatro textos de `error` en su propio commit, y las pruebas comparan el texto exacto.

**Detalle encontrado en el ciclo rojo:** `formatearMXN(-250)` pasaba "por accidente" porque `Intl` pone el signo en los pesos (`-2`), pero `-5` daba `$0.-5`. Se separa el signo antes de completar con ceros, como dice §13.1 paso 1. Los pesos se pasan a `Intl` como `BigInt`, así que ningún monto toca un float.

**Commits relacionados:** `b8775ab` (textos de error en §13.1) y el de T-SHR-02.

### Sesión 9 — 2026-11-15 · Implementación de T-SHR-03 (módulo `clabe`)

**Herramienta:** Claude Code (Opus 5.5), skill `tdd`. Antes de escribir pruebas, la IA propuso los seams y los confirmé: `digitoVerificador` y `validarClabe` desde `src/clabe.ts`, y el re-export desde `@billetera/shared`. Ciclos rojo → verde de uno en uno, con los valores esperados calculados a mano (CLABE de ejemplo `032180000118359719`, Fondeo de §3.6), no recalculados con el algoritmo.

**Hueco que descubrió la tarea:** §13.1 no definía la forma del resultado de `validarClabe` ni sus textos de error. Se agregaron en su propio commit: tres textos en el orden de R-3.2 (no numérico, longitud, dígito). Separé "solo admite números" de "debe tener 18 dígitos" para que el formulario sea más claro.

**Decisión mía:** `validarClabe` es estricta y no quita espacios; el formulario los quita antes de llamarla, igual que con el monto.

**Dígito 0 y no 10:** la prueba con la suma ponderada que termina en 0 (`99918040000000000`, suma 30) pasó desde el principio, porque el `% 10` final ya estaba. Para asegurar que no es una prueba vacía, se quitó temporalmente ese `% 10`: falló solo esa prueba (`expected 10 to be +0`) y luego se restauró el código.

**Commits relacionados:** `05447ee` (resultado y textos de error en §13.1) y el de T-SHR-03.

### Sesión 10 — 2026-11-15 · Implementación de T-SHR-04 (reglas de lint del dinero)

**Herramienta:** Claude Code (Opus 5.5). La IA presentó el plan antes de tocar archivos y señaló dos diferencias entre mi pedido y `tasks.md`; decidí en ambas.

**Qué propuso la IA y qué decidí:**

| Propuesta | Decisión | Motivo |
|---|---|---|
| Yo pedí un archivo de prueba temporal que se borrara; `tasks.md` pedía uno permanente con `npm run lint:verificar-reglas` | Archivo permanente y script, como dice `tasks.md` | Queda como prueba de regresión. Aun así, se demostró una vez que `npm run lint` rechaza cada patrón copiando temporalmente los archivos a `packages/shared/src/` y `mobile/src/` |
| `tasks.md` dejaba la regla de `AsyncStorage` para T-MOB-01; yo pedí probarla ya | Activarla en T-SHR-04, aunque `mobile/` aún no exista; corregí `tasks.md` en su propio commit | La protección de RNF-20 existe antes de la primera línea de código móvil |

**Cómo se verifica:** el script revisa `eslint-pruebas/` con `ESLint.lintText` y un `filePath` virtual en cada ruta. Así comprueba también los globs: las reglas de dinero aplican en `shared`, `web` y `mobile`, no en `api` (fuera del alcance de DD-42), y `AsyncStorage` solo en `mobile`. Incluye casos que no deben reportarse (`x / 2`, `x % 100`, `Math.abs`). Al quitar temporalmente la regla de `Math.ceil`, el script falló en las tres rutas y salió con código 1.

**Corrección a la IA:** la primera verificación de `npm run lint` se dio por buena leyendo el `$?` de un `tail` en la tubería. En realidad el lint estaba en rojo: el script nuevo usaba `console` y `process` sin globales de Node declarados. Se agregó un bloque para `scripts/**` con esos dos globales, sin instalar `globals`, y se volvió a correr leyendo el código de salida de ESLint.

**Commits relacionados:** `84e21a8` (la regla de `AsyncStorage` se activa en T-SHR-04) y el de T-SHR-04.

### Sesión 11 — 2026-11-15 · Implementación de T-SHR-05 (módulos `tiempo` y `problemas`)

**Herramienta:** Claude Code (Opus 5.5), skill `tdd`. Seams confirmados antes de escribir pruebas: `instanteIso` y `mensajeDeProblema` desde `src/`, el re-export desde `@billetera/shared`, y que `TIPOS_PROBLEMA` coincida con el `enum` `TipoProblema` de `openapi.yaml`.

**Hueco que descubrió la tarea:** ningún documento fijaba los textos que `mensajeDeProblema` muestra en web y móvil. La IA propuso una tabla y yo la corregí antes de aprobarla.

**Correcciones a la IA:**

| Propuesta | Problema | Corrección |
|---|---|---|
| El login fallido usaba `401 unauthorized`, con el texto "Tu sesión terminó. Inicia sesión de nuevo." | Quien escribe mal su contraseña vería un mensaje de sesión expirada, que confunde | Nuevo `type` `credenciales-invalidas` (`401`), con el texto "Correo o contraseña incorrectos.", igual exista o no el correo (R-1.7). `unauthorized` queda solo para sesión expirada o token inválido. Se actualizaron §5.1, §7.2, §13.2 (un `401 credenciales-invalidas` no dispara el refresh) y `openapi.yaml` |
| `idempotency-key-reused`: "Esta llave ya se usó con datos distintos…" | El usuario no sabe qué es una llave | "No pudimos procesar este envío. Inicia uno nuevo." |
| `limite-diario-excedido`: "La transferencia supera tu límite diario." | No dice cuándo vuelve a poder enviar | Se agrega "Tu límite se renueva a medianoche." |

**Decisión mía:** un `type` fuera del catálogo muestra el texto de `internal-error`, porque el `type` llega de la red y la pantalla nunca debe quedar vacía.

**Detalles encontrados:**
- Un objeto literal como tabla de textos devuelve una función con `type = "toString"` o `"constructor"`. `mensajeDeProblema` revisa primero si el `type` pertenece al catálogo, y hay pruebas para esos casos.
- `instanteIso` acepta solo `AAAA-MM-DD HH:MM:SS[.f{1,6}]+00` y nunca usa `Date`. Rechaza `-06`, `+00:00`, más de 6 decimales, un texto que ya está en ISO, `infinity` y el texto vacío.
- La prueba de contrato lee `openapi.yaml` con el import `?raw` de Vite, para no agregar tipos de Node a `shared`.

**Pruebas de mutación:** al quitar `credenciales-invalidas` del enum de `openapi.yaml`, la prueba de contrato falló. Al quitar un texto de `MENSAJES`, el typecheck falló (`Record<TipoProblema, string>`). En los dos casos se restauró el archivo.

**Commits relacionados:** `a7762e4` (`credenciales-invalidas`, textos de problemas e `instanteIso` en §13.1) y el de T-SHR-05.

### Sesión 12 — 2026-11-15 · Implementación de T-SHR-06 (tipos generados desde `openapi.yaml`)

**Herramienta:** Claude Code (Opus 5.5). La IA mostró el plan y lo aprobé antes de instalar nada.

**Qué propuso la IA y qué decidí:**

| Propuesta | Decisión | Motivo |
|---|---|---|
| Versiones exactas: `openapi-typescript@7.13.0` y `@redocly/cli@2.72.1`, en lugar de la 2.78.0, publicada 3 días antes | Aceptada | Evitar versiones recién publicadas (cadena de suministro). Con versión exacta, el paso `git diff --exit-code` depende de un generador fijo |
| Alias con `--root-types --root-types-no-schema-prefix` en lugar de escribirlos a mano | Aceptada | El generador emite un alias por esquema (`Cuenta`, `Comprobante`, `Movimiento`, …), así que no pueden desincronizarse del contrato |
| El tipo `TipoProblema` generado chocaba con el que exportaba `problemas.ts` (T-SHR-05) | `problemas.ts` usa el tipo generado; `TIPOS_PROBLEMA` lleva `satisfies readonly TipoProblema[]` | Una sola fuente del tipo. La prueba que leía el YAML con `?raw` y una regex se cambió por `expectTypeOf`, que verifica el compilador |

**Primera corrida de `redocly lint`:** 0 errores, así que no hubo commit de correcciones. Hubo 4 warnings, que quedan pendientes de decisión: `info-license-strict` (licencia privada sin `url`), dos `no-server-example.com` (los `servers` apuntan a `localhost`, que es intencional para desarrollo local) y `operation-4xx-response` en `GET /health`.

**Pruebas de mutación:** al quitar un `type` de `TIPOS_PROBLEMA`, el typecheck falló. Al renombrar `saldoCentavos` en `openapi.yaml` y regenerar, `git diff --exit-code` salió con 1. En los dos casos se restauró el archivo.

**Seguimiento (revisión mía después del commit):**
- **Warnings de Redocly:** `info-license-strict` y `no-server-example.com` se apagan en `redocly.yaml`, con su motivo: prueba técnica sin licencia pública, y todo corre en local según el enunciado. `operation-4xx-response` **no** se apaga: `.redocly.lint-ignore.yaml` la ignora solo en `GET /health`, porque un health check no tiene errores del cliente. Una mutación (`POST /auth/login` sin respuestas 4xx) confirmó que la regla sigue activa en el resto del contrato. `redocly lint` queda sin errores ni warnings.
- **Corrección a la IA:** el commit de T-SHR-06 cambió el origen de `TipoProblema` (ahora viene de los tipos generados), pero no actualizó `design.md` §13.1, que seguía presentándolo como algo que define el módulo `problemas`. Se corrigió en un commit `docs(specs)`. También se confirmó que la prueba usa `toEqualTypeOf` (igualdad exacta), no `toMatchTypeOf`.

**Commits relacionados:** el de T-SHR-06, `aed76b8` y `f0cbb9a` (Redocly) y el de §13.1. "CI en verde" se confirma después del push.

### Sesión 13 — 2026-11-15 · Implementación de T-SHR-07 (esquemas Zod de entrada)

**Herramienta:** Claude Code (Opus 5.5), skill `tdd`, para la implementación, y un chat de revisión con Claude que revisa las salidas de Claude Code y prepara los prompts. Claude Code leyó las specs, propuso un plan con sus seams y una lista de huecos, y yo lo aprobé con ajustes antes de que escribiera código. Las decisiones fueron mías en todos los casos.

**Correcciones a los requerimientos:**

| Qué decía | Problema | Corrección |
|---|---|---|
| DD-28 y §5.1: "una lista de 1,000 contraseñas comunes incluida en `api`" | Con la lista solo en la API, web y móvil no podían rechazar en el formulario lo mismo que la API, y RNF-18 pide validaciones compartidas. Además, la lista no tenía fuente ni criterio: de las 1,000 primeras entradas de SecLists, **0** tienen 12 caracteres o más, así que todas ya las rechazaba la regla de longitud | La lista vive en `shared`. Son las primeras 1,000 **distintas** (después de NFC y minúsculas) de 12 o más code points de SecLists `10-million-password-list-top-1000000.txt`, fijada por commit (`2d5dc75`) y sha256. Un script la genera de forma reproducible y verifica el sha256. DD-28 registra la opción descartada (solo en `api`) y el costo: unos 19 kB en el bundle. El chat de revisión señaló que una top-1000 sin filtrar no aporta nada con mínimo de 12 caracteres; Claude Code midió que 0 de las top-1000 cumplen y detectó los duplicados por mayúsculas (987 distintas). Yo decidí la lista en `shared`, filtrar antes de cortar y tomar 1,000 distintas |
| R-5.7: "SI el cursor está mal formado … `invalid-cursor`" | Mezclaba la forma del parámetro con su contenido. Al agregar `minLength: 1` al `cursor` en `openapi.yaml`, un cursor vacío lo rechaza el esquema con `validation-error`, y R-5.7 lo contradecía | R-5.7 separa los dos casos: un cursor vacío o de más de 512 caracteres da `validation-error`, y uno que no se puede decodificar o que se generó con otros filtros da `invalid-cursor`. Se ajustaron §7.2, §8.3, T-SHR-07 y T-API-22. Claude Code señaló que el cursor vacío pasaba; el chat de revisión señaló que `minLength` contradecía R-5.7. Yo decidí `minLength: 1` y reescribir R-5.7 separando forma y contenido |
| §6.7 no fijaba el formato de los uuid; Claude Code usó `z.uuid()` | `z.uuid()` exige versión y variante de RFC 9562, pero `openapi.yaml` declara `format: uuid`, que solo pide 8-4-4-4-12 hexadecimal: Zod se desviaba del contrato (DD-27). Con eso, el id de Fondeo (`00000000-0000-0000-0000-000000000001`, versión 0) se rechazaba con `400` por formato, cuando debe llegar a la revisión de propiedad como cualquier cuenta ajena | §6.7 agrega la fila de uuid (ids e `Idempotency-Key`): 8-4-4-4-12 hexadecimal, sin exigir versión, en minúsculas, igual que `format: uuid`. Los esquemas usan `z.guid()`, así que el id de Fondeo responde `404` por propiedad y no `400` por formato. Claude Code lo señaló como observación (`z.uuid()` rechazaba el id de Fondeo aunque `format: uuid` lo acepta); yo decidí alinearlo al contrato con `z.guid()`. |

**Otros huecos:**
- DD-16 y §6.7 no decían en qué unidad se cuenta la longitud. Ahora dicen code points después de NFC, como `char_length` de PostgreSQL y `maxLength` de JSON Schema, con la nota del emoji ZWJ. Claude Code lo señaló con una premisa equivocada (que Zod contaba unidades UTF-16); el chat de revisión la corrigió con una prueba y Claude Code confirmó que zod 4.6.7 cuenta code points. Yo decidí documentarlo en DD-16 sin agregar un refine.
- §4.3 ponía `montoTextoACentavos` como refinamiento de Zod, pero no hay esquemas de formulario. Claude Code lo detectó; yo decidí reemplazarlo por los refinamientos reales: el dígito verificador de la CLABE, la lista de contraseñas y `desde` ≤ `hasta`.
- La prueba de tipos pasa a `z.input` y `z.output` en los dos sentidos, como pidió mi prompt. Claude Code detectó que en la query del historial solo aplica un sentido, `z.output`, porque el valor por defecto de `limite` (`default(20)`) lo vuelve obligatorio; yo lo aprobé.

**Commits relacionados:** `7c38521` (lista de contraseñas y forma del cursor), `32c527e` (formato de uuid en §6.7) y el de T-SHR-07.

### Sesión 14 — 2026-11-20 · Implementación de T-API-02 (configuración validada y arranque)

**Herramienta:** Claude Code (Opus 5.5) con la skill `tdd`. Claude Code leyó las specs y propuso un plan con sus seams y una lista de huecos de §2.4, y yo lo aprobé con ajustes antes de que escribiera código. Las decisiones fueron mías en todos los casos.

**Correcciones a los requerimientos:**

| Qué decía | Problema | Corrección |
|---|---|---|
| T-API-02: verificación con `npx vitest run -w api -t "RNF-15"`. DD-46 (`tasks.md` §1.4): `npx vitest run -t "R-4.14"` | `npx` le pasa a vitest todo lo que va después de `vitest`, y vitest lee `-w` como `--watch`. El comando arrancaba en modo watch desde la raíz, donde no hay configuración de Vitest, y se quedaba colgado | La convención de DD-46 usa el script del workspace, `npm test -w api -- -t "R-4.14"`, y prohíbe `npx vitest` desde la raíz. La verificación de T-API-02 pasa a `npm test -w api -- -t "RNF-15"`. Claude Code detectó que se colgaba y propuso `npx -w api vitest run`; yo decidí la forma del resto del repo (`npm test -w <workspace> -- …`), extender la regla a DD-46 y dejar la línea de T-API-10 para T-API-09, que crea esa configuración |
| §2.4 no enumeraba los niveles de `LOG_LEVEL`, aceptaba cualquier URL en `WEB_ORIGIN` y `DATABASE_URL`, no exigía `> 0` en el límite ni en el umbral, ni decía qué valor tenían los secretos en `.env.example` ni con qué nivel se registra una configuración inválida | `WEB_ORIGIN=http://localhost:5173/` habría pasado la validación y roto CORS sin aviso, porque `cors` compara el origen exacto. Un `.env.example` con secretos de ejemplo válidos dejaba arrancar con un secreto conocido. RNF-15 exige enteros positivos en el límite y el umbral | §2.4: `LOG_LEVEL` en `fatal`…`silent`; `WEB_ORIGIN` solo el origen `http(s)`, sin ruta, query, fragmento ni `/` final; `DATABASE_URL` con protocolo `postgres:` o `postgresql:`; límite y umbral `> 0`; secretos vacíos en `.env.example`, con el comando para generarlos, para que no arranque sin ellos; el registro de la configuración inválida usa el nivel `info` porque `LOG_LEVEL` todavía no está validado. Claude Code señaló los huecos (a–f) y propuso las reglas. Yo las aprobé y agregué dos: `WEB_ORIGIN` con `https:` en producción, porque la cookie del refresh lleva `Secure` (DD-24), y `PORT` de 1 a 65535 |

**Otros huecos:**
- Zod 4 corre `superRefine` aunque un campo ya haya fallado. Con `LIMITE_DIARIO_CENTAVOS=0` se reportaba también `UMBRAL_CODIGO_CENTAVOS`, que estaba sano, y eso contradice la regla de §2.4 de que cada regla cruzada reporta la variable que la rompe. Las reglas cruzadas ahora corren solo si no hay errores de campo (`when` de Zod 4), y una prueba lo cubre. Claude Code lo detectó en una prueba en rojo y lo resolvió siguiendo §2.4, bajo mi instrucción de resolver los huecos menores conforme a las specs; yo lo revisé y lo aprobé al cerrar la tarea.

**Commits relacionados:** `5728c50` (§1.2 y §2.4), `97862a2` (verificación con el script del workspace) y el de T-API-02.

### Sesión 15 — 2026-11-20 · Implementación de T-API-03 (middlewares, problemas RFC 7807, logs y documentación navegable)

**Herramienta:** Claude Code (Opus 5.5) con la skill `tdd`. Claude Code leyó las specs y propuso un plan con sus seams y una lista de huecos, y yo lo aprobé con ajustes una sola vez antes de que escribiera código. Las decisiones fueron mías en todos los casos.

**Correcciones a los requerimientos:**

| Qué decía | Problema | Corrección |
|---|---|---|
| DD-42 y §13.1: las reglas de dinero aplican en `web`, `mobile` y `shared` | La API, donde viven los casos de uso que mueven dinero, quedaba fuera de la regla que prohíbe redondear | DD-42 y §13.1 extienden las reglas a `api/**`, código y pruebas. Una excepción solo se admite en la línea, con `eslint-disable-next-line` y el motivo. Claude Code señaló en la sesión 14 que `api/**` no estaba cubierta; yo decidí extender las reglas en esta tarea |
| §10.1: las propiedades sensibles se censuran con las rutas `*.campo` y `*.*.campo` | En pino, `*` exige un nivel de anidación: `logger.info({ contrasena })` salía en claro. Claude Code lo midió con pino 10.4.0 (los niveles 1 y 2 se censuran; el superior y el 3, no) | Cada campo lleva tres rutas: `campo`, `*.campo` y `*.*.campo`. Claude Code detectó el hueco y propuso la ruta simple; yo la aprobé. Una prueba censura cada uno de los 8 campos en los tres niveles |
| §7.1: "`title` es fijo por `type`", sin tabla de títulos; `detail` "texto fijo en español", sin decir cuál | Cada implementación habría inventado sus títulos, y el texto de `detail` podía separarse del que muestran los clientes | §7.2 fija el `title` de los 18 `type`, y `detail` es `mensajeDeProblema(type)` de `shared`, una sola fuente para la API, la web y el móvil. Claude Code señaló el hueco y propuso los títulos y la fuente de `detail`; yo los aprobé |
| §2.2 y DD-09: el `X-Request-Id` entrante se acepta "si es un UUID" | No decía qué forma de UUID ni qué hacer con las mayúsculas | Se acepta la forma 8-4-4-4-12 hexadecimal sin distinguir mayúsculas ni exigir versión, y se devuelve y registra en minúsculas; cualquier otro texto se reemplaza por `crypto.randomUUID()`. Claude Code propuso aceptar solo minúsculas, como §6.7; yo decidí aceptar mayúsculas y normalizarlas |
| §10.3: `GET /api/health` ejecuta `SELECT 1`, pero la base llega en T-API-04 | La salud no se podía implementar ni probar en esta tarea | `crearApp` recibe `verificarBase()`: `200 {"estado":"ok"}` si resuelve y `503 retryable` con `Retry-After: 1` si lanza; T-API-04 la implementa con `SELECT 1`. Claude Code lo propuso; yo lo aprobé |
| DD-08: `crearApp(dependencias)` recibe sus dependencias, sin decir dónde se arman los routers de negocio ni cómo las pruebas inyectan los suyos | Sin un lugar único, la composición podía repartirse entre `main.ts` y cada módulo | DD-08: `crearApp(dependencias, modulos)`. Los routers reales salen de una sola función, `crearModulos(dependencias)` en `modulos/index.ts`, y el segundo parámetro es donde las pruebas inyectan routers. Claude Code propuso el segundo parámetro; yo decidí la función única `crearModulos` |

**Otros huecos:**
- DD-35 decía "17 `type`", pero el catálogo tiene 18 desde que T-SHR-05 agregó `credenciales-invalidas`. Claude Code lo señaló; yo decidí corregirlo en su propio commit.

**Commits relacionados:** `d4eba0f` (DD-42 en `api`), `c117962` (redact, títulos, request ID, salud y `crearModulos`), `6cfb5cc` (DD-35 con 18 `type`) y el de T-API-03.

### Sesión 16 — 2026-11-20 · Implementación de T-API-04 (acceso a datos y unidad de trabajo)

**Herramienta:** Claude Code (Opus 5.5) con la skill `tdd`. Claude Code leyó las specs y propuso un plan con sus seams y una lista de huecos, y yo lo aprobé con ajustes antes de que escribiera código. Las decisiones fueron mías en todos los casos.

**Correcciones a los requerimientos:**

| Qué decía | Problema | Corrección |
|---|---|---|
| §2.1 y D-07: `ProveedorOtpSimulado` solo se instancia con `OTP_SIMULADO=true` | Nada decía qué proveedor recibe `crearApp` con `OTP_SIMULADO=false`, que es justo producción | §2.1 agrega `ProveedorOtpNoConfigurado`: su `enviar` siempre lanza y es el punto de integración con SMS o correo. Si `enviar` falla después del `COMMIT`, la API registra la causa y responde `500`; la transferencia queda pendiente, no mueve dinero ni consume el límite, y expira sola a los 5 minutos (§6.5). Claude Code señaló el hueco y propuso el proveedor. Yo pedí además que el envío ocurriera dentro de la transacción; Claude Code señaló que eso contradecía §6.5 y retenía los bloqueos durante una llamada externa. Yo decidí mantener §6.5 (envío después del `COMMIT`) |
| §14.2 no decía de dónde salen las URLs de las pruebas de integración | Sin una fuente propia, las pruebas habrían usado el esquema de configuración de la API (§2.4) o URLs fijas en el código | §14.2 documenta `PRUEBAS_DATABASE_URL` y `PRUEBAS_DATABASE_URL_MIGRACIONES`, con valores por defecto de la base local de `init.sql`; las lee solo `vitest.integracion.config.ts`. Claude Code lo propuso; yo lo aprobé |
| T-API-10 verificaba con `npx vitest run -c vitest.integracion.config.ts` | Esa configuración nace en T-API-04, y `npx vitest` desde la raíz contradice DD-46 | La verificación de T-API-10 pasa a `npm run test:integracion -w api -- -t "…"`. Claude Code señaló el desfase; yo decidí corregirla en esta tarea |
| §2.3 no trataba una base no disponible, aunque §7.2 la lista como `503 retryable` | `conTransaccion` habría propagado `ECONNREFUSED` como error interno (`500`) | §2.3 agrega la fila: una falla al **obtener la conexión** se traduce a `Reintentable`, porque no quedó ningún efecto escrito. Claude Code lo propuso; yo lo aprobé. Una prueba con un proxy TCP que se cierra lo verifica contra la base real |

**Pendiente para T-API-05:**
- Al hidratar una entidad, TypeORM convierte las columnas `timestamptz` a `Date`, aunque el parser de `pg` las entregue como texto. Eso rompería DD-07, que pide texto con microsegundos. Las entidades van a necesitar un `transformer` o una columna tipada como texto. Claude Code lo detectó al revisar §3.5; yo pedí dejarlo anotado para T-API-05.

**Avisos de `npm audit` aceptados:**
- Claude Code detectó 3 vulnerabilidades moderadas en dependencias de producción al instalar `typeorm@0.3.31`: `typeorm` → `glob@10.5.0` → `minimatch@9.0.9` (GHSA-3g3m-2fjr-6pw4 en `glob` ≤ 14.0.1 y GHSA-g3hv-75wg-m249 en `minimatch` < 11.0.1). La corrección está en `minimatch` ≥ 11.0.1 y `glob` ≥ 14.0.2. `glob@10` solo acepta `minimatch ^9.0.4`, y `typeorm` 0.3 pide `glob ^10.5.0`, así que la única salida sería `typeorm` 1.x, que contradice DD-01. Yo decidí aceptarlo, porque `typeorm` solo usa `glob` cuando recibe patrones de texto en `migrations`, `entities` o `subscribers`. Una prueba de integración (`listas-explicitas.test.ts`, DD-05) garantiza que esas opciones solo contienen clases: falla si alguien agrega un patrón como `'src/**/*.ts'`. Mi primer dato decía que la corrección estaba en `minimatch` 10; Claude Code lo verificó con `npm audit` y registró las versiones correctas.

**Commits relacionados:** `d8525b5` (proveedor de OTP no configurado, conexión fallida reintentable y URLs de las pruebas) y el de T-API-04.

### Sesión 17 — 2026-11-20 · Implementación de T-API-05 a T-API-08 (migraciones)

**Herramienta:** Claude Code (Opus 5.5) con la skill `tdd`. Claude Code leyó §3.1 a §3.7 y propuso un solo plan para las cuatro migraciones, con sus seams y una lista de huecos. Yo lo aprobé con ajustes antes de que escribiera código. Las decisiones fueron mías en todos los casos.

**Correcciones a los requerimientos (T-API-05):**

| Qué decía | Problema | Corrección |
|---|---|---|
| §7.3 pedía triggers `tg_<tabla>_<accion>`, pero §3.3 los nombraba `cuenta_protegida`, `asiento_inmutable`, etc. | Dos convenciones para el mismo objeto. Además, el error de un trigger (`P0001`) llegaba sin `constraint`, y DD-18 lo identificaba como "el `P0001` de `cuenta_protegida`", es decir, por el texto del mensaje, que DD-35 prohíbe | Las funciones conservan el nombre de §3.3 y los triggers usan `tg_<tabla>_<accion>` (tabla de equivalencias en §3.3). Cada `RAISE EXCEPTION` lleva `USING ERRCODE = 'P0001', CONSTRAINT = '<trigger>'`, así que el error llega con su `constraint` como un `CHECK` (§7.3, DD-35). La convención suma `pk_` e `ix_`. Claude Code señaló la diferencia y propuso los nombres; yo decidí agregar `ERRCODE` y `CONSTRAINT` y pedí una prueba de que el error de `cuenta_protegida` llega con `constraint = 'tg_cuenta_protegida'` |
| §3.2: solo `usuario` tenía `DEFAULT gen_random_uuid()` | DD-11 dice que las cinco tablas con `uuid` lo generan en la base | §3.2 pone el `DEFAULT` en `cuenta`, `beneficiario`, `transferencia` y `sesion`. Claude Code lo señaló; yo lo aprobé |
| §3.2: el `CHECK` de `usuario.correo` solo pedía minúsculas y longitud | DD-16 aplica a todos los campos de texto, incluido el correo, la regla de `btrim` y sin caracteres de control | §3.2 agrega esas reglas al correo. Claude Code lo señaló; yo lo aprobé |
| §3.6: `clabe_valida(text) IMMUTABLE`, sin decir qué devuelve con un texto que no sean 18 dígitos | Con una función `sql`, el planificador puede evaluar `substr(...)::int` antes del `CASE` cuando recibe un literal, y lanzar un error en vez de devolver `false` | §3.6: devuelve `false` para todo lo que no sean 18 dígitos ASCII y `NULL` con `NULL` (`STRICT`). Se implementa en `plpgsql` para que no se inlinee. Claude Code lo propuso; yo lo aprobé |

**Decisiones de implementación (T-API-05):**
- DD-07 con TypeORM: las columnas `timestamptz` de las entidades se declaran como texto con `columnaInstante()`. Una entidad de sondeo comprobó, antes de usarlo en el modelo, que la lectura y la escritura conservan los microsegundos. La decisión fue mía; Claude Code la verificó primero, como pedí.
- Sin `emitDecoratorMetadata`, porque esbuild y Oxc no lo soportan: cada `@Column` declara su `type`. Vitest usa Oxc (Vite 8), que no lee `experimentalDecorators` para `test/`, porque está fuera del `include` de `tsconfig.json`; las dos configuraciones de Vitest declaran `oxc.decorator.legacy`. Claude Code lo detectó al ver fallar la primera prueba con decoradores; yo aprobé no usar `emitDecoratorMetadata` en el plan.
- La mutación de un peso de `clabe_valida` en el archivo de la migración hace fallar la migración misma, porque la CLABE de Fondeo deja de ser válida. Para que fallara la comparación, Claude Code también mutó la función ya desplegada en la base.

**Commits relacionados (T-API-05):** `2d503d7` (nombres de triggers con `constraint`, `uuid` por defecto, reglas del correo y `clabe_valida` estricta) y el de T-API-05.

---

## Propuestas inseguras o incorrectas con el dinero

Registro específico de lo que la IA propuso y era riesgoso para la integridad del dinero.

| Fecha | Qué propuso la IA | Por qué era incorrecto | Cómo se corrigió |
|---|---|---|---|
| 2026-11-13 | Confirmar el código de un solo uso sin idempotencia (D-07, primera versión) | Con un doble clic en "Confirmar", la segunda petición podía responder error después de que la primera ya había movido el dinero, y el usuario podía creer que la transferencia falló y repetirla | Confirmar es idempotente: si la transferencia ya se aplicó, se devuelve el mismo comprobante sin consumir intentos |
| 2026-11-13 | Separar pesos y centavos con división entera y residuo (D-08 y D-18, primera versión) | Es aritmética sobre el monto, y no cubría explícitamente montos negativos ni menores a $1.00; en JS, `-5 % 100` y `Math.trunc(-5 / 100)` dan `-5` y `-0`, y es fácil mostrar mal un cargo pequeño | La separación se hace sobre el texto del entero (los últimos 2 dígitos son centavos), con el signo aparte, sin `/ 100` y con una regla de lint que lo prohíbe |
| 2026-11-13 | Formatear los montos para mostrarlos con `format(centavos / 100)` (propuesto en el chat) | `centavos / 100` produce un `float` en el cliente, que el enunciado prohíbe. Y la operación inversa al capturar (`Math.round(parseFloat(texto) * 100)`) falla en casos como `1.005 * 100 = 100.49999…` | D-18: `formatearMXN` separa pesos y centavos sobre el texto del entero, sin aritmética, y `montoTextoACentavos` procesa el texto capturado. El lint prohíbe `/ 100`, `parseFloat` y las funciones de redondeo (DD-42) |
| 2026-11-13 | Excluir los traspasos del límite diario sin precisar cómo se clasifica una transferencia como traspaso (sugerido por Claude en el chat; yo lo adopté) | Sin una regla de clasificación, el tipo podía depender del camino que elige el cliente (cuenta propia o beneficiario) y no de quién recibe el dinero. Al registrar una cuenta propia como beneficiario, el mismo destino podía clasificarse de dos formas, y la exclusión de los traspasos quedaba expuesta a que se disfrazara el tipo para saltarse el límite diario | D-04: la transferencia se clasifica por el **dueño real** de la cuenta destino al aplicarla. Un beneficiario cuya CLABE es propia es un traspaso de verdad, y un envío a otro usuario siempre es `TERCERO`. DD-17 lo garantiza también en la base. Claude Code detectó el hueco en la sesión 2 y propuso clasificar por el dueño real |
| 2026-11-14 | Al reanudar una transferencia en móvil o web, reenviar siempre la creación, y ante un `202` mostrar directo la captura del código (D-17 y DD-32, primera versión) | Si la red se perdía **al confirmar**, el reintento reenviaba la creación y recibía el `202` original. La app pedía el código otra vez cuando el dinero ya había salido, y el usuario podía creer que la transferencia seguía pendiente | DD-32: el intento guardado registra su fase. Una confirmación interrumpida se reintenta como confirmación (idempotente por D-07), y un `202` recibido por reintento o reanudación se contrasta con `GET /transferencias/{id}` para mostrar el estado real antes de pedir el código |
| 2026-11-14 | Tomar el instante de la transferencia con `now()`, el inicio de la transacción (DD-07, primera versión) | Una transferencia que empezó antes pero confirmó después quedaba con un `creado_en` anterior al cursor que el cliente ya había recorrido, y el historial se la saltaba: un movimiento de dinero real que no aparecía en el historial (R-5.4). Lo detectó la propia IA en su propuesta ya aprobada | DD-36: el instante se lee con `clock_timestamp()` después de bloquear las cuentas, así que todo asiento nuevo de una cuenta es posterior a los ya visibles. Se agregó una prueba de paginación con escrituras concurrentes |

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
