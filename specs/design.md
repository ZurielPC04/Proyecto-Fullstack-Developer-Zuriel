# Diseño — Billetera digital MXN

Fase 2 del flujo spec-driven (Requisitos → **Diseño** → Tareas). Insumos: `docs/enunciado.md`, `specs/requirements.md`, `specs/decisiones.md` (D-01 a D-20), `specs/esqueleto.md` y `GLOSSARY.md`.

Este documento dice **cómo** se cumplen los requisitos. El contrato HTTP completo vive en [`specs/openapi.yaml`](./openapi.yaml); aquí se resume y se justifica.

---

## 0. Convenciones

### 0.1 Identificadores

| Prefijo | Significado | Fuente |
|---|---|---|
| `R-x.y` | Criterio de aceptación | `requirements.md` |
| `RNF-nn` | Requisito no funcional | `requirements.md` |
| `CB-n` | Caso borde del enunciado | `requirements.md` §10 |
| `D-nn` | Decisión cerrada en el interrogatorio | `decisiones.md` |
| `DD-nn` | **Decisión de diseño nueva**, tomada en este documento | este documento, §16 |
| `§n.m` | Sección de este documento | — |

`tasks.md` y los mensajes de commit citan `R-`, `RNF-`, `D-` y `DD-`.

### 0.2 Decisiones nuevas

Toda decisión que no esté en `decisiones.md` se marca en el texto así:

> **DD-nn · Propuesta · Título**
> **Contexto:** … **Opciones:** … **Decisión:** … **Motivo:** …

Estados posibles: **Propuesta** (pendiente de aprobación), **Aprobada** o **Rechazada**. La §16 las consolida. Al aprobarse, cada una pasa a `decisiones.md` como `D-21` en adelante, y el `DD-nn` queda como alias.

Una precisión de una decisión existente que no cambia su sentido (por ejemplo, el nombre de una función) **no** se marca como `DD`; se cita la `D-nn` que precisa.

### 0.3 Reglas de redacción

- Todos los montos están en **centavos enteros** (D-18). Ningún ejemplo usa pesos con decimales, salvo la presentación.
- El vocabulario del dominio es el de `GLOSSARY.md`: _cuenta_, _saldo_, _asiento_, _movimiento_, _transferencia_, _traspaso_, _depósito_, _Fondeo_.
- Los identificadores de código (tablas, columnas, módulos, funciones) van en español, sin acentos ni `ñ` (`contrasena`, `codigo`). Los términos técnicos sin traducción natural se dejan en inglés (`middleware`, `request ID`, `hash`).
- Los diagramas usan Mermaid y deben dibujarse en GitHub.

---

## 1. Stack y estructura del monorepo

### 1.1 Stack

Las versiones mayores se fijan aquí; las exactas quedan en `package-lock.json`.

| Capa | Tecnología | Requisito | Notas |
|---|---|---|---|
| Runtime | Node.js **24 LTS** | RNF-16 (≥ 20) | Ver DD-01 |
| Lenguaje | TypeScript 5, `strict` + `noUncheckedIndexedAccess` | RNF-16 | `tsconfig.base.json` compartido |
| HTTP | Express **5** | RNF-16 | Propaga a `next` los errores de handlers `async` sin envoltorios |
| Base de datos | PostgreSQL **17** | RNF-16 (≥ 15) | En Docker Compose (§1.3) |
| Acceso a datos | TypeORM 0.3, driver `pg` | RNF-16 | `synchronize: false`, migraciones a mano (DD-05) |
| Validación | Zod 4 | RNF-01, RNF-18 | Esquemas en `packages/shared` |
| JWT | `jose` | RNF-02 | DD-02 |
| Contraseñas | `argon2` (argon2id) | RNF-03 | Parámetros en §5 |
| Logs | `pino` + `pino-http` | RNF-12 | DD-02 |
| Rate limit | `express-rate-limit` | RNF-04 | Store y umbrales en §11 |
| Seguridad HTTP | `helmet`, `cors`, `cookie-parser` | RNF-05 | |
| Docs OpenAPI | `swagger-ui-express` sirviendo `specs/openapi.yaml` | RNF-28 | §4.3 |
| Tipos del contrato | `openapi-typescript` | RNF-18 | §4.3 |
| Web | React **19** + Vite, React Router, TanStack Query 5, React Hook Form + `@hookform/resolvers/zod` | Enunciado Fase 3 | DD-03 |
| Móvil | Expo (SDK estable vigente, ≥ 54), React Navigation (native stack), `expo-secure-store`, `expo-crypto`, `@react-native-community/netinfo` | Enunciado Fase 3 | DD-03 |
| Pruebas | Vitest (`api`, `web`, `shared`), `jest-expo` (`mobile`), Supertest, Testing Library | RNF-22 a RNF-26 | DD-04 |
| Lint y formato | ESLint (flat config) + `typescript-eslint` + Prettier | RNF-09, RNF-29 | Reglas de dinero en §13.1 |
| CI | GitHub Actions | RNF-29 | §14 |

> **DD-01 · Aprobada · Versiones mayores del stack**
> **Contexto:** el enunciado fija mínimos (Node 20, PostgreSQL 15, React 18). Node 20 terminó su soporte en abril de 2026.
> **Opciones:** (1) los mínimos exactos; (2) las LTS y estables vigentes.
> **Decisión:** Node 24 LTS, PostgreSQL 17, Express 5, React 19. Web y móvil usan **la misma versión exacta de React** que fija Expo, para que npm workspaces no instale dos copias de React en la raíz.
> **Motivo:** cumplen los mínimos, tienen soporte durante la evaluación, y Express 5 elimina el envoltorio `asyncHandler`, que es una fuente común de errores no atrapados.

> **DD-02 · Aprobada · Librerías de la API**
> **Contexto:** el enunciado exige JWT, argon2 o bcrypt y logs JSON, pero no fija librerías.
> **Opciones:** `jsonwebtoken` o `jose` para JWT; `winston` o `pino` para logs; `bcrypt` o `argon2`.
> **Decisión:** `jose` (API basada en promesas, tipada, sin dependencias nativas), `pino` + `pino-http` (JSON nativo, `redact` por rutas para enmascarar, `genReqId` para el request ID) y `argon2` en modo argon2id (recomendación de OWASP).
> **Motivo:** cada una resuelve un requisito sin código adicional: `redact` cubre RNF-12 y `genReqId` el request ID.

> **DD-03 · Aprobada · Librerías de los clientes**
> **Contexto:** el enunciado fija React + Vite + TanStack Query y Expo, pero no el ruteo ni los formularios.
> **Opciones:** formularios con estado propio o con React Hook Form; en móvil, `expo-router` (rutas por archivos) o React Navigation.
> **Decisión:** React Hook Form con el resolver de Zod, para validar con **los mismos esquemas** de `packages/shared` (RNF-18). En móvil, React Navigation con *native stack* y stacks condicionales: el stack autenticado no se monta mientras haya un intento pendiente sin resolver (R-4.31).
> **Motivo:** el gating de R-4.31 se expresa directo como "qué stack se monta", sin redirecciones de rutas por archivo.

> **DD-04 · Aprobada · Ejecutores de pruebas**
> **Contexto:** hay que probar Node, React y React Native.
> **Opciones:** Jest en todo; Vitest en todo; mixto.
> **Decisión:** Vitest en `api`, `web` y `shared`; `jest-expo` en `mobile`.
> **Motivo:** Vitest comparte la configuración de Vite en web y corre TypeScript sin transpilación aparte. `jest-expo` es el preset que mantiene Expo; forzar Vitest sobre React Native añade riesgo sin beneficio.

### 1.2 Estructura del monorepo

npm workspaces con cuatro paquetes. `packages/shared` no depende de ningún otro; `api`, `web` y `mobile` dependen solo de `shared`.

```text
billetera/
├── package.json                # workspaces y scripts raíz (§1.3)
├── tsconfig.base.json          # strict, noUncheckedIndexedAccess
├── eslint.config.js            # reglas comunes y de dinero (§13.1)
├── docker-compose.yml          # PostgreSQL 17
├── docker/postgres/init.sql    # roles y base de pruebas (§3.4)
├── .github/workflows/ci.yml    # §14
├── GLOSSARY.md
├── README.md
├── docs/aws-deploy.md
├── specs/                      # requirements, design, tasks, ai-log, decisiones, esqueleto, openapi.yaml
├── packages/shared/
│   └── src/
│       ├── dinero/             # montoTextoACentavos, formatearMXN, centavosATextoDecimal
│       ├── clabe/              # validarClabe, digitoVerificador
│       ├── esquemas/           # Zod: auth, beneficiario, transferencia, historial
│       ├── api/openapi.ts      # tipos generados (§4.3), versionados
│       └── index.ts
├── api/
│   ├── src/
│   │   ├── main.ts             # config → base de datos → listen
│   │   ├── app.ts              # raíz de composición y middlewares (§2.2)
│   │   ├── config/             # esquema Zod del entorno (§2.4)
│   │   ├── plataforma/
│   │   │   ├── db/             # DataSource, parsers de pg, unidad de trabajo (§2.3)
│   │   │   ├── http/           # request ID, validar, autenticar, problem, rate limit
│   │   │   ├── logging/        # pino y enmascarado (§10)
│   │   │   ├── reloj/          # puerto Reloj (§2.1)
│   │   │   └── otp/            # puerto ProveedorOtp (§2.1)
│   │   ├── modulos/
│   │   │   ├── identidad/
│   │   │   ├── cuentas/
│   │   │   ├── beneficiarios/
│   │   │   ├── transferencias/
│   │   │   ├── limites/
│   │   │   ├── movimientos/
│   │   │   ├── estado-cuenta/
│   │   │   └── auditoria/
│   │   ├── migraciones/        # TypeORM, SQL a mano (§3.5)
│   │   └── scripts/            # migrar.ts, seed.ts
│   └── test/
│       ├── unit/
│       ├── integracion/
│       └── concurrencia/
├── web/
│   └── src/
│       ├── app/                # router, QueryClient, layout
│       ├── auth/               # access en memoria, refresh con Web Locks
│       ├── api/                # cliente fetch tipado
│       ├── transferencia/      # máquina del intento (§13.2)
│       ├── pantallas/
│       └── componentes/
└── mobile/
    └── src/
        ├── navegacion/
        ├── auth/               # SecureStore, una sola promesa de refresh
        ├── api/
        ├── transferencia/      # máquina del intento con reintentos (§13.3)
        ├── privacidad/         # ocultar en segundo plano (§13.3)
        └── pantallas/
```

> **DD-05 · Aprobada · Compilación del paquete compartido y ejecución de migraciones**
> **Contexto:** Vite, Metro y Node tienen que consumir `packages/shared`. Además, el CLI de TypeORM tiene fricciones conocidas con ESM y TypeScript, y `migration:generate` no produce triggers, funciones ni permisos.
> **Opciones:** (1) exportar el código TypeScript fuente de `shared` y que cada consumidor lo transpile; (2) compilar `shared` con `tsc` a `dist/` (ESM + `.d.ts`).
> **Decisión:**
> - `shared` se compila con `tsc -b` a `dist/`. Los scripts `predev`, `pretest` y `prebuild` de la raíz lo compilan primero.
> - Todo el monorepo es ESM.
> - Las migraciones **se escriben con TypeORM, a mano**: cada una es una clase que implementa `MigrationInterface` (`up` y `down` con `queryRunner.query(sql)`), sin `migration:generate`. Así se cumple "las migraciones se escriben con TypeORM" del enunciado.
> - El script propio `api/src/scripts/migrar.ts` **solo las ejecuta**: carga el `DataSource` con el rol dueño (§3.4) y llama a `dataSource.runMigrations({ transaction: 'each' })`. No sustituye a TypeORM, sustituye al CLI. El motivo (ESM) está en §3.5.
> **Motivo:** la API en producción corre JavaScript compilado y necesita `shared` compilado de todos modos. Un solo camino evita diferencias entre desarrollo y CI. Casi todo lo importante del esquema es SQL que TypeORM no genera (§3.5).

### 1.3 Entorno local

**Requisitos de la máquina:** Node 24, Docker y, para móvil, Expo Go en un teléfono de la misma red o un simulador.

**Servicios y puertos**

| Servicio | Cómo corre | Puerto |
|---|---|---|
| PostgreSQL 17 | `docker compose` | `5432` |
| API | `tsx watch` en el host | `3000`, rutas bajo `/api` |
| Web | Vite en el host; proxy de `/api` a `:3000` (D-06) | `5173` |
| Móvil | `expo start` | Metro en `8081` |

`docker/postgres/init.sql` se ejecuta una sola vez al crear el volumen. Crea las bases `billetera` y `billetera_test` y los roles de §3.4.

**Scripts de la raíz**

| Script | Qué hace |
|---|---|
| `npm run db:up` | `docker compose up -d --wait` |
| `npm run db:migrate` | Aplica las migraciones con el rol dueño (DD-05) |
| `npm run db:seed` | Seed de §3.7: usuarios demo y 100,000 movimientos o más |
| `npm run dev` | Compila `shared` y levanta API y web en paralelo (`concurrently`) |
| `npm run mobile` | `expo start` en `mobile` |
| `npm test` | Pruebas unitarias de los cuatro paquetes |
| `npm run test:integracion` | Integración y concurrencia contra `billetera_test` (§14) |
| `npm run lint` / `npm run typecheck` | En todos los workspaces |
| `npm run gen:tipos` | Regenera `packages/shared/src/api/openapi.ts` (§4.3) |
| `npm run docs` | Abre Swagger UI en `http://localhost:3000/api/docs` |

**Variables de entorno.** `api/.env.example` trae los valores de desarrollo de §2.4, incluido `FONDEO_BIENVENIDA_CENTAVOS=1000000` (D-20). La app móvil apunta a la API con `EXPO_PUBLIC_API_URL=http://<IP-de-la-LAN>:3000/api`. No usa el proxy de Vite ni cookies (D-06): manda el refresh en el cuerpo.

**Cookie `Secure` en local.** En desarrollo, la web se sirve en `http://localhost:5173`. Chrome, Edge y Firefox tratan `localhost` como contexto seguro y aceptan cookies `Secure` sin HTTPS. El README indica usar uno de esos navegadores. No se crea una bandera para desactivar `Secure`: sería un interruptor de seguridad que podría llegar a producción.

> **DD-06 · Aprobada · Base de datos local en Docker con base de pruebas separada**
> **Contexto:** RNF-23 exige integración contra un PostgreSQL real, y la prueba de concurrencia no debe ensuciar los datos demo.
> **Opciones:** (1) PostgreSQL instalado en el host; (2) Testcontainers; (3) Docker Compose con dos bases.
> **Decisión:** Docker Compose con las bases `billetera` (desarrollo y demo) y `billetera_test` (pruebas). Las pruebas de integración migran `billetera_test` al iniciar la suite y vacían las tablas entre archivos con el rol dueño. En CI se usa un *service container* de PostgreSQL 17 con el mismo `init.sql`.
> **Motivo:** el mismo `init.sql` crea los roles en local y en CI, de modo que las pruebas de permisos (RNF-11) se ejecutan igual en los dos lados. Testcontainers agrega arranque lento y una dependencia de Docker dentro de Node, sin beneficio sobre un service container.

---

## 2. Arquitectura de la API

### 2.1 Módulos y capas

La API es un **monolito modular**: un módulo por área del dominio (esqueleto §2), y cada módulo dividido en las mismas cuatro capas.

```mermaid
flowchart TB
    subgraph HTTP["Capa HTTP"]
        RUT["*.rutas.ts<br/>middlewares + esquema Zod"]
        CTL["*.controlador.ts<br/>req → comando · resultado → HTTP"]
    end
    subgraph APP["Capa de aplicación"]
        CU["*.casos-uso.ts<br/>abre la unidad de trabajo, orquesta, audita"]
    end
    subgraph DOM["Capa de dominio"]
        REG["*.dominio.ts<br/>funciones puras: clasificar, evaluar límite,<br/>transición de estado, hash de petición"]
    end
    subgraph DAT["Capa de datos"]
        REP["*.repositorio.ts<br/>TypeORM: QueryBuilder, bloqueos, SQL parametrizado"]
        ENT["*.entidad.ts<br/>mapeo TypeORM"]
    end
    PUE["Puertos<br/>Reloj · ProveedorOtp"]

    RUT --> CTL --> CU
    CU --> REG
    CU --> REP --> ENT
    CU --> PUE
```

