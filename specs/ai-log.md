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

## Propuestas inseguras o incorrectas con el dinero

Registro específico de lo que la IA propuso y era riesgoso para la integridad del dinero.

| Fecha | Qué propuso la IA | Por qué era incorrecto | Cómo se corrigió |
|---|---|---|---|
| _(pendiente)_ | | | |

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
