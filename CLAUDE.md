# Reglas del proyecto

## Spec-driven

- Ningún código sin una tarea en `specs/tasks.md`.
- Si una tarea descubre un hueco, primero se corrige `specs/requirements.md` o `specs/design.md` en su propio commit, y después se sigue con la tarea.

## Fuentes de verdad

- `specs/requirements.md`
- `specs/design.md` (decisiones DD en §16)
- `specs/decisiones.md`
- `specs/openapi.yaml`
- `GLOSSARY.md`

## Código

- Montos siempre en centavos como enteros; nunca `float` (D-18, DD-42).
- La lógica financiera no vive en los handlers (DD-08).
- Solo `npm` con workspaces; no `pnpm` ni `yarn`.
- Archivos en UTF-8 y LF.
- Nunca subir `.env`; solo `.env.example`.

## Commits

- Formato de `specs/tasks.md` §1.4: Conventional Commits citando la tarea y sus criterios, p. ej. `feat(api): T-API-17 transferencia sin código con bloqueo [R-4.1, R-4.3]`.

## Al cerrar cada tarea

1. Correr su verificación.
2. Marcar su casilla en `specs/tasks.md`.
3. Hacer commit.
4. Registrar en `specs/ai-log.md` las correcciones relevantes a los requerimientos.