| Capa | Responsabilidad | No puede |
|---|---|---|
| Rutas | Declarar método y ruta, rate limit, `autenticar` y `validar(esquema)` | Contener lógica |
| Controlador | Convertir la petición validada en un comando; convertir el resultado en código HTTP y cuerpo | Importar repositorios, `EntityManager` ni `DataSource`; decidir reglas de negocio |
| Casos de uso | Abrir la unidad de trabajo (§2.3), tomar bloqueos en el orden de D-12, llamar al dominio, persistir y auditar | Importar `express` ni conocer códigos HTTP |
| Dominio | Reglas puras, sin E/S, con pruebas unitarias sin base de datos | Hacer E/S |
| Repositorio | Consultas con el `EntityManager` de la transacción que recibe | Abrir transacciones propias |

**La lógica financiera vive en casos de uso y dominio**, nunca en los handlers (RNF-16). Una regla de ESLint (`no-restricted-imports` por patrón de archivo) hace cumplir la columna "No puede".

**Módulos y dependencias**

```mermaid
flowchart LR
    ID[identidad] --> CTA[cuentas]
    ID --> TRF[transferencias]
    ID --> AUD[auditoria]
    BEN[beneficiarios] --> CTA
    TRF --> CTA
    TRF --> BEN
    TRF --> LIM[limites]
    TRF --> AUD
    MOV[movimientos] --> CTA
    EC[estado-cuenta] --> MOV
    EC --> CTA
```

| Módulo | Contenido | Requisitos |
|---|---|---|
| `identidad` | Registro (con cuentas y fondeo de bienvenida en la misma transacción), login, refresh, logout | HU-1 |
| `cuentas` | Consulta de cuentas propias, bloqueo de cuentas, generación de CLABE | HU-2, R-1.1 |
| `beneficiarios` | Alta y consulta, resolución de CLABE a cuenta | HU-3 |
| `transferencias` | Crear, confirmar y consultar; fondeo interno; respuesta reconstruida desde la fila | HU-4, HU-6 (código) |
| `limites` | Cálculo de lo consumido en el día y `GET /limites` | HU-6 (límite) |
| `movimientos` | Historial con cursor | HU-5 |
| `estado-cuenta` | CSV del mes | HU-B1 |
| `auditoria` | `registrarEvento(tx, evento)`, solo inserción | RNF-11 |

El grafo no tiene ciclos. El fondeo de bienvenida lo ejecuta `identidad` llamando a `transferencias.fondear(tx, …)` **dentro de su propia transacción** (R-1.2, R-1.3): las funciones de los casos de uso que se componen reciben la transacción abierta en vez de abrir otra.

**Rechazos de negocio como resultado, no como excepción.** `SALDO_INSUFICIENTE`, `LIMITE_DIARIO_EXCEDIDO`, `CODIGO_AGOTADO` y `CODIGO_EXPIRADO` no se lanzan como excepción: la transferencia se guarda `RECHAZADA` y la transacción **se confirma** (D-03). El caso de uso devuelve la fila. Una sola función pura, `respuestaDeTransferencia(fila)`, la traduce a `201`, `202` o `422`. La usa tanto la primera respuesta como la repetición con la misma llave, de modo que ambas son idénticas por construcción (R-4.14). Detalle en §6.2.

**Errores que sí son excepciones.** Las clases de `ErrorDominio` (`NoEncontrado`, `ValidacionFallida`, `LlaveReutilizada`, `Reintentable`, etc.) llevan su `type` del catálogo de §7. Solo el manejador central de errores las traduce a HTTP.

**Puertos**

```ts
// plataforma/reloj
interface Reloj {
  /** Instante actual como texto timestamptz en UTC, con microsegundos. Nunca Date. */
  ahora(tx: EntityManager): Promise<string>;
}
// RelojBaseDatos: SELECT now()   (inicio de la transacción, D-11/D-15)
// RelojFijo:      devuelve un valor fijado por la prueba (23:59:59.999999, 00:00:00)

// plataforma/otp
interface ProveedorOtp {
  enviar(usuarioId: string, codigo: string): Promise<{ codigoSimulado?: string }>;
}
// ProveedorOtpSimulado: solo se instancia con OTP_SIMULADO=true (D-07)
```

> **DD-07 · Aprobada · Las marcas de tiempo de negocio salen del Reloj y viajan como texto**
> **Contexto:** D-15 pide un reloj inyectable para probar la medianoche, y D-11 prohíbe pasar `creado_en` por `Date`, que solo tiene milisegundos. Si `aplicada_en` saliera del reloj y `creado_en` de `DEFAULT now()`, en las pruebas habría dos relojes distintos.
> **Decisión:**
> - Toda marca de negocio (`transferencia.creado_en`, `transferencia.aplicada_en`, `asiento.creado_en`, `codigo_confirmacion.expira_en`) se escribe con el valor de `Reloj.ahora(tx)`, leído una vez por transacción. Los `DEFAULT now()` quedan solo como red para tablas sin reglas de tiempo (sesión, auditoría).
> - La conexión fija `TimeZone=UTC`. Los parsers de `pg` devuelven `timestamptz` (OID 1184) como **texto**, nunca como `Date`; las columnas de las entidades se tipan como `string`.
> - El formato del texto en la API se define en §4.1.
> **Motivo:** un solo origen del tiempo por transacción. La prueba de medianoche controla `aplicada_en` y `creado_en` a la vez, y los microsegundos del cursor nunca se truncan.

> **DD-08 · Aprobada · Capas con regla de imports y composición manual**
> **Contexto:** el enunciado pide capas o módulos y la lógica financiera fuera de los handlers, pero no dice cómo hacerlo verificable.
> **Opciones:** contenedor de inyección de dependencias (`tsyringe`, `inversify`) o composición manual en `app.ts`.
> **Decisión:** composición manual. `crearApp(dependencias)` recibe `DataSource`, `Reloj`, `ProveedorOtp`, `Config` y `Logger`, y las pruebas pasan sus dobles. La separación de capas se verifica con `no-restricted-imports` en ESLint, que corre en CI.
> **Motivo:** son ocho módulos; un contenedor agrega decoradores y metadatos sin resolver nada que una función no resuelva. La regla de lint convierte "la lógica no vive en los handlers" en una verificación automática.

### 2.2 Ciclo de vida de una petición

Orden de los middlewares en `app.ts`:

| # | Middleware | Responsabilidad | Requisitos |
|---|---|---|---|
| 1 | `requestId` | Toma `X-Request-Id` entrante si es un UUID; si no, genera uno. Lo devuelve en el header de respuesta | RNF-12 |
| 2 | `pino-http` | Log JSON de entrada y salida con `reqId`, con `redact` (§10) | RNF-12 |
| 3 | `helmet` | Headers de seguridad | RNF-05 |
| 4 | `cors` | Solo `WEB_ORIGIN`, `credentials: true` | RNF-05 |
| 5 | `express.json({ limit: '16kb', strict: true })` | Cuerpos JSON acotados; un JSON mal formado responde `400` de validación (§7) | RNF-01 |
| 6 | `cookie-parser` | Lee la cookie de refresh | D-06 |
| 7 | `GET /api/health`, `/api/docs` | Sin autenticación | RNF-28 |
| 8 | `/api/auth/*` | Rate limit por ruta (§11) y `validar` | HU-1 |
| 9 | `autenticar` | Verifica el JWT y pone `req.usuarioId`; si falla, `401` | R-1.11 |
| 10 | Rutas de módulos | `validar({ params, query, body, headers })` → controlador | — |
| 11 | `demoLatencia` | Solo en `POST /transferencias` y `POST /transferencias/{id}/confirmar`, después del caso de uso y antes de responder; solo si `DEMO_LATENCIA_MS > 0` | D-17 |
| 12 | `noEncontrado` | Cualquier otra ruta → `404 not-found` | RNF-01 |
| 13 | `manejadorErrores` | Traduce a problem RFC 7807 (§7); registra la causa interna solo en el log | RNF-01 |

`validar` deja los datos ya transformados en `req.validado` y nunca deja pasar campos que el esquema no declara. Los esquemas de cuerpo usan `.strict()`.

> **DD-09 · Aprobada · El request ID viaja en el header, no en el cuerpo del problem**
> **Contexto:** es útil correlacionar un error con su línea de log, pero R-4.14 exige que la repetición con la misma llave devuelva **el mismo cuerpo** que la primera vez, incluidos los `422` de negocio.
> **Opciones:** (1) campo de extensión `requestId` en cada problem; (2) solo el header `X-Request-Id`.
> **Decisión:** el request ID va solo en el header `X-Request-Id` de todas las respuestas. Se acepta uno entrante con formato UUID para correlacionar con el cliente; si no tiene ese formato, se genera uno nuevo, para que el log no acepte texto arbitrario.
> **Motivo:** un `requestId` en el cuerpo haría distintos el primer `422` y su repetición, y rompería R-4.14.

### 2.3 Unidad de trabajo transaccional

Todo caso de uso que escribe corre dentro de `conTransaccion`, el único lugar de la API que abre transacciones:

```ts
conTransaccion<T>(
  trabajo: (tx: EntityManager) => Promise<T>,
  opciones?: { reintentosDeadlock?: number }, // por defecto 3 (D-12)
): Promise<T>
```

1. Toma un `QueryRunner` del pool (`DB_POOL_MAX`, por defecto 10; RNF-24).
2. `START TRANSACTION ISOLATION LEVEL READ COMMITTED` (D-12).
3. `SET LOCAL lock_timeout = '5s'` y `SET LOCAL statement_timeout = '10s'` (D-12).
4. Ejecuta `trabajo(tx)`. Los repositorios reciben `tx` y nunca usan el `DataSource` global.
5. `COMMIT`. Aquí se evalúa el *constraint trigger* diferido de suma cero (D-14). Si falla, el error llega en el `COMMIT` y se trata como error interno (`500`): indica un bug, nunca una entrada del usuario.
6. Ante cualquier error, `ROLLBACK` y clasificación por `SQLSTATE`:

| `SQLSTATE` | Significado | Acción |
|---|---|---|
| `40P01` | Deadlock | Reintenta toda la función `trabajo` hasta 3 veces, con espera aleatoria de 10 a 50 ms × intento, y log `warn` (D-12) |
| `55P03` | `lock_timeout` agotado | `Reintentable` → `503 retryable` (R-4.19) |
| `57014` | `statement_timeout` agotado | `Reintentable` → `503 retryable` (R-4.19) |
| `23505` | Violación de `UNIQUE` | Se propaga con el nombre de la restricción; el caso de uso decide (idempotencia en §6.2, duplicados en §7) |
| `23514`, `23503`, `P0001` | `CHECK`, FK o trigger | Se propaga. Si llega hasta el manejador sin traducirse, es un `500` y su detalle va solo al log |

`40P01` se reintenta porque la transacción completa no dejó efectos. `55P03` y `57014` no se reintentan en el servidor: el tiempo ya se gastó, y el cliente reintenta con la misma llave (D-12, D-16, D-17).

**Después de un `23505` la transacción está abortada.** Para leer la fila que ganó la carrera, el caso de uso abre **otra** `conTransaccion`. Así se resuelve R-4.16 (§6.2).

**Uso de TypeORM en los repositorios.** Los bloqueos usan `QueryBuilder` con `.setLock('pessimistic_write')` y `.orderBy('id', 'ASC')`, que TypeORM traduce a `SELECT … ORDER BY id FOR UPDATE`. Las consultas que TypeORM no expresa bien (comparación de tuplas del cursor, `AT TIME ZONE`, `SUM(...)::bigint`) usan `tx.query(sql, params)`, **siempre parametrizado**. Los nombres de columnas nunca se interpolan.

**Parsers de `pg`**, registrados una vez en `plataforma/db` (D-18, DD-07):

| OID | Tipo | Parser |
|---|---|---|
| 20 | `int8` | `Number` solo si `Number.isSafeInteger`; si no, lanza un error |
| 1700 | `numeric` | Igual que `int8`. `SUM(bigint)` devuelve `numeric`, pero las consultas lo convierten a `::bigint`; este parser es la red |
| 1184 | `timestamptz` | Texto sin transformar |

> **DD-10 · Aprobada · Timeouts de bloqueo y de sentencia responden 503 sin reintento en el servidor**
> **Contexto:** D-12 dice "si se agotan, `503 retryable`", pero no fija qué `SQLSTATE` corresponde a cada caso ni si el servidor reintenta.
> **Decisión:** `55P03` y `57014` se traducen a `503 retryable` con el header `Retry-After: 1`, sin reintento en el servidor. Solo `40P01` se reintenta en el servidor.
> **Motivo:** el servidor no debe pasar del presupuesto de 10 s que el cliente móvil supone (timeout de 15 s, D-17). Un deadlock se resuelve en milisegundos; un timeout ya consumió el presupuesto.

### 2.4 Configuración validada al arrancar

`config/index.ts` lee `process.env` con un esquema Zod. Si falla, `main.ts` registra **los nombres** de las variables inválidas (nunca sus valores) y termina con código 1 antes de abrir el puerto (RNF-15).

| Variable | Tipo y regla | Desarrollo | Fuente |
|---|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` | — |
| `PORT` | entero | `3000` | — |
| `DATABASE_URL` | URL, rol `billetera_app` | — | §3.4 |
| `DATABASE_URL_MIGRACIONES` | URL, rol `billetera_owner`; solo la leen `migrar.ts` y `seed.ts` | — | §3.4 |
| `DB_POOL_MAX` | entero 1–50 | `10` | RNF-24 |
| `JWT_SECRETO` | texto de 32 bytes o más | aleatorio | §5 |
| `OTP_HMAC_SECRETO` | texto de 32 bytes o más, distinto de `JWT_SECRETO` | aleatorio | D-07 |
| `LIMITE_DIARIO_CENTAVOS` | entero positivo seguro | `5000000` | D-13 |
| `UMBRAL_CODIGO_CENTAVOS` | entero positivo seguro, **menor** que el límite | `1000000` | D-13 |
| `FONDEO_BIENVENIDA_CENTAVOS` | entero ≥ 0 seguro | `1000000` | D-20 |
| `OTP_SIMULADO` | booleano | `true` | D-07 |
| `DEMO_LATENCIA_MS` | entero 0–30000 | `0` | D-17 |
| `WEB_ORIGIN` | URL | `http://localhost:5173` | RNF-05 |
| `LOG_LEVEL` | nivel de `pino` | `info` | RNF-12 |
| `TRUST_PROXY` | entero ≥ 0 (saltos de proxy confiables) | `0` | §11 |

Reglas cruzadas con `superRefine`:

- `UMBRAL_CODIGO_CENTAVOS < LIMITE_DIARIO_CENTAVOS` (RNF-15).
- Si `NODE_ENV=production`: `OTP_SIMULADO=false`, `DEMO_LATENCIA_MS=0` y `FONDEO_BIENVENIDA_CENTAVOS=0` (RNF-15, R-6.17).
- `OTP_HMAC_SECRETO ≠ JWT_SECRETO`.

Los booleanos se leen como `'true'` o `'false'` exactos. Zod no convierte `'0'` ni `'no'`, para que un valor mal escrito no active el OTP simulado por accidente.

---

## 3. Modelo de datos

### 3.1 Diagrama ER

Claves: `PK` llave primaria, `FK` llave foránea, `UK` participa en una restricción única. Los `CHECK`, triggers y permisos no caben en la sintaxis de Mermaid; van en §3.2 a §3.4.

