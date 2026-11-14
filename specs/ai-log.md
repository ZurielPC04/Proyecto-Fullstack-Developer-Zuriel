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