```mermaid
erDiagram
    USUARIO |o--o{ CUENTA : posee
    USUARIO ||--o{ BENEFICIARIO : registra
    USUARIO ||--o{ SESION : abre
    USUARIO |o--o{ TRANSFERENCIA : inicia
    BENEFICIARIO }o--|| CUENTA : apunta_a
    CUENTA ||--o{ TRANSFERENCIA : es_origen
    CUENTA ||--o{ TRANSFERENCIA : es_destino
    BENEFICIARIO |o--o{ TRANSFERENCIA : elegido_en
    TRANSFERENCIA ||--o{ ASIENTO : genera_0_o_2
    CUENTA ||--o{ ASIENTO : acumula
    TRANSFERENCIA ||--o| CODIGO_CONFIRMACION : exige_si_supera_umbral

    USUARIO {
        uuid id PK
        text correo UK "minusculas"
        text hash_contrasena "argon2id"
        timestamptz creado_en
    }
    CUENTA {
        uuid id PK
        uuid usuario_id FK "NULL solo en SISTEMA"
        text tipo "USUARIO o SISTEMA"
        text nombre "Principal, Ahorro, Fondeo"
        text clabe UK "18 digitos con DV valido"
        bigint saldo_centavos "solo lo escribe el trigger"
        timestamptz creado_en
    }
    BENEFICIARIO {
        uuid id PK
        uuid usuario_id FK
        uuid cuenta_id FK
        text nombre
        text alias UK "unico por usuario sin mayusculas"
        text clabe UK "unica por usuario"
        timestamptz creado_en
    }
    TRANSFERENCIA {
        uuid id PK
        uuid usuario_id FK "NULL solo en FONDEO"
        text tipo "FONDEO TRASPASO TERCERO"
        uuid cuenta_origen_id FK
        uuid cuenta_destino_id FK
        uuid beneficiario_id FK "opcional"
        bigint monto_centavos "mayor que 0"
        text concepto
        text referencia "numerica"
        text estado "PENDIENTE_CONFIRMACION APLICADA RECHAZADA"
        text motivo_rechazo "solo si RECHAZADA"
        uuid llave_idempotencia UK "unica por usuario"
        text hash_peticion "SHA-256 hex"
        timestamptz creado_en
        timestamptz aplicada_en "solo si APLICADA"
    }
    ASIENTO {
        bigint id PK "identity, desempate del cursor"
        uuid transferencia_id FK
        uuid cuenta_id FK
        bigint monto_centavos "con signo, distinto de 0"
        text tipo_movimiento
        timestamptz creado_en "igual a aplicada_en"
    }
    CODIGO_CONFIRMACION {
        uuid transferencia_id PK
        text codigo_hmac "HMAC-SHA256 hex"
        timestamptz expira_en
        smallint intentos "0 a 3"
        timestamptz creado_en
    }
    SESION {
        uuid id PK
        uuid usuario_id FK
        uuid familia_id
        text refresh_hash UK "SHA-256 hex"
        timestamptz creado_en
        timestamptz expira_en
        timestamptz usada_en
        timestamptz revocada_en
    }
    EVENTO_AUDITORIA {
        bigint id PK "identity"
        timestamptz ocurrido_en
        text tipo
        uuid usuario_id "sin FK"
        text request_id
        jsonb datos "enmascarados"
    }
```

> **DD-11 · Aprobada · Convenciones de tipos y llaves**
> **Contexto:** hay que fijar los tipos de las llaves y de los catálogos.
> **Decisión:**
> - Las entidades que se exponen en la API (`usuario`, `cuenta`, `beneficiario`, `transferencia`, `sesion`) usan `uuid` generado con `gen_random_uuid()`. `asiento` y `evento_auditoria` usan `bigint GENERATED ALWAYS AS IDENTITY` (D-11).
> - Los catálogos (`tipo`, `estado`, `motivo_rechazo`, `tipo_movimiento`) son `text` con `CHECK (... IN (...))`, no `ENUM` de PostgreSQL.
> - Montos en `bigint`, marcas de tiempo en `timestamptz`, *hashes* en `text` hexadecimal con `CHECK` de formato.
> **Motivo:** un `uuid` no permite enumerar recursos ajenos, lo que complementa D-10. Un `bigint` secuencial es el desempate natural del cursor (D-11) y el `id` de la auditoría nunca sale de la API. Un `CHECK` se cambia en una migración con `DROP`/`ADD CONSTRAINT` dentro de una transacción; `ALTER TYPE ... ADD VALUE` no se puede usar en la misma transacción que lo introduce.

### 3.2 Tablas

Las columnas `NOT NULL` se asumen salvo que se indique lo contrario.

#### `usuario`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | `PK DEFAULT gen_random_uuid()` |
| `correo` | `text` | `UNIQUE`; `CHECK (correo = lower(correo) AND length(correo) BETWEEN 3 AND 254)` |
| `hash_contrasena` | `text` | `CHECK (hash_contrasena LIKE '$argon2id$%')` |
| `creado_en` | `timestamptz` | `DEFAULT now()` |

El esquema Zod normaliza el correo (`trim` y minúsculas) antes de llegar a la base; el `CHECK` garantiza que nadie se salte esa normalización y que `UNIQUE (correo)` no deje pasar `Ana@x.mx` y `ana@x.mx` (R-1.4).

#### `cuenta`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | `PK` |
| `usuario_id` | `uuid` | Admite `NULL`; `FK → usuario` |
| `tipo` | `text` | `CHECK (tipo IN ('USUARIO','SISTEMA'))` |
| `nombre` | `text` | `CHECK (nombre IN ('Principal','Ahorro','Fondeo'))` |
| `clabe` | `text` | `UNIQUE`; `CHECK (clabe_valida(clabe))` (§3.6) |
| `saldo_centavos` | `bigint` | `DEFAULT 0`; `CHECK (tipo = 'SISTEMA' OR saldo_centavos >= 0)` (D-01, D-02) |
| `creado_en` | `timestamptz` | `DEFAULT now()` |

Restricciones de tabla:

- `CHECK ((tipo = 'SISTEMA') = (usuario_id IS NULL))` (D-02).
- `CHECK ((tipo = 'SISTEMA') = (nombre = 'Fondeo'))`.
- `UNIQUE (usuario_id, nombre)`: cada usuario tiene una sola `Principal` y una sola `Ahorro` (D-20).
- Índice único parcial `ON cuenta ((true)) WHERE tipo = 'SISTEMA'`: existe a lo más una cuenta de sistema.

La fila de Fondeo se crea en la migración con `id = '00000000-0000-0000-0000-000000000001'` y la CLABE fija de §3.6.

#### `beneficiario`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | `PK` |
| `usuario_id` | `uuid` | `FK → usuario` |
| `cuenta_id` | `uuid` | `FK → cuenta` (D-19) |
| `nombre` | `text` | Longitud y caracteres de DD-16 |
| `alias` | `text` | Longitud y caracteres de DD-16 |
| `clabe` | `text` | `CHECK (clabe_valida(clabe))` |
| `creado_en` | `timestamptz` | `DEFAULT now()` |

- `UNIQUE (usuario_id, clabe)` y un índice único `(usuario_id, lower(alias))` (D-19, R-3.7).
- Trigger `validar_beneficiario` (§3.3): la cuenta es de tipo `USUARIO` y su CLABE coincide con `beneficiario.clabe` (R-3.5, D-02).

#### `transferencia`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | `PK` |
| `usuario_id` | `uuid` | Admite `NULL`; `FK → usuario` |
| `tipo` | `text` | `CHECK (tipo IN ('FONDEO','TRASPASO','TERCERO'))` |
| `cuenta_origen_id` | `uuid` | `FK → cuenta` |
| `cuenta_destino_id` | `uuid` | `FK → cuenta` |
| `beneficiario_id` | `uuid` | Admite `NULL`; `FK → beneficiario` |
| `monto_centavos` | `bigint` | `CHECK (monto_centavos > 0)` (D-13) |
| `concepto` | `text` | DD-16 |
| `referencia` | `text` | Admite `NULL`; `CHECK (referencia ~ '^[0-9]{1,7}$')` (DD-16) |
| `estado` | `text` | `CHECK (estado IN ('PENDIENTE_CONFIRMACION','APLICADA','RECHAZADA'))` |
| `motivo_rechazo` | `text` | Admite `NULL`; `CHECK (motivo_rechazo IN ('SALDO_INSUFICIENTE','LIMITE_DIARIO_EXCEDIDO','CODIGO_AGOTADO','CODIGO_EXPIRADO'))` |
| `llave_idempotencia` | `uuid` | Admite `NULL` |
| `hash_peticion` | `text` | Admite `NULL`; `CHECK (hash_peticion ~ '^[0-9a-f]{64}$')` |
| `creado_en` | `timestamptz` | Lo escribe el `Reloj` (DD-07) |
| `aplicada_en` | `timestamptz` | Admite `NULL`; lo escribe el `Reloj` |

Restricciones de tabla:

| Restricción | Garantiza | Fuente |
|---|---|---|
| `UNIQUE (usuario_id, llave_idempotencia)` | Una transferencia por llave y usuario | D-03, R-4.16, R-4.17 |
| `CHECK (cuenta_origen_id <> cuenta_destino_id)` | No hay transferencia a la misma cuenta | D-14, R-4.4 |
| `CHECK ((estado = 'RECHAZADA') = (motivo_rechazo IS NOT NULL))` | Motivo si y solo si está rechazada | D-14 |
| `CHECK ((estado = 'APLICADA') = (aplicada_en IS NOT NULL))` | Fecha de aplicación si y solo si está aplicada | D-15 |
| `CHECK (estado <> 'PENDIENTE_CONFIRMACION' OR tipo = 'TERCERO')` | Solo una transferencia a tercero espera código | D-13 |
| `CHECK ((tipo = 'FONDEO') = (usuario_id IS NULL))` | Fondeo no lo inicia un usuario | DD-12 |
| `CHECK ((tipo = 'FONDEO') = (llave_idempotencia IS NULL))` y lo mismo para `hash_peticion` y `referencia` | Toda transferencia de usuario trae llave, hash y referencia | DD-12, R-4.13 |
| `CHECK (tipo <> 'FONDEO' OR estado = 'APLICADA')` | Un fondeo nunca queda pendiente ni rechazado | D-02 |
| Trigger `validar_transferencia` | Clasificación y pertenencia (§3.3) | DD-17 |
| Índice parcial `(usuario_id, aplicada_en) WHERE estado = 'APLICADA' AND tipo = 'TERCERO'` | Suma del límite diario por rango | D-04, D-09 |

> **DD-12 · Aprobada · Columnas de la transferencia de fondeo**
> **Contexto:** D-02 define el fondeo como una transferencia normal, pero no la inicia ningún usuario, no viaja por HTTP y no tiene llave ni referencia capturada.
> **Opciones:** (1) usar como `usuario_id` al usuario que recibe y llenar llave y referencia con valores inventados; (2) dejarlas en `NULL` solo para `FONDEO`.
> **Decisión:** `usuario_id`, `llave_idempotencia`, `hash_peticion` y `referencia` son `NULL` si y solo si `tipo = 'FONDEO'`. El concepto de un fondeo es `"Depósito"` o `"Depósito de bienvenida"`. `beneficiario_id` es opcional en toda transferencia y solo se llena si el destino se eligió como beneficiario; sirve para el comprobante (§6.6).
> **Motivo:** un valor inventado sería un dato falso en un registro financiero. `UNIQUE (usuario_id, llave_idempotencia)` trata los `NULL` como distintos, así que los fondeos no chocan entre sí.

#### `asiento`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `bigint` | `PK GENERATED ALWAYS AS IDENTITY` |
| `transferencia_id` | `uuid` | `FK → transferencia` |
| `cuenta_id` | `uuid` | `FK → cuenta` |
| `monto_centavos` | `bigint` | `CHECK (monto_centavos <> 0)` |
| `tipo_movimiento` | `text` | `CHECK (tipo_movimiento IN ('DEPOSITO','ENVIO','RECEPCION','TRASPASO_SALIDA','TRASPASO_ENTRADA','FONDEO_SALIDA'))` |
| `creado_en` | `timestamptz` | Igual a `transferencia.aplicada_en` (verificado en §3.3) |

Restricciones:

- `CHECK ((tipo_movimiento IN ('DEPOSITO','RECEPCION','TRASPASO_ENTRADA')) = (monto_centavos > 0))` (D-09).
- `UNIQUE (transferencia_id, cuenta_id)`. Además de impedir dos asientos de una transferencia en la misma cuenta, su índice sirve a la verificación de suma cero.
- Índices del historial (D-11, §8.2): `(cuenta_id, creado_en DESC, id DESC)` y `(cuenta_id, tipo_movimiento, creado_en DESC, id DESC)`.

> **DD-13 · Aprobada · Tipo de movimiento `FONDEO_SALIDA`**
> **Contexto:** D-09 define cinco tipos de movimiento, y el único de un `FONDEO` es `DEPOSITO`, el abono. Al cargo en la cuenta Fondeo no le corresponde ninguno, y el `CHECK` de signo de D-09 lo exige. Es un hueco de D-09.
> **Opciones:** (1) reusar `ENVIO` para el cargo en Fondeo; (2) agregar un tipo propio.
> **Decisión:** agregar `FONDEO_SALIDA` (signo negativo), que solo aparece en la cuenta Fondeo. No se expone en la API: el filtro de R-5.6 sigue aceptando solo los cinco tipos de usuario, y Fondeo nunca es consultable (R-2.3).
> **Motivo:** reusar `ENVIO` mezclaría la emisión de dinero con los envíos a tercero en cualquier consulta contable.

#### `codigo_confirmacion`

| Columna | Tipo | Restricciones |
|---|---|---|
| `transferencia_id` | `uuid` | `PK`, `FK → transferencia` |
| `codigo_hmac` | `text` | `CHECK (codigo_hmac ~ '^[0-9a-f]{64}$')` |
| `expira_en` | `timestamptz` | Lo escribe el `Reloj` |
| `intentos` | `smallint` | `DEFAULT 0`; `CHECK (intentos BETWEEN 0 AND 3)` (D-07) |
| `creado_en` | `timestamptz` | `DEFAULT now()` |

> **DD-14 · Aprobada · El código usa `transferencia_id` como llave primaria y no tiene columna `usado`**
> **Contexto:** D-07 pide `UNIQUE (transferencia_id)`; el esqueleto tenía un `id` propio y una bandera `usado`.
> **Decisión:** `transferencia_id` es la `PK`, lo que da la misma unicidad sin otra columna. Que el código ya se usó se lee del estado de la transferencia (`APLICADA` o `RECHAZADA`).
> **Motivo:** una bandera `usado` sería un segundo dato que puede contradecir al estado.

#### `sesion`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | `PK` |
| `usuario_id` | `uuid` | `FK → usuario` |
| `familia_id` | `uuid` | Índice |
| `refresh_hash` | `text` | `UNIQUE`; `CHECK (refresh_hash ~ '^[0-9a-f]{64}$')` |
| `creado_en` | `timestamptz` | `DEFAULT now()` |
| `expira_en` | `timestamptz` | `CHECK (expira_en > creado_en)` |
| `usada_en` | `timestamptz` | Admite `NULL` |
| `revocada_en` | `timestamptz` | Admite `NULL` |

#### `evento_auditoria`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `bigint` | `PK GENERATED ALWAYS AS IDENTITY` |
| `ocurrido_en` | `timestamptz` | `DEFAULT clock_timestamp()` |
| `tipo` | `text` | Catálogo de §10 |
| `usuario_id` | `uuid` | Admite `NULL`; **sin FK** |
| `request_id` | `text` | Admite `NULL` |
| `datos` | `jsonb` | `DEFAULT '{}'`; enmascarados (§10) |

> **DD-15 · Aprobada · La auditoría no tiene llaves foráneas**
> **Contexto:** RNF-06 exige FK en el modelo financiero; la auditoría es un registro aparte.
> **Opciones:** FK de `usuario_id` a `usuario`, o ninguna.
> **Decisión:** sin FK. `ocurrido_en` usa `clock_timestamp()` (hora real del `INSERT`), no `now()`.
> **Motivo:** la auditoría debe sobrevivir a cualquier cambio futuro del modelo, como una baja de usuario, y no debe poder bloquear ni hacer fallar una operación por una referencia. `clock_timestamp()` ordena los eventos de una misma transacción, por ejemplo un intento fallido de código seguido de su rechazo.

> **DD-16 · Aprobada · Longitudes y caracteres de los campos de texto (cierra el pendiente §12.3)**
> **Contexto:** R-3.1 y R-4.9 piden validar nombre, alias, concepto y referencia, y `requirements.md` §12.3 deja abiertas sus longitudes.
> **Decisión:**
>
> | Campo | Regla |
> |---|---|
> | `beneficiario.nombre` | 1 a 100 caracteres |
> | `beneficiario.alias` | 1 a 40 caracteres |
> | `transferencia.concepto` | 1 a 40 caracteres |
> | `transferencia.referencia` | 1 a 7 dígitos, guardada como texto para conservar ceros a la izquierda |
> | `usuario.correo` | 3 a 254 caracteres, en minúsculas |
>
> Todos los campos de texto: sin espacios al inicio ni al final (`campo = btrim(campo)`) y sin caracteres de control (`campo !~ '[[:cntrl:]]'`). Zod aplica las mismas reglas en `packages/shared` (`trim` antes de validar) y la base las repite como `CHECK`.
> **Motivo:** concepto de 40 caracteres y referencia numérica de 7 dígitos son los formatos de SPEI, lo que deja el modelo listo para una futura salida a SPEI. Prohibir caracteres de control cierra la inyección de saltos de línea en logs y en el CSV (R-B1.3).

### 3.3 Triggers y funciones

| Trigger | Tabla y momento | Hace | Fuente |
|---|---|---|---|
| `asiento_aplica_saldo` | `asiento`, `AFTER INSERT`, por fila | Suma `NEW.monto_centavos` al saldo de la cuenta. `SECURITY DEFINER` (§3.4) | D-01 |
| `asiento_inmutable` | `asiento`, `BEFORE UPDATE OR DELETE` | Lanza un error | D-01, RNF-06 |
| `cuenta_protegida` | `cuenta`, `BEFORE UPDATE OR DELETE` | Prohíbe borrar y cambiar `id`, `usuario_id`, `tipo`, `nombre`, `clabe` y `creado_en`; el saldo solo cambia desde otro trigger | D-01, D-02, DD-18 |
| `validar_beneficiario` | `beneficiario`, `BEFORE INSERT` | Cuenta de tipo `USUARIO` y CLABE igual a la de la cuenta | D-19, D-02 |
| `validar_transferencia` | `transferencia`, `BEFORE INSERT` | Clasificación y pertenencia (abajo) | DD-17 |
| `transferencia_transicion` | `transferencia`, `BEFORE UPDATE OR DELETE` | Solo `PENDIENTE_CONFIRMACION → APLICADA | RECHAZADA`; columnas de identidad inmutables; no se borra | D-14 |
| `transferencia_cuadra` | `transferencia`, `AFTER INSERT OR UPDATE`, `CONSTRAINT … DEFERRABLE INITIALLY DEFERRED` | `comprobar_transferencia(NEW.id)` al confirmar | D-14 |
| `asiento_cuadra` | `asiento`, `AFTER INSERT`, `CONSTRAINT … DEFERRABLE INITIALLY DEFERRED` | `comprobar_transferencia(NEW.transferencia_id)` al confirmar | D-14 |
| `codigo_protegido` | `codigo_confirmacion`, `BEFORE UPDATE OR DELETE` | Solo permite `intentos = OLD.intentos + 1`; lo demás es inmutable | D-07 |
| `auditoria_inmutable` | `evento_auditoria`, `BEFORE UPDATE OR DELETE` | Lanza un error | RNF-11 |

Los triggers de inmutabilidad protegen incluso del rol dueño. Los permisos de §3.4 son la primera barrera y los triggers la segunda. `TRUNCATE` no dispara triggers de fila; solo lo tiene el rol dueño, y solo lo usan las pruebas para limpiar `billetera_test`.

**Saldo por asiento**

```sql
CREATE FUNCTION aplicar_asiento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE cuenta
     SET saldo_centavos = saldo_centavos + NEW.monto_centavos
   WHERE id = NEW.cuenta_id;   -- fila ya bloqueada por el caso de uso (D-01)
  RETURN NULL;                 -- si el saldo queda negativo, el CHECK lanza 23514
END $$;
```

**Protección de la cuenta.** El saldo solo puede cambiar cuando la actualización viene de otro trigger:

```sql
IF NEW.saldo_centavos <> OLD.saldo_centavos AND pg_trigger_depth() < 2 THEN
  RAISE EXCEPTION 'cuenta: el saldo solo cambia por asientos';
END IF;
```

Un `UPDATE cuenta SET saldo_centavos = …` directo corre con profundidad 1 y falla, incluso con el rol dueño. El que lanza `aplicar_asiento` corre con profundidad 2 y pasa. Así se cumple RNF-07 ("ningún camino escribe saldos directamente") en la base, no solo en el código.

**Clasificación y pertenencia (`validar_transferencia`)**

| `tipo` | Origen | Destino | Además |
|---|---|---|---|
| `FONDEO` | Cuenta `SISTEMA` | Cuenta `USUARIO` | — |
| `TRASPASO` | Cuenta del `usuario_id` | Cuenta del mismo `usuario_id` | — |
| `TERCERO` | Cuenta del `usuario_id` | Cuenta `USUARIO` de **otro** usuario | — |
| Cualquiera con `beneficiario_id` | — | `= beneficiario.cuenta_id` | `beneficiario.usuario_id = usuario_id` |

Las cuentas nunca cambian de dueño (`cuenta_protegida`), así que la clasificación hecha al crear la transferencia es la misma que al aplicarla, que es lo que pide D-04.

> **DD-17 · Aprobada · La base valida la clasificación y la coherencia completa de cada transferencia**
> **Contexto:** D-04 clasifica en código según el dueño real del destino, y D-14 pide en la base solo la suma cero. Un error de clasificación en el código haría que un envío a tercero se registrara como `TRASPASO` y escapara del límite diario, el mismo hueco que D-04 quería cerrar.
> **Decisión:**
> - `validar_transferencia` comprueba la tabla anterior al insertar.
> - `comprobar_transferencia(id)`, el trigger diferido, verifica más que la suma cero. Si está `APLICADA`, debe haber exactamente 2 asientos que suman 0: uno en la cuenta origen por `-monto` y otro en la cuenta destino por `+monto`; los tipos de movimiento deben corresponder al tipo de transferencia (`FONDEO` → `FONDEO_SALIDA`/`DEPOSITO`, `TERCERO` → `ENVIO`/`RECEPCION`, `TRASPASO` → `TRASPASO_SALIDA`/`TRASPASO_ENTRADA`), y el `creado_en` de ambos asientos debe ser igual a `aplicada_en`. En cualquier otro estado, debe haber 0 asientos.
> **Motivo:** "suman cero" por sí solo aceptaría dos asientos invertidos o en cuentas equivocadas. Con esta verificación, la base rechaza cualquier transferencia que no cuadre con su propia fila, y el `creado_en` compartido garantiza el desempate de D-11.
> **Pruebas de integración** (`api/test/integracion/integridad.test.ts`). Insertan con SQL directo como `billetera_app`, sin pasar por los casos de uso, y esperan el rechazo de la base. Después verifican que no quedó ninguna fila ni cambió ningún saldo:
>
> | Intento | Lo rechaza |
> |---|---|
> | `TRASPASO` hacia la cuenta de otro usuario | `validar_transferencia` |
> | `TERCERO` hacia una cuenta propia (clasificación que evade el límite al revés) | `validar_transferencia` |
> | Transferencia de usuario desde una cuenta ajena | `validar_transferencia` |
> | `FONDEO` hacia la cuenta Fondeo, o un origen de usuario con `tipo = 'FONDEO'` | `validar_transferencia` |
> | `beneficiario_id` de otro usuario, o que no apunta a la cuenta destino | `validar_transferencia` |
> | `APLICADA` sin asientos | `transferencia_cuadra`, al hacer `COMMIT` |
> | `APLICADA` con un solo asiento, o con dos que no suman cero | `asiento_cuadra`, al hacer `COMMIT` |
> | Dos asientos que suman cero pero invertidos (abono en origen, cargo en destino) | `asiento_cuadra` |
> | Asientos con tipo de movimiento equivocado (`ENVIO` en un `TRASPASO`) | `asiento_cuadra` |
> | Asientos con `creado_en` distinto de `aplicada_en` | `asiento_cuadra` |
> | Asientos en una transferencia `RECHAZADA` o `PENDIENTE_CONFIRMACION` | `asiento_cuadra` |

**Verificación diferida (resumen)**

```sql
CREATE FUNCTION comprobar_transferencia(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t transferencia%ROWTYPE; n int; suma bigint;
BEGIN
  SELECT * INTO t FROM transferencia WHERE id = p_id;
  SELECT count(*), coalesce(sum(monto_centavos), 0)::bigint INTO n, suma
    FROM asiento WHERE transferencia_id = p_id;

  IF t.estado <> 'APLICADA' THEN
    IF n <> 0 THEN RAISE EXCEPTION 'transferencia % no aplicada con asientos', p_id; END IF;
    RETURN;
  END IF;
  IF n <> 2 OR suma <> 0 THEN
    RAISE EXCEPTION 'transferencia % no cuadra (% asientos, suma %)', p_id, n, suma;
  END IF;
  -- cargo en origen por -monto y abono en destino por +monto,
  -- con el tipo de movimiento que corresponde a t.tipo y creado_en = t.aplicada_en
  PERFORM 1 FROM asiento a
   WHERE a.transferencia_id = p_id AND a.cuenta_id = t.cuenta_origen_id
     AND a.monto_centavos = -t.monto_centavos AND a.creado_en = t.aplicada_en
     AND a.tipo_movimiento = CASE t.tipo WHEN 'FONDEO'   THEN 'FONDEO_SALIDA'
                                         WHEN 'TERCERO'  THEN 'ENVIO'
                                         ELSE 'TRASPASO_SALIDA' END;
  IF NOT FOUND THEN RAISE EXCEPTION 'transferencia % sin cargo correcto', p_id; END IF;
  -- … simétrico para el abono en destino
END $$;
```

Cada tabla tiene su propia función de trigger, que llama a `comprobar_transferencia` con el `id` que le corresponde. Una sola función de trigger no puede leer `NEW.transferencia_id` en una tabla y `NEW.id` en la otra.

**Máquina de estados (`transferencia_transicion`)**

- `OLD.estado` debe ser `PENDIENTE_CONFIRMACION` y `NEW.estado` debe estar en `('APLICADA','RECHAZADA')`.
- `(id, usuario_id, tipo, cuenta_origen_id, cuenta_destino_id, beneficiario_id, monto_centavos, concepto, referencia, llave_idempotencia, hash_peticion, creado_en)` no puede cambiar (`IS DISTINCT FROM` sobre las dos filas).
- `DELETE` siempre falla.

**Invariantes de RNF-06 y quién las garantiza en la base**

| RNF-06 | Mecanismo |
|---|---|
| Saldo negativo en cuenta de usuario | `CHECK (tipo = 'SISTEMA' OR saldo_centavos >= 0)` |
| Llave repetida para el mismo usuario | `UNIQUE (usuario_id, llave_idempotencia)` |
| Aplicada sin exactamente dos asientos que suman cero, o no aplicada con asientos | `transferencia_cuadra` y `asiento_cuadra` (diferidos) |
| Transición distinta de `PENDIENTE_CONFIRMACION → APLICADA | RECHAZADA` | `transferencia_transicion` |
| Cambios en monto, origen, destino, tipo, llave o hash | `transferencia_transicion` |
| `UPDATE` o `DELETE` de asientos | Permisos (§3.4) y `asiento_inmutable` |
| Origen igual a destino | `CHECK (cuenta_origen_id <> cuenta_destino_id)` |
| Monto ≤ 0 | `CHECK (monto_centavos > 0)` en `transferencia`, `CHECK (<> 0)` en `asiento` |
| Signo contrario al tipo de movimiento | `CHECK` de signo en `asiento` |
| Referencias rotas | FK en `cuenta`, `beneficiario`, `transferencia`, `asiento`, `codigo_confirmacion` y `sesion` |
| Saldo escrito directamente (RNF-07) | Permisos por columna (§3.4) y `cuenta_protegida` |

Cada fila de esta tabla tiene una prueba de integración que intenta violarla con SQL directo y espera el error (§14).

### 3.4 Roles y permisos

| Rol | Uso | Puede |
|---|---|---|
| `billetera_owner` | Migraciones, seed y limpieza de pruebas | Es dueño del esquema y de todos los objetos |
| `billetera_app` | La API en tiempo de ejecución | Solo lo de la tabla siguiente |

`docker/postgres/init.sql` crea los dos roles con `LOGIN` y las bases `billetera` y `billetera_test`, con dueño `billetera_owner`. Las migraciones conceden los permisos tabla por tabla. `billetera_app` no tiene `CREATE` sobre el esquema, ni `DELETE` ni `TRUNCATE` sobre ninguna tabla.

| Tabla | `SELECT` | `INSERT` | `UPDATE` | Motivo del `UPDATE` |
|---|---|---|---|---|
| `usuario` | ✓ | ✓ | `(id)` | Solo para poder bloquear (abajo) |
| `cuenta` | ✓ | `(id, usuario_id, tipo, nombre, clabe)` | `(id)` | Solo para poder bloquear; **sin `saldo_centavos`** |
| `beneficiario` | ✓ | ✓ | — | |
| `transferencia` | ✓ | ✓ | `(estado, motivo_rechazo, aplicada_en)` | Transición de una pendiente |
| `asiento` | ✓ | ✓ | — | |
| `codigo_confirmacion` | ✓ | ✓ | `(intentos)` | Intento fallido |
| `sesion` | ✓ | ✓ | `(usada_en, revocada_en)` | Rotación y revocación |
| `evento_auditoria` | — | ✓ | — | Solo inserción (RNF-11) |

**Bloquear sin poder modificar.** PostgreSQL exige `UPDATE` sobre al menos una columna para `SELECT … FOR UPDATE`. A `usuario` y `cuenta` se les concede `UPDATE (id)`, que los triggers de protección hacen inútil para modificar: cambiar el `id` falla en `cuenta_protegida` y en las FK. En `cuenta` falta a propósito `saldo_centavos`, tanto en `INSERT` como en `UPDATE`: la API no puede crear una cuenta con saldo ni cambiarlo.

**`SECURITY DEFINER`.** `aplicar_asiento` es hoy la única función `SECURITY DEFINER` y la única que actualiza `cuenta.saldo_centavos`. Corre con los permisos de `billetera_owner`. Es una función de trigger, así que no se puede invocar directamente.

**Regla para toda función `SECURITY DEFINER`, presente o futura:** fija `SET search_path = pg_catalog, public, pg_temp` en su definición, para que nadie pueda suplantar una tabla, función u operador creando un objeto con el mismo nombre en otro esquema.

- `pg_catalog` va primero, para que las funciones y operadores del sistema no se puedan sombrear.
- `pg_temp` va **explícitamente al final**. Si no se lista, PostgreSQL busca las tablas en el esquema temporal de la sesión **antes** que en los demás, y una tabla temporal `cuenta` creada por quien invoca suplantaría a la real. Es la recomendación de la documentación de PostgreSQL para `SECURITY DEFINER`.
- `REVOKE EXECUTE … FROM PUBLIC` en cada una.
- Una prueba de integración recorre `pg_proc` y falla si alguna función con `prosecdef = true` no tiene ese `search_path` en `proconfig`.

> **DD-18 · Aprobada · El rol de la API no puede escribir saldos ni borrar nada**
> **Contexto:** D-01 dice que "la aplicación nunca escribe el saldo", y el enunciado pide permisos que impidan `UPDATE`/`DELETE` en la auditoría. Extender esa idea a los saldos la convierte de convención en garantía.
> **Opciones:** (1) `GRANT` amplios y confiar en el código; (2) permisos por columna, función `SECURITY DEFINER` para el saldo y triggers de protección.
> **Decisión:** la opción 2, con la tabla anterior. `pg_trigger_depth()` distingue al trigger de saldo de un `UPDATE` directo. Toda función `SECURITY DEFINER` fija `SET search_path = pg_catalog, public, pg_temp` (regla anterior).
> **Pruebas de integración** (`api/test/integracion/permisos.test.ts`). Cada una espera el error indicado y verifica después que los saldos y las filas no cambiaron:
>
> | Conexión | Intento | Error esperado |
> |---|---|---|
> | `billetera_app` | `UPDATE cuenta SET saldo_centavos = …` | `42501` (sin permiso) |
> | `billetera_app` | `INSERT INTO cuenta (…, saldo_centavos)` con saldo distinto de 0 | `42501` |
> | `billetera_owner` | `UPDATE cuenta SET saldo_centavos = …` directo | `P0001` de `cuenta_protegida` |
> | `billetera_app` | `UPDATE asiento …` y `DELETE FROM asiento …` | `42501` |
> | `billetera_owner` | `UPDATE asiento …` y `DELETE FROM asiento …` | `P0001` de `asiento_inmutable` |
> | `billetera_app` | `UPDATE evento_auditoria …` y `DELETE FROM evento_auditoria …` | `42501` |
> | `billetera_owner` | `UPDATE`/`DELETE` de `evento_auditoria` | `P0001` de `auditoria_inmutable` |
> | `billetera_app` | `DELETE` de cada tabla y `TRUNCATE` de cualquiera | `42501` |
> | `billetera_owner` | Función `SECURITY DEFINER` sin el `search_path` de la regla | Falla la revisión de `pg_proc` |
> **Motivo:** una inyección SQL o un bug en el código no puede crear dinero: el único camino que mueve saldos es insertar asientos, y esos asientos tienen que cuadrar con su transferencia (DD-17).
> **Costo:** las entidades de TypeORM no pueden usar `save()` para actualizar, porque `save()` escribe todas las columnas. Las actualizaciones se hacen con `update()` o `QueryBuilder` nombrando columnas (§3.5).

### 3.5 Lo que TypeORM no cubre y cómo se resolvió

**Migraciones (DD-05).** Cada migración es una clase TypeORM que implementa `MigrationInterface`, con `up` y `down` escritos a mano con `queryRunner.query(sql)`. El `DataSource` recibe las clases como una **lista explícita** importada desde `migraciones/index.ts`, no como un *glob*, y usa `migrationsTableName: 'migracion'` y `migrationsTransactionMode: 'each'`.

| # | Migración | Contenido |
|---|---|---|
| 1 | `Base` | `clabe_valida()`, `usuario`, `cuenta` con sus triggers, fila de Fondeo |
| 2 | `Beneficiario` | Tabla, índices y `validar_beneficiario` |
| 3 | `TransferenciaAsiento` | `transferencia`, `asiento`, `codigo_confirmacion`, funciones y triggers de §3.3, índices del historial y del límite |
| 4 | `Sesion` | `sesion` |
| 5 | `Auditoria` | `evento_auditoria` y su trigger |
| 6 | `Permisos` | Todos los `GRANT` de §3.4 y `REVOKE ALL … FROM PUBLIC` |

Los permisos van al final, en una sola migración, para que se puedan revisar juntos. Cada migración posterior que cree una tabla agrega sus propios `GRANT`.

**Por qué no se usa el CLI de TypeORM.** El CLI (`typeorm migration:run -d data-source.ts`) tiene que cargar un `DataSource` escrito en TypeScript. En un proyecto ESM, eso exige la variante `typeorm-ts-node-esm`, que depende del cargador ESM de `ts-node`; ese cargador tiene incompatibilidades conocidas con los *loader hooks* de las versiones recientes de Node. Además, los dos comandos que aportan algo, `migration:generate` y `schema:sync`, no sirven aquí: no generan triggers, funciones ni permisos, y `synchronize` está prohibido. El script `migrar.ts` corre con `tsx` (el mismo ejecutor que `npm run dev`) y llama a `dataSource.runMigrations()`, que es la misma API que usa el CLI por dentro. `npm run db:migrate:revertir` llama a `dataSource.undoLastMigration()`.

**Qué cubre TypeORM y qué no**

| Necesidad | ¿TypeORM? | Cómo se resolvió |
|---|---|---|
| Mapeo de tablas a entidades, relaciones, consultas simples | Sí | Entidades con decoradores |
| `synchronize: false` | Sí | Fijo en el `DataSource`; una prueba lo verifica |
| Migraciones versionadas | Sí | Clases `MigrationInterface` escritas a mano |
| `CHECK` con subconsultas o funciones (`clabe_valida`) | Parcial: `@Check` existe, pero la migración no se genera | SQL en la migración; `@Check` no se usa para no duplicar la fuente de verdad |
| Triggers, funciones `plpgsql`, `CONSTRAINT TRIGGER … DEFERRABLE` | No | SQL en las migraciones 1, 2, 3 y 5 |
| `SECURITY DEFINER`, `GRANT`/`REVOKE` por columna | No | SQL en las migraciones 1 y 6 |
| Índice sobre expresión `lower(alias)` | No | SQL; en la entidad se declara `@Index({ synchronize: false })` solo como documentación |
| Índice parcial | Sí (`@Index({ where })`) | Igual se escribe en SQL, para tener una sola fuente de verdad |
| `SELECT … ORDER BY id FOR UPDATE` | Sí | `QueryBuilder.setLock('pessimistic_write').orderBy('id')` |
| `SET LOCAL lock_timeout` / `statement_timeout` | No | `tx.query` al abrir la unidad de trabajo (§2.3) |
| Comparación de tuplas `(creado_en, id) < ($1, $2)` y `AT TIME ZONE` | No de forma idiomática | `tx.query` parametrizado (§8) |
| `int8` sin perder precisión | No (lo devuelve como `string`) | Parser global de `pg` (§2.3) |
| `timestamptz` con microsegundos | No (lo convierte a `Date`) | Parser global de `pg` a texto (DD-07) |
| `saldo_centavos` de solo lectura | Sí | `@Column({ insert: false, update: false })` |
| Actualizar solo ciertas columnas (permisos de §3.4) | Sí | `update()` o `QueryBuilder.update().set({...})`, nunca `save()` sobre entidades existentes |
| Traducir `SQLSTATE` a errores de dominio | No | `conTransaccion` (§2.3) y los casos de uso (§7) |

### 3.6 CLABE de la plataforma

Estructura de 18 dígitos: **banco (3) + plaza (3) + cuenta (11) + dígito verificador (1)**.

| Parte | Valor | Motivo |
|---|---|---|
| Banco | `999`, ficticio y fijo (D-19) | No coincide con ningún banco real del catálogo de Banxico |
| Plaza | `180` para cuentas de usuario; `000` para Fondeo | Separa a simple vista la cuenta de sistema |
| Cuenta | 11 dígitos de `crypto.randomInt` | DD-19 |
| Dígito verificador | `digitoVerificador()` de `packages/shared` | D-19, R-3.12 |

CLABE de Fondeo: `999000000000000001`. Los primeros 17 dígitos `99900000000000000`, con pesos 3, 7, 1, dan `7 + 3 + 9 = 19`, y el dígito es `(10 − 9) % 10 = 1`. Este valor entra como caso de prueba de `validarClabe`.

**En la base.** `clabe_valida(text) RETURNS boolean IMMUTABLE` implementa el mismo algoritmo en SQL y lo usan los `CHECK` de `cuenta` y `beneficiario`. Una prueba compara `clabe_valida` con `validarClabe` de `shared` sobre 10,000 CLABEs aleatorias y los casos borde (dígito 0, suma múltiplo de 10).

> **DD-19 · Aprobada · Generación de CLABE aleatoria y validación también en la base**
> **Contexto:** D-19 fija banco ficticio, plaza, cuenta y dígito verificador, pero no cómo se elige el número de cuenta.
> **Opciones:** (1) consecutivo desde una secuencia; (2) aleatorio con reintento.
> **Decisión:** los 11 dígitos son aleatorios. La cuenta se inserta con `INSERT … ON CONFLICT (clabe) DO NOTHING RETURNING id`; si no devuelve fila, se genera otra CLABE, hasta 5 veces. La base valida el dígito verificador con `CHECK (clabe_valida(clabe))`.
> **Motivo:** un consecutivo revela cuántas cuentas hay y hace adivinables las CLABEs vecinas, que es justo el oráculo que el rate limit de D-19 intenta frenar. `ON CONFLICT DO NOTHING` evita un `23505`, que abortaría la transacción del registro. Con 10¹¹ combinaciones, una colisión es improbable; el reintento cubre el caso sin costo.

### 3.7 Seed

`npm run db:seed` corre `api/src/scripts/seed.ts`. **Primero vacía** las tablas de datos con `TRUNCATE … CASCADE` como `billetera_owner`, conservando Fondeo, y después genera los datos con una semilla fija: dos corridas dan el mismo resultado.

**Fase 1: usuarios demo, por los casos de uso reales.** Se crean llamando a `registrar`, `fondear` y `crearBeneficiario` de la API con el `DataSource` de `billetera_app`: el mismo camino, los mismos triggers y la misma auditoría que en producción.

| Usuario | Saldo inicial (`Principal`) | Para demostrar en el video |
|---|---|---|
| `ana@demo.mx` | `8000000` ($80,000.00) | Transferencia normal (≤ $10,000), con código (> $10,000) y, después de esas dos, límite diario excedido. Necesita saldo mayor que el límite (D-13) |
| `beto@demo.mx` | `50000` ($500.00) | Saldo insuficiente |

- Cada uno tiene registrado al otro como beneficiario, para que la app móvil pueda transferir desde el primer momento (R-4.26).
- La contraseña demo cumple la política de §5 y va en el README.
- Los saldos llegan por transferencias `FONDEO` (D-13, D-20, RNF-27). `FONDEO_BIENVENIDA_CENTAVOS` se suma por el mismo camino.

**Fase 2: volumen, por SQL masivo.** Para el `EXPLAIN ANALYZE` (RNF-14):

- 200 usuarios sintéticos, con sus dos cuentas, y un usuario `carga@demo.mx`.
- Un fondeo inicial por cuenta, seguido de unas 60,000 transferencias `TERCERO` y `TRASPASO` entre esas cuentas, con montos pequeños frente a los fondeos para que ningún saldo quede negativo. Resultado: **120,000 asientos o más** en total.
- **Cuenta caliente:** la cuenta `Principal` de `carga@demo.mx` participa en **al menos 30,000** de esas transferencias, es decir, decenas de miles de movimientos en una sola cuenta, con los cinco tipos de movimiento. Es la cuenta que mide el `EXPLAIN ANALYZE` de §8.5. Sin ella, 120,000 asientos repartidos en 400 cuentas darían unos 300 por cuenta, y cualquier plan parecería rápido.
- Fechas repartidas en los últimos 180 días, con microsegundos aleatorios. Los dos asientos de cada transferencia comparten el instante (DD-17).
- Se inserta con `INSERT … SELECT … FROM generate_series(...)` en una sola transacción, **con todos los triggers activos**: los saldos los calcula `aplicar_asiento` y la suma cero se verifica al confirmar.
- Al final corre `ANALYZE` y verifica: las invariantes de RNF-07 (`saldo = SUM(asientos)` por cuenta y `SUM(saldo) = 0`), que hay 100,000 asientos o más en total y que la cuenta caliente tiene 30,000 o más. Si algo falla, el seed termina con error.

> **DD-20 · Aprobada · Seed en dos fases y datos de volumen fuera del límite diario**
> **Contexto:** RNF-27 pide usuarios demo y 100,000 movimientos o más. Generar el volumen por los casos de uso tomaría minutos (una transacción por transferencia). Además, la cuenta de carga recibe y envía decenas de transferencias por día.
> **Opciones:** (1) todo por los casos de uso; (2) todo por SQL; (3) demo por casos de uso y volumen por SQL.
> **Decisión:** la opción 3. El volumen se inserta con el rol dueño y respeta **todas las invariantes de la base** (saldo no negativo, suma cero, clasificación, tipos y fechas), pero **no** el límite diario, que es una regla de la aplicación (D-04) y no de la base. Los usuarios sintéticos solo existen para medir; ningún usuario demo recibe volumen. Al menos una cuenta, la caliente, acumula 30,000 movimientos o más, para que el `EXPLAIN ANALYZE` del historial de una cuenta sea representativo. El seed vacía y regenera en cada corrida, con semilla fija.
> **Motivo:** los usuarios del video pasan por el mismo camino que producción, y el volumen se genera en segundos sin saltarse ninguna garantía de la base. Que el volumen no respete el límite se declara aquí y en el README, en lugar de ocultarlo.

---

## 4. Contrato de la API

El contrato completo está en [`specs/openapi.yaml`](./openapi.yaml) (OpenAPI 3.1, JSON Schema 2020-12). **Es la fuente de verdad del contrato**: un cambio en la API empieza en ese archivo, y los tipos de los clientes se generan desde él (§4.3). Esta sección resume y justifica sus decisiones.

### 4.1 Convenciones

| Aspecto | Convención |
|---|---|
| Prefijo | Todo bajo `/api`, sin versión en la ruta; la versión del contrato vive en `info.version` |
| Nombres en JSON | camelCase: `montoCentavos`, `siguienteCursor`, `transferenciaId` |
| Montos | Enteros JSON en centavos, con sufijo `Centavos`. Nunca decimales ni texto (D-18) |
| Identificadores | `uuid` en texto. El `id` de un movimiento es texto opaco |
| Instantes | ISO 8601 en UTC con 6 decimales: `2026-11-14T16:05:09.123456Z` (DD-22) |
| Días de calendario | `AAAA-MM-DD`, en `America/Mexico_City` (D-15) |
| Listas | Siempre envueltas en un objeto: `{ items }` o `{ items, siguienteCursor }` |
| Errores | `application/problem+json`, RFC 7807, con el catálogo de §7 (DD-23) |
| Cuerpos de entrada | `additionalProperties: false`; un campo desconocido es un error de validación |
| Request ID | Header `X-Request-Id` en todas las respuestas (DD-09) |

> **DD-21 · Aprobada · JSON en camelCase, sin versión en la ruta y listas envueltas**
> **Contexto:** `requirements.md` y D-18 nombran el monto `monto_centavos` (snake_case), pero D-11 y D-14 ya usan `siguienteCursor`, `transferenciaId` y `codigoSimulado` (camelCase). Hay que fijar una sola convención.
> **Decisión:**
> - Todo el JSON va en camelCase. El campo del monto es `montoCentavos`; `monto_centavos` queda como nombre de la columna. R-4.8, R-4.35 y D-18 se leen con ese nombre: el requisito es el mismo (entero JSON en centavos con tope).
> - Sin `/v1` en la ruta: hay un solo consumidor por cliente y se despliegan juntos.
> - Toda lista va dentro de un objeto, para poder agregar metadatos sin romper a los clientes.
> **Motivo:** camelCase es lo natural en TypeScript de los tres clientes, y evita mapear nombres entre la API y los tipos generados.

> **DD-22 · Aprobada · Formato de los instantes en la API**
> **Contexto:** DD-07 lee `timestamptz` como texto para no perder microsegundos, pero el texto de PostgreSQL (`2026-11-14 16:05:09.123456+00`) no es ISO 8601, y omite la fracción cuando vale cero.
> **Decisión:** una función pura de `shared`, `instanteIso(textoPg)`, lo convierte **operando sobre el texto**: cambia el espacio por `T`, completa la fracción a 6 dígitos y cambia `+00` por `Z`. Nunca pasa por `Date`. La conexión en `TimeZone=UTC` (DD-07) garantiza el sufijo `+00`; si llega otro, la función lanza un error.
> **Motivo:** un solo formato, con precisión de microsegundos, igual al que usa el cursor (D-11).

> **DD-23 · Aprobada · Formato del `type` de los problemas y códigos de los duplicados**
> **Contexto:** RNF-01 fija `type` estables en inglés (`not-found`, `idempotency-key-reused`, `invalid-cursor`, `clabe-not-found`, `retryable`) y R-4.3 dice que, en un rechazo, "`type` es el motivo" (`SALDO_INSUFICIENTE`). RFC 7807 pide que `type` sea una referencia URI. Además, `requirements.md` §12.2 deja abiertos los códigos del correo y del beneficiario duplicados.
> **Decisión:**
> - `type` es una referencia URI relativa en kebab-case. Los de RNF-01 se conservan tal cual; los demás se escriben en español con el vocabulario del glosario.
> - En un rechazo, `type` es el motivo en kebab-case (`saldo-insuficiente`), y la extensión `motivo` lleva el valor del catálogo (`SALDO_INSUFICIENTE`), junto con `transferenciaId`.
> - Correo ya registrado y beneficiario duplicado responden **`409`** (`correo-ya-registrado`, `beneficiario-duplicado`). Esto cierra el pendiente §12.2.
> - Extensiones permitidas: `errores` (validación), `motivo` y `transferenciaId` (rechazo), `intentosRestantes` (código incorrecto). Ninguna otra.
> **Motivo:** un solo formato de `type` para todos los errores. El cliente decide por `type` y muestra el motivo con un mapa de textos. `409` describe un conflicto con un recurso existente; se distingue de `422`, que se reserva para reglas de negocio sobre una entrada bien formada. El catálogo completo y el resto de los códigos van en §7.
> **Concesión consciente: el `409 correo-ya-registrado` revela si un correo existe.** Contradice el principio de R-1.7 (el login no revela la existencia del correo) y de D-10, pero se acepta:
> - R-1.4 exige rechazar el registro duplicado. Sin un paso de verificación por correo no hay forma de rechazarlo sin decir por qué; un `201` falso dejaría al usuario creyendo que tiene cuenta.
> - Se mitiga con el rate limit de registro (D-20, R-1.18, §11), que encarece enumerar correos en masa.
> - **Va en "qué haría con más tiempo" del README:** registro con verificación por correo. El endpoint respondería siempre `202` ("te enviamos un correo") y el aviso de cuenta existente llegaría solo al buzón del dueño, de modo que la respuesta HTTP no distinguiría un correo nuevo de uno registrado.
>
> `409 beneficiario-duplicado` no tiene ese problema: solo compara contra los beneficiarios del propio usuario.

### 4.2 Endpoints

Todas las rutas van bajo `/api`. 🔒 indica que exigen access token.

| Método y ruta | 🔒 | Rate limit | Éxito | Errores propios | Requisitos |
|---|---|---|---|---|---|
| `GET /health` | | | `200` | `503` | — |
| `POST /auth/registro` | | ✓ (§11) | `201` | `400`, `409`, `429`, `503` | R-1.1 a R-1.5, R-1.18 |
| `POST /auth/login` | | ✓ (§11) | `200` + cookie o `refreshToken` | `400`, `401`, `429` | R-1.6, R-1.7, R-1.13, R-1.18 |
| `POST /auth/refresh` | | | `200` | `400`, `401` | R-1.8 a R-1.10, R-1.14 a R-1.17 |
| `POST /auth/logout` | | | `204` | `400` | R-1.12 |
| `GET /cuentas` | 🔒 | | `200` | — | R-2.1 a R-2.3 |
| `GET /cuentas/{cuentaId}` | 🔒 | | `200` | `404` | R-2.4 |
| `GET /cuentas/{cuentaId}/movimientos` | 🔒 | | `200` | `400`, `404` | R-5.1 a R-5.10 |
| `GET /cuentas/{cuentaId}/estado-cuenta?mes=` | 🔒 | | `200 text/csv` | `400`, `404` | R-B1.1 a R-B1.5 |
| `GET /beneficiarios` | 🔒 | | `200` | — | R-3.11 |
| `POST /beneficiarios` | 🔒 | ✓ (§11) | `201` | `400`, `409`, `422`, `429` | R-3.1 a R-3.9 |
| `GET /beneficiarios/{beneficiarioId}` | 🔒 | | `200` | `404` | R-3.11 |
| `POST /transferencias` | 🔒 | | `201`, `202` | `400`, `404`, `422`, `503` | R-4.1 a R-4.19, R-6.1 a R-6.9 |
| `GET /transferencias/{transferenciaId}` | 🔒 | | `200` | `404`, `503` | R-4.10, R-6.12 |
| `POST /transferencias/{transferenciaId}/confirmar` | 🔒 | | `201` | `400`, `404`, `422`, `503` | R-6.10 a R-6.14 |
| `GET /limites` | 🔒 | | `200` | — | R-6.7 |
| `GET /docs`, `GET /openapi.yaml` | | | `200` | — | RNF-28 |

Toda ruta 🔒 puede responder además `401`, y cualquiera `500`.

**No existen** endpoints para abrir cuentas (D-20), borrar beneficiarios, cancelar pendientes, reenviar el código (D-07) ni operar Fondeo (D-02).

**Notas de diseño**

- **`GET /transferencias/{id}` puede escribir.** Si la transferencia está pendiente y su código venció, la deja `RECHAZADA/CODIGO_EXPIRADO` antes de responder (D-14, R-6.12). Es un `GET` idempotente en su efecto: dos llamadas dejan el mismo estado. Por eso también puede responder `503`.
- **Confirmar es idempotente sin llave.** El `id` de la transferencia ya identifica la operación: confirmar una aplicada devuelve el mismo `201`, y confirmar una rechazada devuelve el mismo `422` (R-6.13).
- **Respuestas de `POST /transferencias` y su repetición.** Las tres salen de `respuestaDeTransferencia(fila)` (§2.1, §6.2), con la excepción de DD-25.
- **Valores anticipados.** `openapi.yaml` ya fija dos valores que se justifican en el bloque D: la longitud de la contraseña (12 a 128 caracteres, §5) y los campos del comprobante (§6.6). Si esas secciones los cambian, el contrato se actualiza en el mismo commit.

> **DD-24 · Aprobada · Transporte del refresh token entre web y móvil**
> **Contexto:** D-06 dice que la API acepta el refresh por cookie (web) o por cuerpo (móvil) y que nunca le devuelve el refresh a la web en el cuerpo, pero no dice cómo sabe la API qué cliente es al iniciar sesión, ni si el registro abre sesión.
> **Opciones:** (1) detectar el cliente por `User-Agent`; (2) un header propio; (3) un campo explícito en el login.
> **Decisión:**
> - `POST /auth/login` recibe `cliente: "web" | "movil"`. Con `web`, el refresh va **solo** en la cookie `billetera_refresh`; con `movil`, solo en el cuerpo.
> - `POST /auth/refresh` y `POST /auth/logout` aceptan el refresh por cookie **o** por cuerpo; si llegan los dos, o ninguno en el refresh, responden `400`. **La respuesta usa el mismo canal por el que llegó el refresh**, sin importar lo que diga el cliente: un refresh por cookie nunca produce un refresh en el cuerpo.
> - Con cookie, el refresh y el logout exigen `X-Requested-With: fetch` (R-1.16).
> - El registro **no** abre sesión: responde `201` con `{ id, correo }`, y el cliente llama después a `/auth/login`.
> - El logout responde `204` aunque el refresh ya no sea válido, y siempre borra la cookie.
> **Motivo:** el canal de respuesta queda atado al canal de entrada, así que un XSS en la web no puede convertir la cookie en un refresh legible. Que el registro no abra sesión deja un solo lugar donde se emiten tokens y se escribe la cookie.

> **DD-25 · Aprobada · La repetición de un `202` no incluye `codigoSimulado`**
> **Contexto:** R-4.14 exige que la repetición con la misma llave devuelva el mismo cuerpo, incluidas las pendientes "sin generar un código nuevo". R-6.17 pone el código simulado en `codigoSimulado` de la respuesta `202`. Pero R-6.16 y D-07 prohíben guardar el código en claro: solo se guarda su HMAC, así que la repetición no puede reproducirlo.
> **Opciones:** (1) guardar el código cifrado solo en modo simulado; (2) mandarlo en un header en lugar del cuerpo; (3) omitirlo en la repetición.
> **Decisión:** la opción 3. La repetición de un `202` es idéntica a la primera respuesta salvo por `codigoSimulado`, que solo aparece la primera vez. Es la única excepción a R-4.14, y solo existe con `OTP_SIMULADO=true`, que nunca está activo en producción (RNF-15). La prueba de idempotencia compara los cuerpos sin ese campo y verifica aparte que la repetición no lo trae.
> **Motivo:** la opción 1 crea justo el dato que R-6.16 prohíbe, aunque sea en desarrollo. La opción 2 contradice R-6.17, que pide el campo en la respuesta. En producción el código llega por otro canal (SMS o correo), así que la repetición se comporta igual que un proveedor real: el usuario ya recibió el código.
> **Recuperar el código simulado en los clientes.** Si el usuario recarga la web o reabre la app en la pantalla del código, el reenvío con la misma llave (R-4.25, R-4.31) devuelve el `202` sin `codigoSimulado`, y en modo simulado no habría otro canal para recibirlo. Para eso:
> - Si la primera respuesta `202` trae `codigoSimulado`, el cliente lo guarda **junto con el intento**: la web en `sessionStorage` (D-16) y la app móvil en `expo-secure-store` (D-17). Al reanudar, lo toma de ahí y no de la respuesta.
> - Se borra con el intento: cuando la transferencia se resuelve (`201` o `422`) y al cerrar sesión (R-1.12).
> - **En producción el campo no existe**, porque la API no arranca con `OTP_SIMULADO=true` (RNF-15). Los clientes solo guardan lo que trae la respuesta, así que no guardan nada; no hay una rama de código que dependa del entorno.
> - Las pruebas de web (RNF-25) y de móvil (RNF-26) cubren la recarga en la pantalla del código: se recupera el código guardado y la confirmación funciona.

> **DD-26 · Aprobada · El destino de una transferencia es una unión discriminada**
> **Contexto:** R-4.6 permite como destino un beneficiario del usuario o una cuenta propia. Hay que expresarlo en el cuerpo sin ambigüedad.
> **Opciones:** (1) dos campos opcionales, `beneficiarioId` y `cuentaDestinoId`, con la regla "exactamente uno"; (2) una unión discriminada.
> **Decisión:** `destino: { tipo: "BENEFICIARIO", beneficiarioId } | { tipo: "CUENTA_PROPIA", cuentaId }`, con `discriminator` en OpenAPI y `z.discriminatedUnion` en Zod. El hash de idempotencia (D-03) incluye `destino.tipo` y el id. `Beneficiario` incluye además `esCuentaPropia`, para que los clientes muestren que enviarle es un traspaso (R-3.8) sin revelar nada del titular.
> **Motivo:** un tipo que no admite estados inválidos ("ninguno" o "los dos"), así que no hace falta una regla aparte. El tipo de transferencia (`TRASPASO` o `TERCERO`) **no** sale de `destino.tipo`: lo decide siempre el dueño real de la cuenta destino (D-04, DD-17).

### 4.3 Tipos generados y documentación navegable

**Tipos desde el contrato (RNF-18)**

1. `npm run gen:tipos` ejecuta `openapi-typescript specs/openapi.yaml -o packages/shared/src/api/openapi.ts`.
2. El archivo generado **se versiona**. En CI, un paso lo regenera y falla si `git diff --exit-code` encuentra diferencias: el contrato y los tipos nunca se desincronizan.
3. `shared` reexporta alias legibles: `type Cuenta = components['schemas']['Cuenta']`, `type Comprobante = …`.
4. La API tipa las respuestas de sus controladores con esos alias, y web y móvil tipan su cliente `fetch` con `paths`.

**Esquemas Zod y contrato.** Los esquemas Zod de entrada viven en `shared/src/esquemas` y se escriben a mano, porque llevan refinamientos que JSON Schema no expresa (dígito verificador de la CLABE, `montoTextoACentavos`). Para que no se desvíen del contrato:

- Una prueba de tipos (`expectTypeOf` de Vitest) verifica que `z.infer<typeof esquema>` y el tipo generado son mutuamente asignables, para cada cuerpo de entrada.
- Las pruebas de integración validan **cada respuesta** de la API contra el esquema de su operación y código en `openapi.yaml`, con Ajv en modo JSON Schema 2020-12. Una respuesta que no cumple el contrato hace fallar la prueba aunque el resto de las aserciones pase.

**Documentación navegable (RNF-28)**

- `GET /api/docs` sirve Swagger UI (`swagger-ui-express`) con el contrato.
- `GET /api/openapi.yaml` sirve el archivo tal cual, para Redoc o Postman.
- Se monta solo si `NODE_ENV !== 'production'`.
- En CI, `redocly lint specs/openapi.yaml` valida el documento.

> **DD-27 · Aprobada · Verificación del contrato y documentación solo fuera de producción**
> **Contexto:** RNF-18 pide tipos generados desde el contrato, pero un contrato que el servidor no cumple genera tipos que mienten.
> **Decisión:** las cuatro verificaciones anteriores (diff de tipos generados, prueba de tipos de Zod, validación de respuestas con Ajv y `redocly lint`) corren en CI. Swagger UI no se monta en producción.
> **Motivo:** cada una cierra un camino distinto por el que el contrato puede mentir: tipos viejos, Zod desviado, servidor desviado y documento inválido. En producción, publicar el contrato completo solo amplía la superficie de reconocimiento sin beneficio para el usuario; los equipos lo consultan en el repositorio.

---

## 5. Autenticación y sesión

### 5.1 Contraseñas

**Política** (cierra el pendiente §12.1 de `requirements.md`). La valida el esquema Zod de `shared` en web y en la API:

| Regla | Valor |
|---|---|
| Longitud | 12 a 128 caracteres, contados después de normalizar a Unicode NFC |
| Composición | Sin reglas de mayúsculas, números ni símbolos |
| Prohibidas | La contraseña igual al correo, o igual a la parte local del correo, sin distinguir mayúsculas; y las de una lista de 1,000 contraseñas comunes incluida en `api` |
| Espacios | Permitidos, sin recortar: la contraseña se usa tal como se escribió |

**Hash.** argon2id con `memoryCost = 19456` KiB (19 MiB), `timeCost = 2` y `parallelism = 1`, el mínimo que recomienda OWASP para argon2id. El hash en formato PHC (`$argon2id$v=19$m=19456,t=2,p=1$…`) lleva sus parámetros, así que se pueden subir en el futuro sin romper los hashes existentes.

**Login sin revelar el correo (R-1.7).** Si el correo no existe, la API verifica igual la contraseña contra un hash ficticio calculado al arrancar con los mismos parámetros. Así, un correo inexistente y una contraseña incorrecta tardan lo mismo y responden el mismo `401`.

> **DD-28 · Aprobada · Política de contraseñas y parámetros de argon2id (cierra §12.1)**
> **Contexto:** RNF-03 pide argon2 o bcrypt, y R-1.5 pide validar la contraseña, pero no hay política.
> **Opciones:** (1) reglas de composición clásicas (mayúscula, número, símbolo); (2) longitud mínima y lista de contraseñas comunes, como recomienda NIST SP 800-63B.
> **Decisión:** la opción 2, con los valores de la tabla. argon2id con los parámetros mínimos de OWASP. Normalización NFC antes de validar y de calcular el hash. Máximo de 128 caracteres. Hash ficticio en el login para igualar tiempos.
> **Motivo:** las reglas de composición producen contraseñas predecibles (`Contraseña1!`) sin añadir entropía real; la longitud sí la añade. NFC evita que la misma contraseña escrita en dos teclados (un acento compuesto o precompuesto) produzca hashes distintos. El tope de 128 acota el costo de cada hash, para que no se pueda saturar la API con contraseñas enormes. Sin el hash ficticio, el tiempo de respuesta revelaría qué correos existen, aunque el cuerpo sea idéntico.
> **Fuera de alcance:** volver a calcular el hash al subir los parámetros. Exigiría `UPDATE` sobre `hash_contrasena`, que el rol de la API no tiene (DD-18). Va en "qué haría con más tiempo".

### 5.2 Access token

| Aspecto | Valor |
|---|---|
| Formato | JWT firmado con HS256 y `JWT_SECRETO` (32 bytes o más, §2.4) |
| Claims | `sub` (id del usuario), `iat`, `exp` (15 minutos, D-05), `iss = "billetera-api"`, `aud = "billetera"` |
| Verificación | `jose.jwtVerify` con `algorithms: ['HS256']`, `issuer`, `audience` y tolerancia de reloj de 5 s |
| Transporte | `Authorization: Bearer …`, nunca en cookie |
| Almacenamiento | En memoria, en web y en móvil (D-06) |

El middleware `autenticar` **no consulta la base**: verifica firma y claims y pone `req.usuarioId`. Cualquier fallo (sin header, mal formado, firma inválida, vencido) responde el mismo `401 unauthorized` (R-1.11).

**Un access token no se puede revocar.** Cerrar sesión revoca la familia de refresh, pero un access ya emitido sigue siendo válido hasta 15 minutos. Es el costo aceptado de no consultar la base en cada petición.

> **DD-29 · Aprobada · JWT con HS256 y sin revocación del access**
> **Contexto:** D-05 fija la duración del access, pero no el algoritmo ni los claims.
> **Opciones:** (1) HS256 con un secreto compartido; (2) RS256 o EdDSA con un par de llaves.
> **Decisión:** HS256. Se fuerza la lista de algoritmos aceptados (`algorithms: ['HS256']`), para que no se puedan colar tokens con `alg: none` ni con otro algoritmo. El access no se revoca: su vida de 15 minutos es la ventana máxima después de cerrar sesión o de detectar el reúso de un refresh.
> **Motivo:** la misma API firma y verifica, así que la criptografía asimétrica no aporta nada hasta que otro servicio tenga que verificar tokens; ese cambio va en `docs/aws-deploy.md`. Consultar la base en cada petición para revocar el access añadiría una lectura a cada operación para cerrar una ventana de 15 minutos, que es justo lo que el access corto ya acota.

### 5.3 Refresh token y familias de sesión

**Valor.** 32 bytes de `crypto.randomBytes`, en base64url sin relleno (43 caracteres). En la base se guarda solo su SHA-256 en hexadecimal (D-05, RNF-02).

**Cookie de la web** (D-06, DD-24): `billetera_refresh=<valor>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=<segundos hasta expira_en>`.

**Login.** Crea una fila en `sesion` con `familia_id` nueva y `expira_en = ahora + 7 días`.

**Rotación** (`POST /auth/refresh`), en una `conTransaccion`:

1. `SELECT … FROM sesion WHERE refresh_hash = $1 FOR UPDATE`.
2. Según lo que encuentre:

| Caso | Acción | Respuesta |
|---|---|---|
| No existe | — | `401` |
| `revocada_en` no es `NULL` | — | `401` |
| `usada_en` no es `NULL` (**reúso**) | Revoca toda la familia (`UPDATE sesion SET revocada_en = $ahora WHERE familia_id = $1 AND revocada_en IS NULL`), registra `refresh-reuse-detected` y **confirma la transacción** | `401` |
| `expira_en <= ahora` | — | `401` |
| Válido | Marca `usada_en` e inserta una fila nueva en la **misma familia**, con el **mismo `expira_en`** | `200` con tokens nuevos |

El reúso se devuelve como resultado, no como excepción, para que la revocación y la auditoría se confirmen antes de responder `401`. Es el mismo patrón que los rechazos de negocio (§2.1).

**Bloqueos.** La rotación solo bloquea filas de `sesion`. Ningún flujo bloquea a la vez una sesión y filas de dinero (`usuario`, `transferencia`, `cuenta`), así que no se puede formar un ciclo con el orden total de D-12.

**Logout.** Busca la sesión por el hash del refresh, sin importar si ya se usó, y revoca su familia. Si no la encuentra, responde `204` igual (DD-24) y borra la cookie.

**Coordinación en los clientes.** La web usa `navigator.locks.request('billetera-refresh', …)` para que solo una pestaña rote a la vez (R-1.15). La pestaña que esperaba el lock manda la cookie ya rotada, porque la cookie es compartida. La app móvil guarda una sola promesa de refresh en vuelo (R-1.17). Detalle en §13.

> **DD-30 · Aprobada · La familia de sesión vence 7 días después del login**
> **Contexto:** D-05 dice "refresh de 7 días", pero no dice si cada rotación renueva el plazo.
> **Opciones:** (1) vencimiento deslizante: cada refresh nuevo vence 7 días después de emitirse, así que la sesión dura mientras se use al menos una vez por semana; (2) vencimiento absoluto: los refresh rotados heredan el `expira_en` de la familia.
> **Decisión:** vencimiento absoluto. Una sesión dura como máximo 7 días desde el login, sin importar cuántas veces se rote.
> **Motivo:** con vencimiento deslizante, un refresh robado y usado con regularidad mantendría la sesión del atacante abierta para siempre. En una billetera, volver a iniciar sesión una vez por semana es un costo aceptable.

### 5.4 CSRF y CORS

| Superficie | Protección |
|---|---|
| Endpoints con `Authorization: Bearer` | No aplica CSRF: el navegador no adjunta ese header por su cuenta |
| `POST /auth/refresh` y `/auth/logout` por cookie | `SameSite=Strict`, más el header `X-Requested-With: fetch`, que obliga a un *preflight* CORS desde otro origen (R-1.16, RNF-05) |
| CORS | `origin: WEB_ORIGIN`, `credentials: true`. En local, la web y la API comparten origen gracias al proxy de Vite (D-06), así que CORS solo actúa ante orígenes ajenos |

El rate limit de login y registro está en §11, y los eventos de auditoría de sesión en §10.

---

## 6. Transferencias: concurrencia, idempotencia, límite y código

### 6.1 Algoritmo de creación

`POST /transferencias` se procesa en el caso de uso `crearTransferencia`. El controlador solo pasa el cuerpo validado, la llave y el `usuarioId`.

```mermaid
flowchart TD
    A[Cuerpo validado + Idempotency-Key] --> B{¿Existe la llave<br/>para este usuario?}
    B -- sí, mismo hash --> R[Respuesta original<br/>reconstruida, DD-32]
    B -- sí, otro hash --> K[422 idempotency-key-reused]
    B -- no --> C{¿Origen y destino<br/>existen y son del usuario?}
    C -- no --> N[404 not-found]
    C -- sí --> D{¿Origen = destino?}
    D -- sí --> M[422 misma-cuenta]
    D -- no --> T[[conTransaccion]]
    T --> L1[ahora = Reloj · bloquea usuario]
    L1 --> L2{¿La llave apareció<br/>mientras esperaba?}
    L2 -- sí --> R
    L2 -- no --> L3[Bloquea cuentas por id ascendente]
    L3 --> S{¿saldo origen ≥ monto?}
    S -- no --> RS[RECHAZADA · SALDO_INSUFICIENTE<br/>422]
    S -- sí --> TP{¿TERCERO?}
    TP -- no --> AP[APLICADA + 2 asientos<br/>201]
    TP -- sí --> LI{¿consumido + monto ≤ límite?}
    LI -- no --> RL[RECHAZADA · LIMITE_DIARIO_EXCEDIDO<br/>422]
    LI -- sí --> U{¿monto > umbral?}
    U -- no --> AP
    U -- sí --> PE[PENDIENTE_CONFIRMACION + código<br/>202]
```

**Pasos**

1. **Búsqueda rápida de la llave**, sin bloqueo: `SELECT … WHERE usuario_id = $1 AND llave_idempotencia = $2`. Si existe, se compara el hash (§6.2) y se responde sin abrir transacción de escritura.
2. **Resolución del destino**, fuera de la transacción, porque las cuentas no cambian de dueño (DD-17):
   - `CUENTA_PROPIA`: la cuenta debe ser del usuario.
   - `BENEFICIARIO`: el beneficiario debe ser del usuario; su `cuenta_id` es el destino.
   - Origen inexistente o ajeno, o destino inexistente o ajeno: `404 not-found`, idéntico en todos los casos (R-4.6). Fondeo nunca pasa este filtro: no es de ningún usuario y no puede ser beneficiario (R-4.7).
   - Origen igual a destino: `422 misma-cuenta`, sin crear la fila (R-4.4).
   - **Clasificación** (D-04): `TRASPASO` si el dueño de la cuenta destino es el usuario; si no, `TERCERO`.
3. **Transacción** (`conTransaccion`, §2.3):
   1. `ahora = Reloj.ahora(tx)` (DD-07).
   2. Bloquea al usuario: `SELECT id FROM usuario WHERE id = $1 FOR UPDATE` (D-04).
   3. **Vuelve a buscar la llave.** Dos peticiones con la misma llave son del mismo usuario, así que el bloqueo del paso anterior las pone en fila. La segunda encuentra aquí la fila que confirmó la primera y responde con ella (R-4.16).
   4. Bloquea las dos cuentas: `SELECT … FROM cuenta WHERE id = ANY($1) ORDER BY id FOR UPDATE` (D-12).
   5. Valida el saldo: `origen.saldo_centavos >= monto`.
   6. Solo si es `TERCERO`: valida el límite (§6.4).
   7. Solo si es `TERCERO` y `monto > UMBRAL_CODIGO_CENTAVOS`: crea la pendiente y su código (§6.5).
   8. Si no, inserta la transferencia `APLICADA` con `aplicada_en = ahora` y sus dos asientos con `creado_en = ahora`. El trigger mueve los saldos (D-01).
   9. Si un paso de validación falla, inserta la transferencia `RECHAZADA` con su motivo.
   10. Registra el evento de auditoría (§10) y confirma.
4. **Respuesta:** `respuestaDeTransferencia(fila)` (§6.2).

Los pasos 5 a 7 usan las filas ya bloqueadas, así que nada puede cambiar el saldo ni lo consumido entre la validación y la escritura. El `CHECK` de saldo queda como la última red (D-12).

> **DD-31 · Aprobada · Saldo y límite se validan también al crear una pendiente, saldo primero**
> **Contexto:** D-14 dice que una pendiente no reserva saldo ni límite y que todo se vuelve a validar al confirmar. No dice si se valida también al crearla.
> **Opciones:** (1) crear la pendiente sin validar, y rechazar solo al confirmar; (2) validar al crear y volver a validar al confirmar.
> **Decisión:**
> - La opción 2. Toda transferencia, pendiente o no, pasa por el bloqueo de cuentas y las validaciones de saldo y límite antes de decidir su estado. Si falla, queda `RECHAZADA` de inmediato y no se genera código. Al confirmar se valida otra vez (R-6.10), porque la pendiente no reservó nada.
> - Orden fijo de las validaciones: **saldo, luego límite, luego umbral**. Si fallan el saldo y el límite a la vez, el motivo es `SALDO_INSUFICIENTE`.
> **Motivo:** pedirle un código al usuario para algo que ya se sabe que no puede pasar es una mala experiencia, y además genera un código y un evento de auditoría inútiles. Un orden fijo hace determinista el motivo de rechazo, así que las pruebas pueden afirmarlo. El saldo va primero porque es la restricción que no depende del día.

### 6.2 Idempotencia

**Hash de la petición** (D-03). SHA-256 en hexadecimal de este JSON canónico, con las claves en este orden fijo:

```json
["v1", "<cuentaOrigenId>", "<destino.tipo>", "<beneficiarioId o cuentaId>", <montoCentavos>, "<concepto>", "<referencia>"]
```

- Se calcula **después** de que Zod normaliza: `trim`, Unicode NFC y los uuid en minúsculas. Dos cuerpos que difieren solo en espacios o en la forma de un acento producen el mismo hash.
- Es un arreglo, no un objeto, para que el orden de las claves del cliente no importe.
- `"v1"` versiona el formato: si un día cambia el cuerpo, las llaves viejas no chocan con el formato nuevo.

**Escenarios**

| Situación | Resultado | Requisito |
|---|---|---|
| Llave nueva | Se procesa (§6.1) | R-4.1 |
| Misma llave, mismo hash, transferencia ya resuelta o pendiente | La **respuesta original**, reconstruida desde la fila (abajo). Sin mover dinero ni generar código | R-4.14 |
| Misma llave, hash distinto | `422 idempotency-key-reused`, sin mover dinero | R-4.15 |
| Dos peticiones simultáneas con la misma llave | El bloqueo del usuario las pone en fila. La segunda encuentra la fila en el paso 3.3 y devuelve lo mismo | R-4.16 |
| Misma llave, dos usuarios | Dos transferencias independientes: la unicidad es por `(usuario_id, llave_idempotencia)` | R-4.17 |
| Petición sin `Idempotency-Key` o sin formato UUID | `400 validation-error` antes de tocar la base | R-4.13 |
| Petición rechazada antes de crear la fila (`404`, `422 misma-cuenta`, `400`) | No se guarda nada: un reintento con la misma llave vuelve a evaluarse desde cero | D-14 |
| `503` por timeout de bloqueo | No se guardó nada (`ROLLBACK`). El reintento con la misma llave procesa la operación una sola vez | R-4.19 |

**Red de seguridad del `23505`.** Si, pese al bloqueo del usuario, el `INSERT` choca con `UNIQUE (usuario_id, llave_idempotencia)`, la transacción ya está abortada. El caso de uso abre otra `conTransaccion`, lee la fila ganadora y responde como en el escenario de repetición (D-03). Con el bloqueo del usuario, esto no debería ocurrir; si ocurre, se registra como `warn`.

**`respuestaDeTransferencia(fila)`** es una función pura de la transferencia, su código de confirmación (si existe) y los datos del comprobante:

| La fila se creó como | Se reconoce porque | Respuesta |
|---|---|---|
| `APLICADA` sin código | No tiene `codigo_confirmacion` y está `APLICADA` | `201` con el comprobante |
| `RECHAZADA` sin código | No tiene `codigo_confirmacion` y está `RECHAZADA` | `422` con su motivo y `transferenciaId` |
| `PENDIENTE_CONFIRMACION` | Tiene `codigo_confirmacion` | `202` con `codigoExpiraEn` del código, **sin `codigoSimulado`** (DD-25) |

Los datos del comprobante (nombres de cuenta, CLABE, alias y nombre del beneficiario) son inmutables: ni las cuentas ni los beneficiarios tienen permisos de `UPDATE` sobre esas columnas (DD-18). Por eso la reconstrucción da siempre el mismo cuerpo.

> **DD-32 · Aprobada · La repetición devuelve la respuesta original, no el estado actual**
> **Contexto:** una pendiente cambia de estado después de crearse: se aplica, se rechaza o vence. Si llega una repetición con la misma llave después de ese cambio, hay dos lecturas posibles de "devolver el resultado guardado" (D-03).
> **Opciones:** (1) responder según el estado actual: `201` si ya se aplicó, `422` si venció; (2) responder siempre lo mismo que la primera vez.
> **Decisión:**
> - La opción 2: la repetición de una transferencia creada como pendiente siempre devuelve el `202` original. El estado actual se consulta con `GET /transferencias/{id}`, o se obtiene al confirmar, porque confirmar una ya aplicada devuelve su `201` y una ya rechazada devuelve su `422` (R-6.13).
> - Normalización y forma del hash como arriba, con el prefijo de versión `"v1"`.
> **Motivo:** R-4.14 exige el mismo código y el mismo cuerpo; con la opción 1, la misma llave daría respuestas distintas según el momento. Los clientes no pierden nada, gracias a las dos reglas de "Reanudación en los clientes" (abajo): un `202` que llega por reintento se contrasta con el estado real, y una confirmación interrumpida se reintenta como confirmación.
> **Precisión aprobada, que afecta a D-16 y D-17:** el intento guardado registra su **fase**, y un `202` recibido por reintento o reanudación se contrasta con `GET /transferencias/{id}` antes de pedir el código. Detalle abajo y en las máquinas de estados de §13.2 y §13.3.

#### Reanudación en los clientes

El intento que la web guarda en `sessionStorage` (D-16) y la app móvil en `expo-secure-store` (D-17) tiene una **fase**:

| Fase | Contenido guardado | Qué se reintenta si se pierde la red o se reanuda | Por qué es seguro |
|---|---|---|---|
| `creacion` | Llave, cuerpo congelado, id del usuario (móvil) | `POST /transferencias` con la **misma llave** y el mismo cuerpo | Idempotencia por llave (D-03) |
| `confirmacion` | Lo anterior, más `transferenciaId`, `codigoExpiraEn`, `codigoSimulado` si vino (DD-25) y, mientras la petición está en vuelo, el código capturado | `POST /transferencias/{id}/confirmar` con el mismo código, **nunca** la creación | Confirmar es idempotente por el id de la transferencia (D-07, R-6.13) |

- El intento pasa de `creacion` a `confirmacion` en cuanto llega el `202` (de la primera respuesta o de una repetición), y se guarda **antes** de mostrar la captura del código.
- El código capturado se guarda solo mientras la confirmación está en vuelo, y se borra al recibir respuesta. El intento completo se borra al resolverse (`201` o `422`) y al cerrar sesión (R-1.12).
- **Un `202` recibido por reintento o reanudación no lleva directo a la captura del código.** Primero el cliente consulta `GET /transferencias/{id}`, que además aplica la expiración perezosa (R-6.12), y muestra el estado real:

  | Estado real | El cliente muestra |
  |---|---|
  | `APLICADA` | El comprobante, armado con la respuesta del `GET` |
  | `RECHAZADA` | El rechazo con su motivo |
  | `PENDIENTE_CONFIRMACION` | La captura del código, con el `codigoExpiraEn` real |

  Solo la **primera** respuesta `202` de un intento lleva directo a la captura, porque en ese momento el estado real es necesariamente "pendiente".
- **Costo aceptado:** si el código reintentado era incorrecto, el reintento también falla y cuenta como un intento más (D-07). El usuario lo ve en `intentosRestantes`. Evitarlo exigiría una llave de idempotencia también en la confirmación, que D-07 no contempla. Va en "qué haría con más tiempo".

Para que el `GET` alcance a armar el comprobante, el esquema `Transferencia` de `openapi.yaml` lleva el mismo `origen` (`cuentaId`, `nombre`, `clabeTerminacion`) y `destino` que `Comprobante`.

### 6.3 Orden de bloqueo y timeouts

Orden total de D-12: **usuario → transferencia / código → cuentas por `id` ascendente.** Cada flujo toma un prefijo de esa secuencia y nunca vuelve a un nivel anterior:

| Flujo | Usuario | Transferencia y código | Cuentas | Transacciones |
|---|---|---|---|---|
| Crear transferencia (§6.1) | ✓ | — (la fila se inserta, no se bloquea) | ✓ origen y destino | 1 |
| Confirmar con código correcto (§6.5) | ✓ | ✓ | ✓ origen y destino | 1 |
| Confirmar con código incorrecto | ✓ | ✓ | — | 1, que se confirma solo con el intento |
| Expiración perezosa (`GET /transferencias/{id}` o confirmar) | ✓ | ✓ | — | 1 |
| Registro con fondeo de bienvenida (D-20) | ✓ (el usuario recién insertado) | — | ✓ Fondeo y `Principal` | 1 |
| Fondeo del seed (fase 1) | ✓ | — | ✓ Fondeo y destino | 1 por fondeo |
| Refresh y logout (§5.3) | — | — | — | Solo `sesion`, fuera del dominio del dinero |

- **Timeouts:** `lock_timeout = 5s` y `statement_timeout = 10s` en cada transacción (D-12). Si se agotan, `503 retryable` (DD-10).
- **Deadlock (`40P01`):** se reintenta hasta 3 veces con log `warn` (§2.3). Con el orden total no debería ocurrir; si ocurre, es un bug en el orden. La prueba de concurrencia exige cero deadlocks (RNF-24).
- **Punto caliente de Fondeo.** Todo fondeo bloquea la fila de Fondeo, así que los registros simultáneos hacen fila en ella (D-20). En local es irrelevante; el escenario ×100 va en `docs/aws-deploy.md`.

### 6.4 Límite diario y medianoche

Una sola función de repositorio, `consumidoDelDia(tx, usuarioId, ahora)`, sirve a crear, confirmar y `GET /limites`:

```sql
SELECT coalesce(sum(monto_centavos), 0)::bigint AS consumido
  FROM transferencia
 WHERE usuario_id = $1
   AND estado = 'APLICADA' AND tipo = 'TERCERO'         -- predicado del índice parcial (D-04, D-09)
   AND aplicada_en >=  date_trunc('day', $2::timestamptz AT TIME ZONE 'America/Mexico_City')
                         AT TIME ZONE 'America/Mexico_City'
   AND aplicada_en <  (date_trunc('day', $2::timestamptz AT TIME ZONE 'America/Mexico_City')
                         + interval '1 day') AT TIME ZONE 'America/Mexico_City';
```

- `$2` es `ahora` del `Reloj`. En la confirmación es la hora de la confirmación, no la de creación (R-6.6).
- El día es `[00:00, 24:00)` local, con la zona con nombre y nunca con un desfase fijo (D-15, R-6.5). Sumar `1 day` **a la hora local** antes de volver a UTC da la medianoche correcta aunque la zona cambie de horario.
- Usa el índice parcial `(usuario_id, aplicada_en) WHERE estado = 'APLICADA' AND tipo = 'TERCERO'` como rango.
- La regla es `consumido + monto <= LIMITE_DIARIO_CENTAVOS`. Llegar exactamente al límite está permitido (R-6.1).
- Solo cuentan los envíos a tercero aplicados (R-6.3). Las pendientes no reservan límite (D-14).

**`GET /limites`** devuelve `limiteCentavos`, `consumidoCentavos`, `disponibleCentavos = max(0, límite − consumido)`, `dia` (fecha local) y `reiniciaEn` (inicio del día siguiente, en UTC), todo calculado en la API (R-6.7).

**Pruebas de la medianoche** (RNF-23), con `RelojFijo`:

| Escenario | `ahora` (local) | Esperado |
|---|---|---|
| Agotar el límite al final del día | Transferencias aplicadas a las 23:59:59.999999 | Una más el mismo día: `LIMITE_DIARIO_EXCEDIDO` |
| Día siguiente | 00:00:00.000000 | Consumido = 0; se aplica |
| Pendiente que cruza la medianoche | Creada a las 23:58, confirmada a las 00:01 | Cuenta para el día nuevo y se valida contra ese día |
| Exactamente en el límite | Consumido `4000000` y monto `1000000` | Se aplica; disponible = 0 |

### 6.5 Código de un solo uso

**Generación**, dentro de la transacción de creación (§6.1, paso 7):

- `codigo = crypto.randomInt(0, 1_000_000)`, con ceros a la izquierda hasta 6 dígitos.
- Se guarda `codigo_hmac = HMAC-SHA256(OTP_HMAC_SECRETO, transferenciaId + ":" + codigo)` en hexadecimal, con `expira_en = ahora + 5 minutos` (D-07).
- Después de confirmar la transacción, `ProveedorOtp.enviar` entrega el código. La implementación simulada lo devuelve para `codigoSimulado` (R-6.17).

El código nunca se guarda en claro ni se escribe en los logs (R-6.16): `pino` censura `codigo` y `codigoSimulado` en cualquier ruta (§10), y los cuerpos de las peticiones no se registran.

**Confirmación** (`POST /transferencias/{id}/confirmar`), en una sola `conTransaccion`:

1. `ahora = Reloj.ahora(tx)`; bloquea al usuario.
2. Bloquea la transferencia (`WHERE id = $1 AND usuario_id = $2 FOR UPDATE`) y su código. Si no existe o es ajena: `404` (R-6.14).
3. Según su estado:

| Estado y condición | Acción | Respuesta |
|---|---|---|
| `APLICADA` | Ninguna; no consume intentos | El mismo `201` con el mismo comprobante (R-6.13) |
| `RECHAZADA` | Ninguna | El mismo `422` de su rechazo |
| Pendiente y `expira_en <= ahora` | Pasa a `RECHAZADA/CODIGO_EXPIRADO` y audita | `422 codigo-expirado` (R-6.12) |
| Pendiente, código incorrecto, `intentos + 1 < 3` | `intentos + 1` y evento `codigo-incorrecto` | `422 codigo-incorrecto` con `intentosRestantes` |
| Pendiente, código incorrecto, `intentos + 1 = 3` | `intentos = 3`, evento `codigo-incorrecto`, `RECHAZADA/CODIGO_AGOTADO` y su evento | `422 codigo-agotado` (R-6.11) |
| Pendiente y código correcto | Bloquea las cuentas por `id` ascendente y vuelve a validar saldo y límite con `ahora` (§6.1, pasos 3.5 y 3.6) | `201`, o `422` por saldo o límite (R-6.10) |

4. Confirma la transacción y responde.

- **El intento fallido queda confirmado antes de responder** (R-6.11). Es un resultado, no una excepción (§2.1). Esa transacción no toca cuentas ni dinero, que es lo que pide D-07 con "su propia transacción ya confirmada".
- **Comparación de tiempo constante:** `crypto.timingSafeEqual` sobre los dos HMAC como `Buffer` de 32 bytes (R-6.16).
- **Expiración perezosa en `GET /transferencias/{id}`:** lee la fila sin bloqueo. Solo si está pendiente y vencida, abre la transacción, bloquea usuario y transferencia en el orden de D-12, vuelve a comprobar y la pasa a `RECHAZADA/CODIGO_EXPIRADO` (D-14).
- Para volver a intentar después de un rechazo por código, el cliente vuelve al formulario y genera una llave nueva (R-6.15).

> **DD-33 · Aprobada · El HMAC del código incluye el id de la transferencia, y el fallo responde con los intentos restantes**
> **Contexto:** D-07 fija el HMAC, los 3 intentos y la comparación de tiempo constante, pero no qué datos entran al HMAC ni qué ve el usuario al fallar.
> **Decisión:**
> - El mensaje del HMAC es `transferenciaId + ":" + codigo`.
> - Un fallo que no agota los intentos responde `422 codigo-incorrecto` con `intentosRestantes` (2 o 1). El tercer fallo responde `422 codigo-agotado`, que es el rechazo definitivo.
> **Motivo:** con el id en el mensaje, el mismo código de 6 dígitos en dos transferencias produce dos HMAC distintos: quien lea la tabla no puede ver qué transferencias comparten código ni reusar uno entre transferencias. Decirle al usuario cuántos intentos le quedan no ayuda a un atacante, que ya sabe que son 3 (D-07), y evita que el usuario agote el último sin saberlo.

### 6.6 Comprobante

Cierra el pendiente §12.5 de `requirements.md`. El esquema es `Comprobante` en `openapi.yaml`:

| Campo | Contenido |
|---|---|
| `transferenciaId` | Sirve como folio |
| `estado` | Siempre `APLICADA` |
| `tipo` | `TRASPASO` o `TERCERO` |
| `montoCentavos`, `concepto`, `referencia` | Tal como se capturaron |
| `origen` | `cuentaId`, `nombre` de la cuenta y `clabeTerminacion` (últimos 4 dígitos) |
| `destino` | `etiqueta` (alias del beneficiario o nombre de la cuenta propia), `nombre` (nombre capturado del beneficiario o de la cuenta propia) y `clabeTerminacion` |
| `creadaEn`, `aplicadaEn` | Instantes en UTC (DD-22). En una transferencia confirmada con código, son distintos |

Los clientes muestran las fechas en hora de `America/Mexico_City` y el monto con `formatearMXN` (R-2.5).

> **DD-34 · Aprobada · Contenido del comprobante (cierra §12.5)**
> **Contexto:** R-4.11 pide un comprobante "con los datos de la transferencia" sin fijar cuáles.
> **Decisión:** los campos de la tabla. Las CLABE se muestran solo con sus últimos 4 dígitos. No incluye el correo ni ningún dato del titular de la cuenta destino.
> **Motivo:** un comprobante se comparte, por ejemplo en una captura de pantalla. Los últimos 4 dígitos bastan para que el usuario reconozca la cuenta sin exponer la CLABE completa. No revelar al titular cumple R-3.6 también aquí: el nombre que aparece es el que el usuario capturó.

### 6.7 Longitudes y formatos de los campos

Los valores están en DD-16 (§3.2) y se aplican igual en tres lugares: el esquema Zod de `shared` (web, móvil y API), el `CHECK` de la base y `openapi.yaml`. La política de contraseña está en §5.1. Resumen:

| Campo | Regla |
|---|---|
| `correo` | 3 a 254 caracteres, normalizado a minúsculas |
| `contrasena` | 12 a 128 caracteres en NFC (DD-28) |
| `nombre` del beneficiario | 1 a 100 caracteres |
| `alias` | 1 a 40 caracteres |
| `concepto` | 1 a 40 caracteres |
| `referencia` | 1 a 7 dígitos, como texto |
| `montoCentavos` | Entero de 1 a `100000000000` (D-18) |
| `clabe` | 18 dígitos con dígito verificador válido (D-19) |
| `codigo` | 6 dígitos |

Todos los textos se recortan, se normalizan a NFC y no admiten caracteres de control.

---

## 7. Manejo de errores RFC 7807

### 7.1 Formato

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json
X-Request-Id: 6f0c…

{
  "type": "saldo-insuficiente",
  "title": "Saldo insuficiente",
  "status": 422,
  "detail": "La cuenta origen no tiene saldo suficiente para esta transferencia.",
  "motivo": "SALDO_INSUFICIENTE",
  "transferenciaId": "0b6f1f8e-4f0c-4b8e-9a51-7d0e0f6a2c11"
}
```

- `type`, `title`, `status` y `detail` siempre van presentes (RNF-01). `instance` no se usa.
- **`title` es fijo por `type`**, y **`detail` es un texto fijo en español** escrito para el usuario. Ninguno se arma con mensajes de excepciones ni de PostgreSQL.
- Las extensiones son solo las de DD-23: `errores`, `motivo`, `transferenciaId` e `intentosRestantes`.
- Los clientes deciden por `type`, nunca por `detail`.

### 7.2 Catálogo

| `type` | HTTP | Cuándo | Extensiones | Requisitos |
|---|---|---|---|---|
| `validation-error` | 400 | Falla un esquema Zod, el JSON está mal formado, el cuerpo pasa de 16 kB, o `desde > hasta` | `errores` | R-1.5, R-3.3, R-3.4, R-4.8, R-4.9, R-4.13, R-5.2, R-5.5, R-B1.5 |
| `invalid-cursor` | 400 | Cursor mal formado o generado con otros filtros | — | R-5.7 |
| `unauthorized` | 401 | Sin access válido; credenciales incorrectas; refresh inválido, vencido, revocado o reusado | — | R-1.7, R-1.9 a R-1.11 |
| `not-found` | 404 | Recurso inexistente o ajeno; ruta inexistente | — | R-2.4, R-3.11, R-4.6, R-4.10, R-5.10, R-6.14, R-B1.4 |
| `correo-ya-registrado` | 409 | Registro con un correo existente (concesión de DD-23) | — | R-1.4 |
| `beneficiario-duplicado` | 409 | Misma CLABE o mismo alias, sin distinguir mayúsculas, entre los beneficiarios del usuario | `errores` (campo `clabe` o `alias`) | R-3.7 |
| `clabe-not-found` | 422 | CLABE válida que no es de ninguna cuenta de usuario | — | R-3.5 |
| `misma-cuenta` | 422 | Origen igual a destino; no se crea la fila | — | R-4.4 |
| `idempotency-key-reused` | 422 | Misma llave con otro cuerpo | — | R-4.15 |
| `saldo-insuficiente` | 422 | Rechazo guardado | `motivo`, `transferenciaId` | R-4.3, R-6.10 |
| `limite-diario-excedido` | 422 | Rechazo guardado | `motivo`, `transferenciaId` | R-6.2, R-6.10 |
| `codigo-incorrecto` | 422 | Código erróneo con intentos restantes | `transferenciaId`, `intentosRestantes` | R-6.11 |
| `codigo-agotado` | 422 | Tercer fallo, o confirmar una ya rechazada por agotamiento | `motivo`, `transferenciaId` | R-6.11 |
| `codigo-expirado` | 422 | Código vencido | `motivo`, `transferenciaId` | R-6.12 |
| `too-many-requests` | 429 | Rate limit excedido; con `Retry-After` | — | R-1.18, R-3.9 |
| `retryable` | 503 | `lock_timeout`, `statement_timeout`, deadlock que persiste tras 3 reintentos, o base no disponible; con `Retry-After: 1` | — | R-4.19 |
| `internal-error` | 500 | Cualquier otra cosa | — | RNF-01 |

Los `type` de esta tabla son exactamente el `enum` de `TipoProblema` en `openapi.yaml`.

### 7.3 Traducción de errores internos

`manejadorErrores` es el único lugar que produce problems. Revisa la causa en este orden:

| Origen | Se reconoce por | Problem |
|---|---|---|
| `ZodError` | Clase | `400 validation-error`; cada issue es un `{ campo, mensaje }` con su ruta prefijada (`body.`, `query.`, `params.`, `headers.`) |
| JSON mal formado | `SyntaxError` de `express.json` (`type = 'entity.parse.failed'`) | `400 validation-error` con `campo: "body"` |
| Cuerpo demasiado grande | `type = 'entity.too.large'` | `400 validation-error` con `campo: "body"` |
| `ErrorDominio` | Clase; lleva su `type` | El de su `type` |
| `23505` en `uq_usuario_correo` | `constraint` del error de `pg` | `409 correo-ya-registrado` |
| `23505` en `uq_beneficiario_usuario_clabe` o `uq_beneficiario_usuario_alias` | `constraint` | `409 beneficiario-duplicado` con el campo |
| `23505` en `uq_transferencia_usuario_llave` | `constraint` | Lo resuelve el caso de uso (§6.2); nunca llega aquí |
| `55P03`, `57014`, `40P01` agotado, conexión rechazada | `code` de `pg` | `503 retryable` (DD-10) |
| Cualquier otro error | — | `500 internal-error` |

**Las restricciones tienen nombre.** Cada `UNIQUE`, `CHECK`, FK y trigger se crea con nombre explícito (`uq_<tabla>_<columnas>`, `ck_<tabla>_<regla>`, `fk_<tabla>_<columna>`, `tg_<tabla>_<accion>`). El manejador decide por el **nombre** de la restricción, nunca por el texto del mensaje de PostgreSQL. Esos nombres no salen de la API.

**Registro y beneficiarios sin verificar antes.** El duplicado se detecta por el `23505` del `INSERT`, no por un `SELECT` previo: la consulta previa tendría una carrera entre la lectura y la escritura, y el índice único es atómico.

### 7.4 Qué nunca se filtra

| Nunca en la respuesta | Dónde queda |
|---|---|
| Trazas, mensajes de excepciones, `err.message` | Log `error` con `reqId` (§10) |
| SQL, `SQLSTATE`, nombres de tablas, columnas, restricciones o triggers | Log `error` |
| Si un recurso ajeno existe (D-10) | — |
| Si un correo existe al iniciar sesión (R-1.7) | — |
| Valores de configuración o secretos | — |

**Pruebas** (§14):

- Se fuerza un error interno con un repositorio de prueba que lanza un error con SQL en el mensaje. La respuesta debe tener solo las cuatro claves estándar, y ni `SELECT`, ni `at `, ni el nombre de la tabla.
- Para cada fila de §7.2, una prueba provoca el error y compara `type` y `status` con el catálogo.
- La validación de respuestas con Ajv (DD-27) verifica la forma de cada problem contra `openapi.yaml`.

> **DD-35 · Aprobada · Traducción de errores por nombre de restricción, con textos fijos**
> **Contexto:** RNF-01 prohíbe filtrar detalles internos, pero el manejador necesita saber qué falló para elegir el `type`.
> **Decisión:**
> - Las restricciones tienen nombres explícitos con la convención anterior, y el manejador decide solo por `code` y `constraint` del error de `pg`.
> - `title` y `detail` son textos fijos por `type`.
> - JSON mal formado y cuerpo demasiado grande responden `400 validation-error`, sin `413` ni `type` propios.
> - Un deadlock que persiste después de 3 reintentos responde `503 retryable`.
> **Motivo:** decidir por el texto del mensaje rompe con cualquier cambio de versión o de idioma de PostgreSQL. Con textos fijos, ningún dato interno puede viajar por error dentro de `detail`. Mantener el catálogo en 17 `type` hace que cada cliente lo cubra completo con un mapa de textos.

---
