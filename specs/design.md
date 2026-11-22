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

Estados posibles: **Propuesta** (pendiente de aprobación), **Aprobada** o **Rechazada**. La §16 las consolida y es su **única fuente**: no se copian a `decisiones.md`, que solo remite a esa tabla.

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
│   │   ├── main.ts             # solo cablea process, pino y listen reales con arrancar()
│   │   ├── arranque.ts         # arrancar(dependencias): config → base de datos → listen (§2.4)
│   │   ├── app.ts              # raíz de composición y middlewares (§2.2)
│   │   ├── config/             # esquema Zod del entorno (§2.4)
│   │   ├── plataforma/
│   │   │   ├── db/             # DataSource, parsers de pg, unidad de trabajo (§2.3)
│   │   │   ├── http/           # request ID, validar, autenticar, problem, rate limit
│   │   │   ├── logging/        # pino y enmascarado (§10)
│   │   │   ├── reloj/          # puerto Reloj (§2.1)
│   │   │   └── otp/            # puerto ProveedorOtp (§2.1)
│   │   ├── modulos/
│   │   │   ├── index.ts        # crearModulos(dependencias): routers reales (DD-08)
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
| PostgreSQL 17 | `docker compose` | `5433` en el host (configurable), `5432` dentro del contenedor |
| API | `tsx watch` en el host | `3000`, rutas bajo `/api` |
| Web | Vite en el host; proxy de `/api` a `:3000` (D-06) | `5173` |
| Móvil | `expo start` | Metro en `8081` |

**Puerto de PostgreSQL en el host.** `docker-compose.yml` publica el contenedor en `127.0.0.1:${POSTGRES_PORT:-5433}`. El valor por defecto es `5433` y no `5432` para no chocar con un PostgreSQL instalado en la máquina, algo común en Windows. Si `5433` también está ocupado, se cambia con `POSTGRES_PORT`, en el entorno del shell o en un `.env` de la raíz (Compose lo lee solo y git lo ignora), y se ajustan las URL de `api/.env`. Dentro del contenedor y en el *service container* de CI, PostgreSQL sigue en `5432`.

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
// RelojBaseDatos: SELECT clock_timestamp()   (se lee después de tomar los bloqueos, DD-36)
// RelojFijo:      devuelve un valor fijado por la prueba (23:59:59.999999, 00:00:00)

// plataforma/otp
interface ProveedorOtp {
  enviar(usuarioId: string, codigo: string): Promise<{ codigoSimulado?: string }>;
}
// ProveedorOtpSimulado:     solo se instancia con OTP_SIMULADO=true (D-07)
// ProveedorOtpNoConfigurado: se instancia con OTP_SIMULADO=false mientras no exista un proveedor real
```

**`ProveedorOtpNoConfigurado`.** Con `OTP_SIMULADO=false`, que es el caso de producción, `crearApp` recibe este proveedor, cuyo `enviar` siempre lanza. Es el punto de integración donde un despliegue conecta SMS o correo. El envío ocurre **después del `COMMIT`** (§6.5), así que no se hacen llamadas externas con bloqueos tomados. Si `enviar` falla, sea este proveedor o uno real, la API registra la causa en el log y responde `500 internal-error`. La transferencia queda `PENDIENTE_CONFIRMACION`: no mueve dinero, no consume el límite (que se valida al confirmar) y expira sola a los 5 minutos (§6.5).

> **DD-07 · Aprobada · Las marcas de tiempo de negocio salen del Reloj y viajan como texto**
> **Contexto:** D-15 pide un reloj inyectable para probar la medianoche, y D-11 prohíbe pasar `creado_en` por `Date`, que solo tiene milisegundos. Si `aplicada_en` saliera del reloj y `creado_en` de `DEFAULT now()`, en las pruebas habría dos relojes distintos.
> **Decisión:**
> - Toda marca de negocio (`transferencia.creado_en`, `transferencia.aplicada_en`, `asiento.creado_en`, `codigo_confirmacion.expira_en`) se escribe con el valor de `Reloj.ahora(tx)`, leído una vez por transacción. _Precisado por DD-36: se lee con `clock_timestamp()` **después** de tomar los bloqueos que protegen la decisión, no al inicio de la transacción._ Los `DEFAULT now()` quedan solo como red para tablas sin reglas de tiempo (auditoría). La sesión sí tiene una regla de tiempo (`expira_en <= ahora`) y también usa el `Reloj` (§5.3).
> - La conexión fija `TimeZone=UTC`. Los parsers de `pg` devuelven `timestamptz` (OID 1184) como **texto**, nunca como `Date`; las columnas de las entidades se tipan como `string`.
> - El formato del texto en la API se define en §4.1.
> **Motivo:** un solo origen del tiempo por transacción. La prueba de medianoche controla `aplicada_en` y `creado_en` a la vez, y los microsegundos del cursor nunca se truncan.

> **DD-08 · Aprobada · Capas con regla de imports y composición manual**
> **Contexto:** el enunciado pide capas o módulos y la lógica financiera fuera de los handlers, pero no dice cómo hacerlo verificable.
> **Opciones:** contenedor de inyección de dependencias (`tsyringe`, `inversify`) o composición manual en `app.ts`.
> **Decisión:** composición manual.
> - `crearApp(dependencias, modulos)` recibe en `dependencias` `Config`, `Logger` y `verificarBase` (desde T-API-03), y `DataSource`, `Reloj` y `ProveedorOtp` (desde T-API-04). Las pruebas pasan sus dobles.
> - Los routers reales los arma una sola función, `crearModulos(dependencias)` en `modulos/index.ts`: la composición vive en un solo lugar. `arrancar` llama `crearApp(dependencias, crearModulos(dependencias))`.
> - El segundo parámetro, `modulos`, es el punto donde las pruebas inyectan sus propios routers. `crearApp` los monta entre los middlewares 7 y 12 de §2.2. La separación de capas se verifica con `no-restricted-imports` en ESLint, que corre en CI.
> **Motivo:** son ocho módulos; un contenedor agrega decoradores y metadatos sin resolver nada que una función no resuelva. La regla de lint convierte "la lógica no vive en los handlers" en una verificación automática.

### 2.2 Ciclo de vida de una petición

Orden de los middlewares en `app.ts`:

| # | Middleware | Responsabilidad | Requisitos |
|---|---|---|---|
| 1 | `requestId` | Toma `X-Request-Id` entrante si tiene forma de UUID (8-4-4-4-12 hexadecimal, sin distinguir mayúsculas ni exigir versión) y lo pasa a minúsculas; cualquier otro texto se reemplaza por `crypto.randomUUID()`. Lo devuelve en el header de respuesta y abre el `AsyncLocalStorage` de §10.1 | RNF-12 |
| 2 | `pino-http` | Log JSON de entrada y salida con `reqId`, con `redact` (§10) | RNF-12 |
| 3 | `helmet` | Headers de seguridad | RNF-05 |
| 4 | `cors` | Solo `WEB_ORIGIN`, `credentials: true` | RNF-05 |
| 5 | `express.json({ limit: '16kb', strict: true })` | Cuerpos JSON acotados; un JSON mal formado responde `400` de validación (§7) | RNF-01 |
| 6 | `cookie-parser` | Lee la cookie de refresh | D-06 |
| 7 | `GET /api/health`, `/api/docs` | Sin autenticación | RNF-28 |
| 8 | `/api/auth/*` | Rate limit por ruta (§11) y `validar` | HU-1 |
| 9 | `autenticar` | Verifica el JWT y pone `req.usuarioId`; si falla, `401`. Fija `Cache-Control: no-store` en toda respuesta autenticada (DD-38) | R-1.11 |
| 10 | Rutas de módulos | `validar({ params, query, body, headers })` → controlador | — |
| 11 | `demoLatencia` | Solo en `POST /transferencias` y `POST /transferencias/{id}/confirmar`, después del caso de uso y antes de responder; solo si `DEMO_LATENCIA_MS > 0`. Un middleware posterior al router ya no corre cuando el controlador respondió, así que se monta en esas dos rutas, antes del controlador, y retrasa el envío envolviendo `res.json`: la espera queda después del `COMMIT` del caso de uso | D-17 |
| 12 | `noEncontrado` | Cualquier otra ruta → `404 not-found` | RNF-01 |
| 13 | `manejadorErrores` | Traduce a problem RFC 7807 (§7); registra la causa interna solo en el log | RNF-01 |

`validar` deja los datos ya transformados en `req.validado` y nunca deja pasar campos que el esquema no declara. Los esquemas de cuerpo usan `.strict()`.

> **DD-09 · Aprobada · El request ID viaja en el header, no en el cuerpo del problem**
> **Contexto:** es útil correlacionar un error con su línea de log, pero R-4.14 exige que la repetición con la misma llave devuelva **el mismo cuerpo** que la primera vez, incluidos los `422` de negocio.
> **Opciones:** (1) campo de extensión `requestId` en cada problem; (2) solo el header `X-Request-Id`.
> **Decisión:** el request ID va solo en el header `X-Request-Id` de todas las respuestas. Se acepta uno entrante con forma de UUID (8-4-4-4-12 hexadecimal, sin distinguir mayúsculas) para correlacionar con el cliente, y se devuelve y registra en minúsculas. Si no tiene esa forma, se genera uno nuevo con `crypto.randomUUID()`, para que el log no acepte texto arbitrario.
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
| — | Falla al **obtener la conexión** del pool (base no disponible: `ECONNREFUSED`, timeout de conexión, etc.) | `Reintentable` → `503 retryable` (§7.2). Ningún efecto quedó escrito. Si la falla ocurre después de obtener la conexión, aplica la fila de su `SQLSTATE` |

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

`config/index.ts` exporta `cargarConfiguracion(env)`, una función pura que recibe el objeto del entorno (no lee `process.env`) y lo valida con un esquema Zod. Devuelve `{ ok: true, config }` o `{ ok: false, variablesInvalidas }`, con **solo los nombres**, sin repetidos y en orden alfabético. `arrancar` (`arranque.ts`) la llama primero. Si falla, registra `{ variablesInvalidas }` (nunca los valores) y fija `process.exitCode = 1` sin conectar a la base ni abrir el puerto (RNF-15). `main.ts` solo cablea los objetos reales.

**Carga del `.env`.** Se hace con la opción `--env-file-if-exists=.env` de Node 24, sin `dotenv`. En producción las variables llegan del entorno.

**Variables ajenas.** El esquema no usa `.strict()`, porque `process.env` trae muchas variables que no son de la API. Toma solo las de esta tabla e ignora las demás.

La columna **`.env.example`** muestra los valores de `api/.env.example`. Solo `PORT`, `DB_POOL_MAX`, `DEMO_LATENCIA_MS`, `LOG_LEVEL` y `TRUST_PROXY` tienen un valor por defecto en el código, igual al de esa columna. **Las demás son obligatorias**, `NODE_ENV` incluida: si falta una, la API no arranca.

| Variable | Tipo y regla | `.env.example` | Fuente |
|---|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` | — |
| `PORT` | entero 1–65535 | `3000` | — |
| `DATABASE_URL` | URL con protocolo `postgres:` o `postgresql:`, rol `billetera_app` | URL local | §3.4 |
| `DB_POOL_MAX` | entero 1–50 | `10` | RNF-24 |
| `JWT_SECRETO` | texto de 32 bytes o más | vacío; se genera | §5 |
| `OTP_HMAC_SECRETO` | texto de 32 bytes o más, distinto de `JWT_SECRETO` | vacío; se genera | D-07 |
| `LIMITE_DIARIO_CENTAVOS` | entero seguro mayor que 0 | `5000000` | D-13 |
| `UMBRAL_CODIGO_CENTAVOS` | entero seguro mayor que 0, **menor** que el límite | `1000000` | D-13 |
| `FONDEO_BIENVENIDA_CENTAVOS` | entero seguro ≥ 0 | `1000000` | D-20 |
| `OTP_SIMULADO` | booleano | `true` | D-07 |
| `DEMO_LATENCIA_MS` | entero 0–30000 | `0` | D-17 |
| `WEB_ORIGIN` | solo un origen `http:` o `https:`, sin ruta, query, fragmento ni `/` final; `https:` en producción | `http://localhost:5173` | RNF-05, DD-24 |
| `LOG_LEVEL` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` | `info` | RNF-12 |
| `TRUST_PROXY` | entero ≥ 0 (saltos de proxy confiables) | `0` | §11 |

**`DATABASE_URL_MIGRACIONES`** (URL con el rol `billetera_owner`, §3.4) **no forma parte del esquema de la API**. Está en `api/.env.example`, pero solo la leen `migrar.ts` y `seed.ts` (T-API-04). Aunque esté presente, `config` no la contiene.

**Enteros.** El texto debe cumplir `^(0|[1-9][0-9]*)$`, después se convierte con `Number` y se exige `Number.isSafeInteger`, y al final se aplica el rango. Nunca se usa `z.coerce`, que aceptaría `"1.5"`, `"1e6"`, `" 10"` o `""` (este último como `0`).

**Secretos.** Los 32 bytes se miden con `Buffer.byteLength(valor, 'utf8')`, no con `.length`, que cuenta unidades UTF-16. En `api/.env.example` los secretos van vacíos, con el comando para generarlos (`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`). Así, copiar el ejemplo sin generarlos impide arrancar en vez de dejar un secreto conocido.

Reglas cruzadas con `superRefine`. Cada una reporta el nombre de la variable que la rompe:

- `UMBRAL_CODIGO_CENTAVOS < LIMITE_DIARIO_CENTAVOS` (RNF-15). Reporta `UMBRAL_CODIGO_CENTAVOS`.
- Si `NODE_ENV=production`: `OTP_SIMULADO=false`, `DEMO_LATENCIA_MS=0` y `FONDEO_BIENVENIDA_CENTAVOS=0` (RNF-15, R-6.17). Cada una se reporta por separado.
- Si `NODE_ENV=production`: `WEB_ORIGIN` con `https:`, porque la cookie del refresh lleva `Secure` (DD-24). Reporta `WEB_ORIGIN`.
- `OTP_HMAC_SECRETO ≠ JWT_SECRETO`. Reporta `OTP_HMAC_SECRETO`.

Los booleanos se leen como `'true'` o `'false'` exactos. Zod no convierte `'0'`, `'1'`, `'TRUE'` ni `'no'`, para que un valor mal escrito no active el OTP simulado por accidente.

**El registro de la configuración inválida.** Se escribe antes de conocer `LOG_LEVEL`, así que usa el nivel `info` de pino y el evento `error`.

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
| `correo` | `text` | `UNIQUE`; `CHECK (correo = lower(correo) AND length(correo) BETWEEN 3 AND 254)`; además las reglas de texto de DD-16 (`correo = btrim(correo)` y sin caracteres de control) |
| `hash_contrasena` | `text` | `CHECK (hash_contrasena LIKE '$argon2id$%')` |
| `creado_en` | `timestamptz` | `DEFAULT now()` |

El esquema Zod normaliza el correo (`trim` y minúsculas) antes de llegar a la base; el `CHECK` garantiza que nadie se salte esa normalización y que `UNIQUE (correo)` no deje pasar `Ana@x.mx` y `ana@x.mx` (R-1.4).

#### `cuenta`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | `PK DEFAULT gen_random_uuid()` (DD-11) |
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
| `id` | `uuid` | `PK DEFAULT gen_random_uuid()` (DD-11) |
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
| `id` | `uuid` | `PK DEFAULT gen_random_uuid()` (DD-11) |
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
| `id` | `uuid` | `PK DEFAULT gen_random_uuid()` (DD-11) |
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
>
> **Unidad de longitud.** Las longitudes se cuentan en **code points** después de normalizar a NFC, igual que `char_length` de PostgreSQL y `maxLength` de JSON Schema; no en unidades UTF-16. Un emoji simple (`😀`) cuenta 1. Un emoji compuesto con ZWJ (una familia `👨‍👩‍👧`) cuenta un code point por cada emoji y cada ZWJ que lo forman, aunque se vea como un solo símbolo.
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

**Nombres.** Los nombres de la tabla anterior son los de las **funciones**. Cada trigger se crea con la convención `tg_<tabla>_<accion>` de §7.3:

| Función | Trigger |
|---|---|
| `aplicar_asiento()` | `tg_asiento_aplica_saldo` |
| `asiento_inmutable()` | `tg_asiento_inmutable` |
| `cuenta_protegida()` | `tg_cuenta_protegida` |
| `validar_beneficiario()` | `tg_beneficiario_validar` |
| `validar_transferencia()` | `tg_transferencia_validar` |
| `transferencia_transicion()` | `tg_transferencia_transicion` |
| `transferencia_cuadra()` → `comprobar_transferencia(NEW.id)` | `tg_transferencia_cuadra` |
| `asiento_cuadra()` → `comprobar_transferencia(NEW.transferencia_id)` | `tg_asiento_cuadra` |
| `codigo_protegido()` | `tg_codigo_confirmacion_protegido` |
| `auditoria_inmutable()` | `tg_evento_auditoria_inmutable` |

Cada `RAISE EXCEPTION` de estas funciones lleva `USING ERRCODE = 'P0001', CONSTRAINT = '<nombre del trigger>'`, de modo que el error llega a la API con su `constraint`, igual que un `UNIQUE` o un `CHECK` (§7.3, DD-35). El texto del mensaje empieza con el nombre de la función (`'cuenta_protegida: …'`) solo para leer el log; nadie decide por él. `comprobar_transferencia` reporta el trigger que la llamó (`tg_transferencia_cuadra` o `tg_asiento_cuadra`), que recibe como segundo parámetro.

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
> | `APLICADA` sin asientos | `tg_transferencia_cuadra`, al hacer `COMMIT` |
> | `APLICADA` con un solo asiento, o con dos que no suman cero | `tg_transferencia_cuadra`, al hacer `COMMIT` |
> | Dos asientos que suman cero pero invertidos (abono en origen, cargo en destino) | `tg_transferencia_cuadra`, al hacer `COMMIT` |
> | Asientos con tipo de movimiento equivocado (`ENVIO` en un `TRASPASO`) | `tg_transferencia_cuadra`, al hacer `COMMIT` |
> | Asientos con `creado_en` distinto de `aplicada_en` | `tg_transferencia_cuadra`, al hacer `COMMIT` |
> | Asientos en una transferencia `RECHAZADA` o `PENDIENTE_CONFIRMACION` ya confirmada | `tg_asiento_cuadra`, al hacer `COMMIT` |
>
> **Qué trigger reporta.** `tg_transferencia_cuadra` y `tg_asiento_cuadra` llaman a la misma `comprobar_transferencia`, y los triggers diferidos corren al `COMMIT` en el orden de sus eventos. Cuando la transferencia se inserta en la misma transacción que sus asientos, su evento es el primero y el que reporta es `tg_transferencia_cuadra`. `tg_asiento_cuadra` reporta cuando se agregan asientos a una transferencia ya confirmada. Cada prueba espera el `constraint` exacto que corresponde a su caso.

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

La parte resumida como "simétrico" es la misma comprobación para el abono: un asiento en `t.cuenta_destino_id` por `+t.monto_centavos`, con `creado_en = t.aplicada_en` y `tipo_movimiento` igual a `DEPOSITO` (`FONDEO`), `RECEPCION` (`TERCERO`) o `TRASPASO_ENTRADA` (`TRASPASO`); si no existe, `'… sin abono correcto'`. Como hay exactamente 2 asientos, un cargo correcto y un abono correcto agotan los dos.

La firma completa es `comprobar_transferencia(p_id uuid, p_trigger text)`. `p_trigger` es el nombre del trigger que la llama (`tg_transferencia_cuadra` o `tg_asiento_cuadra`), y cada `RAISE EXCEPTION` lo usa en `USING ERRCODE = 'P0001', CONSTRAINT = p_trigger` (§7.3).

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

**Qué revoca y qué concede la migración `Permisos`.**

- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC` y lo mismo para las secuencias. Después, los `GRANT` de la tabla anterior.
- `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`. Después, `GRANT EXECUTE` a `billetera_app` **solo** sobre dos funciones, porque PostgreSQL revisa `EXECUTE` al evaluar un `CHECK` y al llamar una función desde otra:
  - `clabe_valida(text)`, que evalúan los `CHECK` de `cuenta` y `beneficiario`;
  - `comprobar_transferencia(uuid, text)`, que llaman los triggers diferidos con los permisos de quien inserta.
- Las funciones de trigger quedan sin `EXECUTE` para `billetera_app`: disparar un trigger no lo exige.
- Las columnas `GENERATED ALWAYS AS IDENTITY` (`asiento.id`, `evento_auditoria.id`) no necesitan permiso sobre su secuencia.
- Una migración posterior que cree una función repite el `REVOKE EXECUTE … FROM PUBLIC` y concede lo que haga falta, igual que con las tablas.
- **Prueba de humo como `billetera_app`:** registra un usuario con su cuenta y aplica un `FONDEO` completo. Comprueba que los permisos no rompen el camino real.

**`SECURITY DEFINER`.** `aplicar_asiento` es hoy la única función `SECURITY DEFINER` y la única que actualiza `cuenta.saldo_centavos`. Corre con los permisos de `billetera_owner`. Es una función de trigger, así que no se puede invocar directamente. Además, `billetera_app` no tiene `EXECUTE` sobre ella: una llamada directa falla con `42501` antes de llegar a la función. Una prueba lo verifica.

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

**En la base.** `clabe_valida(text) RETURNS boolean IMMUTABLE` implementa el mismo algoritmo en SQL y lo usan los `CHECK` de `cuenta` y `beneficiario`. Devuelve `false` para cualquier texto que no sean exactamente 18 dígitos ASCII: un `CASE` evita convertir letras o espacios a entero. Con `NULL` devuelve `NULL` (`STRICT`), y las columnas que la usan son `NOT NULL`. Una prueba compara `clabe_valida` con `validarClabe` de `shared` sobre 10,000 CLABEs aleatorias y los casos borde (dígito 0, suma múltiplo de 10).

> **DD-19 · Aprobada · Generación de CLABE aleatoria y validación también en la base**
> **Contexto:** D-19 fija banco ficticio, plaza, cuenta y dígito verificador, pero no cómo se elige el número de cuenta.
> **Opciones:** (1) consecutivo desde una secuencia; (2) aleatorio con reintento.
> **Decisión:** los 11 dígitos son aleatorios. La cuenta se inserta con `INSERT … ON CONFLICT (clabe) DO NOTHING RETURNING id`; si no devuelve fila, se genera otra CLABE, hasta 5 veces. La base valida el dígito verificador con `CHECK (clabe_valida(clabe))`.
> **Motivo:** un consecutivo revela cuántas cuentas hay y hace adivinables las CLABEs vecinas, que es justo el oráculo que el rate limit de D-19 intenta frenar. `ON CONFLICT DO NOTHING` evita un `23505`, que abortaría la transacción del registro. Con 10¹¹ combinaciones, una colisión es improbable; el reintento cubre el caso sin costo.

### 3.7 Seed

`npm run db:seed` corre `api/src/scripts/seed.ts`. **Primero vacía** las tablas de datos con `TRUNCATE … CASCADE` como `billetera_owner`, conservando Fondeo, y después genera los datos con una semilla fija: dos corridas dan el mismo resultado. "El mismo resultado" son los mismos correos, CLABEs, saldos por cuenta, beneficiarios y conteos por tabla. Los uuid que genera la base (`gen_random_uuid()`) pueden cambiar entre corridas.

**Guarda.** Antes de tocar nada, el seed se niega a correr y termina con código distinto de 0 si `NODE_ENV=production`, o si `DATABASE_URL` o `DATABASE_URL_MIGRACIONES` apuntan a la base `billetera_test`: esa base es de las pruebas, y su `globalSetup` la reconstruye (§14.2). Toma la configuración con el mismo esquema de §2.4, más `DATABASE_URL_MIGRACIONES`.

**Fase 1: usuarios demo, por los casos de uso reales.** Se crean llamando a `registrar`, `fondear` y `crearBeneficiario` de la API con el `DataSource` de `billetera_app`: el mismo camino, los mismos triggers y la misma auditoría que en producción.

| Usuario | Saldo final exacto de `Principal` después del seed | Para demostrar en el video |
|---|---|---|
| `ana@demo.mx` | `8000000` ($80,000.00) | Transferencia normal (≤ $10,000), con código (> $10,000) y, después de esas dos, límite diario excedido. Necesita saldo mayor que el límite (D-13) |
| `beto@demo.mx` | `50000` ($500.00) | Saldo insuficiente |

- Cada uno tiene registrado al otro como beneficiario, para que la app móvil pueda transferir desde el primer momento (R-4.26).
- La contraseña demo cumple la política de §5 y va en el README.
- Los saldos llegan por transferencias `FONDEO` (D-13, D-20, RNF-27): un solo depósito por usuario, por el monto de la tabla. El seed arma `registrar` con un fondeo de bienvenida de 0, sea cual sea `FONDEO_BIENVENIDA_CENTAVOS`. Si no, con el valor de desarrollo (`1000000`), Beto tendría $10,500.00, y para mostrar el saldo insuficiente habría que transferir más que el umbral del código.
- Las CLABEs demo son fijas: el seed inyecta en `registrar` un `generarClabe` determinista (`999180` + un número de cuenta fijo + dígito verificador), en lugar del aleatorio de DD-19. Así no cambian entre corridas y pueden ir en el README.

**Fase 2: volumen, por SQL masivo.** Para el `EXPLAIN ANALYZE` (RNF-14):

- 200 usuarios sintéticos, con sus dos cuentas, y un usuario `carga@demo.mx`.
- Un fondeo inicial por cuenta, seguido de unas 60,000 transferencias `TERCERO` y `TRASPASO` entre esas cuentas, con montos pequeños frente a los fondeos para que ningún saldo quede negativo. Resultado: **120,000 asientos o más** en total.
- **Cuenta caliente:** la cuenta `Principal` de `carga@demo.mx` participa en **al menos 30,000** de esas transferencias, es decir, decenas de miles de movimientos en una sola cuenta, con los cinco tipos de movimiento. Es la cuenta que mide el `EXPLAIN ANALYZE` de §8.5. Sin ella, 120,000 asientos repartidos en 400 cuentas darían unos 300 por cuenta, y cualquier plan parecería rápido.
- Fechas repartidas en los últimos 180 días, con microsegundos aleatorios. Los dos asientos de cada transferencia comparten el instante (DD-17).
- **Beneficiarios del volumen.** Toda `TERCERO` lleva su `beneficiario_id`, como las que crea la API (§6.1): sin él, un `ENVIO` no tendría `etiqueta` en el historial (§8.1). El seed crea por SQL los beneficiarios necesarios: `carga@demo.mx` hacia cada usuario sintético, y cada sintético hacia `carga@demo.mx` y hacia los 5 sintéticos siguientes.
- **Semilla fija.** Los uuid, las CLABEs, las llaves de idempotencia, los montos y las fechas del volumen salen de `md5(semilla ‖ n)`, no de `random()`, así que no dependen del orden en que PostgreSQL evalúe las filas. Los usuarios sintéticos tienen un `hash_contrasena` con formato argon2id que no corresponde a ninguna contraseña: no se puede iniciar sesión con ellos.
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

- **Orden de `GET /cuentas`:** `Principal` y después `Ahorro`, siempre en ese orden.
- **`GET /transferencias/{id}` puede escribir.** Si la transferencia está pendiente y su código venció, la deja `RECHAZADA/CODIGO_EXPIRADO` antes de responder (D-14, R-6.12). Es un `GET` idempotente en su efecto: dos llamadas dejan el mismo estado. Por eso también puede responder `503`.
- **Confirmar es idempotente sin llave.** El `id` de la transferencia ya identifica la operación: confirmar una aplicada devuelve el mismo `201`, y confirmar una rechazada devuelve el mismo `422` (R-6.13).
- **Respuestas de `POST /transferencias` y su repetición.** Las tres salen de `respuestaDeTransferencia(fila)` (§2.1, §6.2), con la excepción de DD-25.
- **Valores anticipados.** `openapi.yaml` ya fija dos valores que se justifican en el bloque D: la longitud de la contraseña (12 a 128 caracteres, §5) y los campos del comprobante (§6.6). Si esas secciones los cambian, el contrato se actualiza en el mismo commit.

> **DD-24 · Aprobada · Transporte del refresh token entre web y móvil**
> **Contexto:** D-06 dice que la API acepta el refresh por cookie (web) o por cuerpo (móvil) y que nunca le devuelve el refresh a la web en el cuerpo, pero no dice cómo sabe la API qué cliente es al iniciar sesión, ni si el registro abre sesión.
> **Opciones:** (1) detectar el cliente por `User-Agent`; (2) un header propio; (3) un campo explícito en el login.
> **Decisión:**
> - `POST /auth/login` recibe `cliente: "web" | "movil"`. Con `web`, el refresh va **solo** en la cookie `billetera_refresh`; con `movil`, solo en el cuerpo.
> - `POST /auth/refresh` y `POST /auth/logout` aceptan el refresh por cookie **o** por cuerpo. Si llegan los dos, los dos responden `400 validation-error` con el campo `body.refreshToken`; si no llega ninguno, el refresh responde ese mismo `400` y el logout responde `204`. **La respuesta usa el mismo canal por el que llegó el refresh**, sin importar lo que diga el cliente: un refresh por cookie nunca produce un refresh en el cuerpo.
> - Con cookie, el refresh y el logout exigen `X-Requested-With: fetch` (R-1.16). Si falta o trae otro valor, responden `400 validation-error` con el campo `headers.x-requested-with`, sin buscar ni tocar la sesión. Es un error de forma de la petición, como cualquier otro header inválido, y no se confunde con el `401` de un refresh inválido.
> - El registro **no** abre sesión: responde `201` con `{ id, correo }`, y el cliente llama después a `/auth/login`.
> - El logout responde `204` aunque el refresh ya no sea válido, y siempre borra la cookie.
> **Motivo:** el canal de respuesta queda atado al canal de entrada, así que un XSS en la web no puede convertir la cookie en un refresh legible. Que el registro no abra sesión deja un solo lugar donde se emiten tokens y se escribe la cookie.

> **DD-25 · Aprobada · La repetición de un `202` no incluye `codigoSimulado`**
> **Contexto:** R-4.14 exige que la repetición con la misma llave devuelva el mismo cuerpo, incluidas las pendientes "sin generar un código nuevo". R-6.17 pone el código simulado en `codigoSimulado` de la respuesta `202`. Pero R-6.16 y D-07 prohíben guardar el código en claro: solo se guarda su HMAC, así que la repetición no puede reproducirlo.
> **Opciones:** (1) guardar el código cifrado solo en modo simulado; (2) mandarlo en un header en lugar del cuerpo; (3) omitirlo en la repetición.
> **Decisión:** la opción 3. La repetición de un `202` es idéntica a la primera respuesta salvo por `codigoSimulado`, que solo aparece la primera vez. Es la única excepción a R-4.14, y solo existe con `OTP_SIMULADO=true`, que nunca está activo en producción (RNF-15). La prueba de idempotencia compara los cuerpos sin ese campo y verifica aparte que la repetición no lo trae.
> **Motivo:** la opción 1 crea justo el dato que R-6.16 prohíbe, aunque sea en desarrollo. La opción 2 contradice R-6.17, que pide el campo en la respuesta. En producción el código llega por otro canal (SMS o correo), así que la repetición se comporta igual que un proveedor real: el usuario ya recibió el código.
> **Recuperar el código simulado en los clientes.** Si el usuario recarga la web o reabre la app en la pantalla del código, ninguna respuesta vuelve a traer `codigoSimulado`: ni el reenvío con la misma llave de un intento que seguía en fase `creacion` (R-4.25, R-4.31), que devuelve el `202` sin el campo, ni el `GET /transferencias/{id}` con el que se reanuda la fase `confirmacion` sin código en vuelo (§13.2, "Reanudación"). En modo simulado no habría otro canal para recibirlo. Para eso:
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

1. `npm run gen:tipos` ejecuta `openapi-typescript specs/openapi.yaml -o packages/shared/src/api/openapi.ts --root-types --root-types-no-schema-prefix`.
2. El archivo generado **se versiona**. En CI, un paso lo regenera y falla si `git diff --exit-code` encuentra diferencias: el contrato y los tipos nunca se desincronizan.
3. Con `--root-types --root-types-no-schema-prefix`, el generador emite un alias legible por esquema (`type Cuenta = components['schemas']['Cuenta']`, `type Comprobante = …`), sin escribirlos a mano, y `shared` los reexporta. Las respuestas, los parámetros y los headers llevan prefijo (`ResponseNoAutenticado`, `ParameterCuentaId`, `HeaderRetryAfter`).
4. La API tipa las respuestas de sus controladores con esos alias, y web y móvil tipan su cliente `fetch` con `paths`.

**Esquemas Zod y contrato.** Los esquemas Zod de entrada viven en `shared/src/esquemas` y se escriben a mano, porque llevan refinamientos que JSON Schema no expresa (dígito verificador de la CLABE, lista de contraseñas comunes, `desde` ≤ `hasta`). Para que no se desvíen del contrato:

- Una prueba de tipos (`expectTypeOf` de Vitest) verifica, para cada cuerpo de entrada, que `z.input<typeof esquema>` y `z.output<typeof esquema>` extienden al tipo generado y el tipo generado extiende a ambos. En la query del historial solo se verifica que `z.output` extiende al tipo generado: el valor por defecto de `limite` lo vuelve obligatorio en la salida.
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

**Política** (cierra el pendiente §12.1 de `requirements.md`). La valida el esquema Zod de `shared` en web, móvil y API:

| Regla | Valor |
|---|---|
| Longitud | 12 a 128 caracteres (code points, DD-16), contados después de normalizar a Unicode NFC |
| Composición | Sin reglas de mayúsculas, números ni símbolos |
| Prohibidas | La contraseña igual al correo, o igual a la parte local del correo, sin distinguir mayúsculas; y las de la lista de contraseñas comunes de `shared` (abajo) |
| Espacios | Permitidos, sin recortar: la contraseña se usa tal como se escribió |
| Caracteres de control | No se revisan: la contraseña no es un texto que se muestre ni se registre; solo se normaliza a NFC |

El error de cualquiera de estas reglas se reporta en el campo `contrasena`. El login no aplica la política: solo exige de 1 a 128 caracteres en NFC, para que una contraseña creada con una política anterior siga funcionando.

**Lista de contraseñas comunes.** Vive en `packages/shared/src/esquemas/contrasenas-comunes.ts` y la usan web, móvil y API a través del esquema de registro.

- **Fuente:** SecLists (licencia MIT), archivo `Passwords/Common-Credentials/10-million-password-list-top-1000000.txt` en el commit `2d5dc7504a40962c53f932a6d9d5ece4b213dfc6`, el último en que existe con ese nombre (el commit `4ff3ff8` lo borró en favor de `xato-net-10-million-passwords-1000000.txt`, cuyo contenido no es idéntico).
  - URL: `https://raw.githubusercontent.com/danielmiessler/SecLists/2d5dc7504a40962c53f932a6d9d5ece4b213dfc6/Passwords/Common-Credentials/10-million-password-list-top-1000000.txt`
  - sha256: `1843265e3860a97f417b2236dfa332a0d93b38efef0fee1a0a291fdba5458478`
- **Filtro:** en el orden de la fuente, se normaliza cada entrada a NFC, se descartan las de menos de 12 code points, se pasan a minúsculas y se toman las primeras **1,000 distintas**. Ninguna de las 1,000 primeras entradas de la fuente tiene 12 caracteres o más: la regla de longitud ya las rechaza todas, así que una lista sin filtrar no aportaría nada. Por eso se filtra antes de cortar.
- **Formato:** las entradas se guardan ya normalizadas (NFC y minúsculas). El esquema las carga en un `Set` y compara `lista.has(contrasena.normalize('NFC').toLowerCase())`.
- **Reproducible:** `node scripts/generar-contrasenas-comunes.mjs <ruta-del-txt>` verifica el sha256 de la entrada, falla si no coincide y escribe el archivo `.ts`. El `.txt` no se versiona; el `.ts` generado sí.

**Hash.** argon2id con `memoryCost = 19456` KiB (19 MiB), `timeCost = 2` y `parallelism = 1`, el mínimo que recomienda OWASP para argon2id. El hash en formato PHC (`$argon2id$v=19$m=19456,t=2,p=1$…`) lleva sus parámetros, así que se pueden subir en el futuro sin romper los hashes existentes.

**Login sin revelar el correo (R-1.7).** Si el correo no existe, la API verifica igual la contraseña contra un hash ficticio calculado al arrancar con los mismos parámetros. Así, un correo inexistente y una contraseña incorrecta tardan lo mismo y responden el mismo `401 credenciales-invalidas` (§7.2).

> **DD-28 · Aprobada · Política de contraseñas y parámetros de argon2id (cierra §12.1)**
> **Contexto:** RNF-03 pide argon2 o bcrypt, y R-1.5 pide validar la contraseña, pero no hay política.
> **Opciones:**
> - Política: (1) reglas de composición clásicas (mayúscula, número, símbolo); (2) longitud mínima y lista de contraseñas comunes, como recomienda NIST SP 800-63B.
> - Ubicación de la lista: (a) en `shared`, compartida por web, móvil y API; (b) solo en `api`.
>
> **Decisión:** la opción 2, con los valores de la tabla, y la lista en `shared` (opción a). Son las primeras 1,000 distintas de 12 o más caracteres de SecLists, con la fuente fijada por commit y sha256 (arriba). argon2id con los parámetros mínimos de OWASP. Normalización NFC antes de validar y de calcular el hash. Máximo de 128 caracteres. Hash ficticio en el login para igualar tiempos.
> **Motivo:** las reglas de composición producen contraseñas predecibles (`Contraseña1!`) sin añadir entropía real; la longitud sí la añade. NFC evita que la misma contraseña escrita en dos teclados (un acento compuesto o precompuesto) produzca hashes distintos. El tope de 128 acota el costo de cada hash, para que no se pueda saturar la API con contraseñas enormes. Sin el hash ficticio, el tiempo de respuesta revelaría qué correos existen, aunque el cuerpo sea idéntico. La lista va en `shared` porque RNF-18 pide validaciones compartidas: así el usuario ve el rechazo en el formulario, no hasta el `400` de la API.
> **Costo:** el archivo generado pesa unos 19 kB (8 kB con gzip) más en el bundle de web y móvil. La lista es pública, así que tenerla en el cliente no expone nada.
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

**Login.** Crea una fila en `sesion` con `familia_id` nueva, `creado_en = ahora` y `expira_en = ahora + 7 días`.

**El instante de la sesión.** En login, rotación y logout, `ahora` es `Reloj.ahora(tx)` (DD-07), leído después del `SELECT … FOR UPDATE` cuando lo hay. Con ese valor se compara `expira_en <= ahora` y se escriben `creado_en`, `usada_en` y `revocada_en`. Así las pruebas controlan el vencimiento de la familia con `RelojFijo`, sin escribir en la base como dueño. El `Max-Age` de la cookie son los segundos enteros de `expira_en − ahora`, calculados en SQL.

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
| `POST /auth/refresh` y `/auth/logout` por cookie | `SameSite=Strict`, más el header `X-Requested-With: fetch`, que obliga a un *preflight* CORS desde otro origen (R-1.16, RNF-05). Sin él, `400 validation-error` en `headers.x-requested-with` (DD-24) |
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
    T --> L1[Bloquea usuario]
    L1 --> L2{¿La llave apareció<br/>mientras esperaba?}
    L2 -- sí --> R
    L2 -- no --> L3[Bloquea cuentas por id ascendente<br/>ahora = Reloj, DD-36]
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
   1. Bloquea al usuario: `SELECT id FROM usuario WHERE id = $1 FOR UPDATE` (D-04).
   2. **Vuelve a buscar la llave.** Dos peticiones con la misma llave son del mismo usuario, así que el bloqueo del paso anterior las pone en fila. La segunda encuentra aquí la fila que confirmó la primera y responde con ella (R-4.16).
   3. Bloquea las dos cuentas: `SELECT … FROM cuenta WHERE id = ANY($1) ORDER BY id FOR UPDATE` (D-12).
   4. `ahora = Reloj.ahora(tx)`, leído **después** de tener las cuentas (DD-36).
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
| Dos peticiones simultáneas con la misma llave | El bloqueo del usuario las pone en fila. La segunda encuentra la fila en el paso 3.2 y devuelve lo mismo | R-4.16 |
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
| `confirmacion` | Lo anterior, más `transferenciaId`, `codigoExpiraEn`, `codigoSimulado` si vino (DD-25) y, mientras la petición está en vuelo, el código capturado | `POST /transferencias/{id}/confirmar` con el mismo código; si no había código en vuelo, `GET /transferencias/{id}`. **Nunca** la creación | Confirmar es idempotente por el id de la transferencia (D-07, R-6.13) |

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

**Generación**, dentro de la transacción de creación (§6.1, paso 3.7):

- `codigo = crypto.randomInt(0, 1_000_000)`, con ceros a la izquierda hasta 6 dígitos.
- Se guarda `codigo_hmac = HMAC-SHA256(OTP_HMAC_SECRETO, transferenciaId + ":" + codigo)` en hexadecimal, con `expira_en = ahora + 5 minutos` (D-07).
- Después de confirmar la transacción, `ProveedorOtp.enviar` entrega el código. La implementación simulada lo devuelve para `codigoSimulado` (R-6.17).

El código nunca se guarda en claro ni se escribe en los logs (R-6.16): `pino` censura `codigo` y `codigoSimulado` en cualquier ruta (§10), y los cuerpos de las peticiones no se registran.

**Confirmación** (`POST /transferencias/{id}/confirmar`), en una sola `conTransaccion`:

1. Bloquea al usuario.
2. Bloquea la transferencia (`WHERE id = $1 AND usuario_id = $2 FOR UPDATE`) y su código. Si no existe o es ajena: `404` (R-6.14). Después lee `ahora = Reloj.ahora(tx)` para decidir si venció.
3. Según su estado:

| Estado y condición | Acción | Respuesta |
|---|---|---|
| `APLICADA` | Ninguna; no consume intentos | El mismo `201` con el mismo comprobante (R-6.13) |
| `RECHAZADA` | Ninguna | El mismo `422` de su rechazo |
| Pendiente y `expira_en <= ahora` | Pasa a `RECHAZADA/CODIGO_EXPIRADO` y audita | `422 codigo-expirado` (R-6.12) |
| Pendiente, código incorrecto, `intentos + 1 < 3` | `intentos + 1` y evento `codigo-incorrecto` | `422 codigo-incorrecto` con `intentosRestantes` |
| Pendiente, código incorrecto, `intentos + 1 = 3` | `intentos = 3`, evento `codigo-incorrecto`, `RECHAZADA/CODIGO_AGOTADO` y su evento | `422 codigo-agotado` (R-6.11) |
| Pendiente y código correcto | Bloquea las cuentas por `id` ascendente, **vuelve a leer `ahora`** (DD-36) y con ese valor valida saldo y límite y escribe `aplicada_en` y los asientos (§6.1, pasos 3.4 a 3.6) | `201`, o `422` por saldo o límite (R-6.10) |

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
| uuid (ids e `Idempotency-Key`) | 8-4-4-4-12 hexadecimal, sin exigir versión, normalizado a minúsculas; igual que `format: uuid` |

Todos los textos se recortan, se normalizan a NFC y no admiten caracteres de control. Las longitudes se cuentan en code points después de normalizar a NFC (DD-16).

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
- **`title` es fijo por `type`** (columna `title` de §7.2), y **`detail` es un texto fijo en español** escrito para el usuario: el de `mensajeDeProblema(type)` de `shared` (§13.1), el mismo que muestran web y móvil. Así, los textos tienen una sola fuente. Ninguno de los dos se arma con mensajes de excepciones ni de PostgreSQL.
- Las extensiones son solo las de DD-23: `errores`, `motivo`, `transferenciaId` e `intentosRestantes`.
- Los clientes deciden por `type`, nunca por `detail`.

### 7.2 Catálogo

`title` de cada `type`, en el orden de la tabla siguiente: `validation-error` "Datos inválidos", `invalid-cursor` "Cursor inválido", `unauthorized` "No autenticado", `credenciales-invalidas` "Credenciales inválidas", `not-found` "No encontrado", `correo-ya-registrado` "Correo ya registrado", `beneficiario-duplicado` "Beneficiario duplicado", `clabe-not-found` "CLABE no encontrada", `misma-cuenta` "Misma cuenta", `idempotency-key-reused` "Llave de idempotencia reutilizada", `saldo-insuficiente` "Saldo insuficiente", `limite-diario-excedido` "Límite diario excedido", `codigo-incorrecto` "Código incorrecto", `codigo-agotado` "Código agotado", `codigo-expirado` "Código expirado", `too-many-requests` "Demasiadas peticiones", `retryable` "Servicio ocupado", `internal-error` "Error interno".

| `type` | HTTP | Cuándo | Extensiones | Requisitos |
|---|---|---|---|---|
| `validation-error` | 400 | Falla un esquema Zod, el JSON está mal formado, el cuerpo pasa de 16 kB, `desde > hasta`, o el `cursor` viene vacío o tiene más de 512 caracteres | `errores` | R-1.5, R-3.3, R-3.4, R-4.8, R-4.9, R-4.13, R-5.2, R-5.5, R-5.7, R-B1.5 |
| `invalid-cursor` | 400 | Cursor que no se puede decodificar o generado con otros filtros | — | R-5.7 |
| `unauthorized` | 401 | Sin access válido; refresh inválido, vencido, revocado o reusado | — | R-1.9 a R-1.11 |
| `credenciales-invalidas` | 401 | Login con correo inexistente o contraseña incorrecta; el mismo problem en los dos casos | — | R-1.7 |
| `not-found` | 404 | Recurso inexistente o ajeno; ruta inexistente | — | R-2.4, R-3.11, R-4.6, R-4.10, R-5.10, R-6.14, R-B1.4 |
| `correo-ya-registrado` | 409 | Registro con un correo existente (concesión de DD-23) | — | R-1.4 |
| `beneficiario-duplicado` | 409 | Misma CLABE o mismo alias, sin distinguir mayúsculas, entre los beneficiarios del usuario | `errores` con un solo elemento, campo `body.clabe` o `body.alias` (el prefijo de §7.3) | R-3.7 |
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
| `23505` en `uq_beneficiario_usuario_clabe` o `uq_beneficiario_usuario_alias` | `constraint` | `409 beneficiario-duplicado` con `errores: [{ campo: 'body.clabe' }]` o `[{ campo: 'body.alias' }]`, según la restricción |
| `23505` en `uq_transferencia_usuario_llave` | `constraint` | Lo resuelve el caso de uso (§6.2); nunca llega aquí |
| `55P03`, `57014`, `40P01` agotado, conexión rechazada | `code` de `pg` | `503 retryable` (DD-10) |
| Cualquier otro error | — | `500 internal-error` |

**Las restricciones tienen nombre.** Cada `UNIQUE`, `CHECK`, FK y trigger se crea con nombre explícito (`pk_<tabla>`, `uq_<tabla>_<columnas>`, `ck_<tabla>_<regla>`, `fk_<tabla>_<columna>`, `tg_<tabla>_<accion>`; los índices no únicos, `ix_<tabla>_<columnas>`). Las funciones de los triggers conservan los nombres de §3.3. El manejador decide por el **nombre** de la restricción, nunca por el texto del mensaje de PostgreSQL. Esos nombres no salen de la API.

**Los triggers reportan su nombre como `constraint`.** Cada `RAISE EXCEPTION` de una función de trigger lleva `USING ERRCODE = 'P0001', CONSTRAINT = 'tg_<tabla>_<accion>'`. Así, el error de `pg` trae `code = 'P0001'` y `constraint` con el nombre del trigger, y el manejador lo trata igual que un `CHECK` o un `UNIQUE`. El prefijo con el nombre de la función en el texto solo sirve para leer el log.

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
> - Los triggers también: cada `RAISE EXCEPTION` lleva `USING ERRCODE = 'P0001', CONSTRAINT = '<nombre del trigger>'`, para que un rechazo de la base llegue con su `constraint` como un `UNIQUE` o un `CHECK`. Ningún error se reconoce por el texto de su mensaje.
> - `title` y `detail` son textos fijos por `type`.
> - JSON mal formado y cuerpo demasiado grande responden `400 validation-error`, sin `413` ni `type` propios.
> - Un deadlock que persiste después de 3 reintentos responde `503 retryable`.
> **Motivo:** decidir por el texto del mensaje rompe con cualquier cambio de versión o de idioma de PostgreSQL. Con textos fijos, ningún dato interno puede viajar por error dentro de `detail`. Mantener el catálogo en 18 `type` hace que cada cliente lo cubra completo con un mapa de textos.

---

## 8. Historial de movimientos

### 8.1 Consulta

`GET /cuentas/{cuentaId}/movimientos` corre en el caso de uso `listarMovimientos`, sin transacción de escritura:

1. Verifica que la cuenta sea del usuario. Si no, `404` (R-5.10).
2. Valida los parámetros con Zod: `limite` de 1 a 100 (20 por defecto), `desde <= hasta`, `tipo` dentro de los cinco tipos de usuario (R-5.2, R-5.5, R-5.6).
3. Decodifica el cursor, si viene (§8.3).
4. Ejecuta la consulta con `LIMIT limite + 1`. La fila de más indica si hay página siguiente (D-11).

```sql
SELECT a.id, a.tipo_movimiento, a.monto_centavos, a.creado_en,
       t.id AS transferencia_id, t.concepto, t.referencia,
       b.alias   AS beneficiario_alias,
       co.nombre AS contraparte_nombre,
       co.clabe  AS contraparte_clabe
  FROM asiento a
  JOIN transferencia t ON t.id = a.transferencia_id
  JOIN cuenta co       ON co.id = CASE WHEN a.monto_centavos < 0
                                       THEN t.cuenta_destino_id
                                       ELSE t.cuenta_origen_id END
  LEFT JOIN beneficiario b ON b.id = t.beneficiario_id AND a.monto_centavos < 0
 WHERE a.cuenta_id = $1
   -- fragmentos opcionales, solo si el filtro viene (DD-37):
   AND a.tipo_movimiento = $2                                -- tipo
   AND a.creado_en >= $3 AND a.creado_en < $4                -- desde / hasta (§8.4)
   AND (a.creado_en, a.id) < ($5::timestamptz, $6::bigint)   -- cursor (§8.3)
 ORDER BY a.creado_en DESC, a.id DESC
 LIMIT $7;
```

- **Sin rechazadas ni pendientes** (R-5.8): no tienen asientos (DD-17), así que no hace falta filtrarlas.
- **Los `JOIN` son por llave primaria** y solo se hacen para las `limite + 1` filas que devuelve el índice.
- **Depósitos** (R-5.9): el movimiento `DEPOSITO` se muestra como "Depósito". El cargo `FONDEO_SALIDA` (DD-13) vive en Fondeo, que nunca es consultable.

**Contraparte** (esquema `Contraparte` de `openapi.yaml`). La calcula una función pura del dominio a partir de la fila:

| Tipo de movimiento | `etiqueta` | `clabeTerminacion` |
|---|---|---|
| `DEPOSITO` | `"Depósito"` | `null` |
| `ENVIO` | Alias del beneficiario | Últimos 4 dígitos de la CLABE destino |
| `RECEPCION` | `"Transferencia recibida"` | Últimos 4 dígitos de la CLABE origen |
| `TRASPASO_SALIDA` | Nombre de la cuenta destino (`"Ahorro"`) | Últimos 4 dígitos de la CLABE destino |
| `TRASPASO_ENTRADA` | Nombre de la cuenta origen | Últimos 4 dígitos de la CLABE origen |

Una recepción no muestra quién envía. El modelo no guarda el nombre del usuario, y el alias que le puso el emisor es un dato privado del emisor.

### 8.2 Índices

Definidos en D-11 y creados en la migración 3 (§3.5):

| Índice | Sirve a |
|---|---|
| `ix_asiento_historial (cuenta_id, creado_en DESC, id DESC)` | Historial sin filtro de tipo, con o sin rango de fechas, y estado de cuenta (§9) |
| `ix_asiento_historial_tipo (cuenta_id, tipo_movimiento, creado_en DESC, id DESC)` | Historial filtrado por tipo |
| `uq_asiento_transferencia_cuenta (transferencia_id, cuenta_id)` | Verificación diferida de la transferencia (§3.3) |

**Plan esperado:** un `Index Scan` sobre el índice que corresponde, con `cuenta_id` (y `tipo_movimiento`) como igualdad, y el rango de fechas y el cursor como condición del mismo índice. Sin `Sort`, y leyendo unas `limite + 1` filas. Esto es lo que verifica §8.5.

**Comparación de tuplas.** PostgreSQL puede usar `(creado_en, id) < ($5, $6)` como condición de un índice B-tree, porque las dos columnas son consecutivas en el índice y tienen la misma dirección. Si el `EXPLAIN` de §8.5 la mostrara como `Filter` en lugar de `Index Cond`, se reemplaza por la forma equivalente `a.creado_en <= $5 AND (a.creado_en < $5 OR a.id < $6)`, cuya primera parte siempre es un rango del índice.

### 8.3 Cursor

```text
cursor      = base64url(JSON.stringify({ v: 1, c: "<creado_en tal como sale de PostgreSQL>", i: "<id>", f: "<filtrosHash>" }))
filtrosHash = primeros 16 caracteres hex de SHA-256(JSON.stringify(["v1", cuentaId, tipo ?? null, desde ?? null, hasta ?? null]))
```

- `c` es el texto de `timestamptz` con microsegundos que devuelve el parser de §2.3. Viaja a la consulta como texto con `::timestamptz`, sin pasar por `Date` (D-11, DD-07).
- `i` es el `id` del asiento, como texto.
- `filtrosHash` incluye el `cuentaId`. Un cursor de otra cuenta, de otro tipo o de otro rango de fechas responde `400 invalid-cursor` (R-5.7). `limite` no entra en el hash: el tamaño de página puede cambiar a mitad del recorrido.
- **Forma antes que contenido (R-5.7):** un `cursor` vacío o de más de 512 caracteres lo rechaza el esquema Zod de la query con `400 validation-error`. `invalid-cursor` queda solo para el contenido.
- **Decodificación estricta:** base64url válido, JSON válido, esquema Zod (`v = 1`, `c` con formato de `timestamptz`, `i` solo dígitos, `f` de 16 caracteres hex) y `f` igual al hash de la petición. Cualquier fallo responde `400 invalid-cursor`.
- **No está firmado.** Un cursor fabricado solo permite paginar desde otro punto de **una cuenta propia**: la propiedad de la cuenta se verifica en cada petición, independientemente del cursor.

**Movimientos que entran entre una página y otra** (R-5.4). Un movimiento nuevo tiene que quedar **antes** del cursor, nunca en la parte ya recorrida. Eso exige que el `creado_en` de cada asiento nuevo de una cuenta sea mayor que el de todos los asientos ya confirmados en esa cuenta. Con `now()` no se cumple: `now()` es el inicio de la transacción, así que una transacción que empezó antes y confirmó después puede insertar un asiento con un instante anterior al cursor, y el recorrido lo saltaría.

> **DD-36 · Aprobada · El instante de aplicación se lee con `clock_timestamp()` después de bloquear las cuentas (precisa DD-07 y D-11)**
> **Contexto:** DD-07 leía el instante una vez por transacción con `SELECT now()`. Con dos transferencias concurrentes hacia la misma cuenta, la que empezó antes puede confirmar después con un `creado_en` menor que el del último asiento que un cliente ya vio, y la paginación por cursor lo saltaría. R-5.4 se rompería.
> **Opciones:** (1) conservar `now()` y documentar el caso como limitación; (2) leer la hora real después de bloquear las cuentas.
> **Decisión:**
> - `RelojBaseDatos.ahora(tx)` ejecuta `SELECT clock_timestamp()`.
> - Al crear y al confirmar, se lee **después** de bloquear las cuentas (§6.1, paso 3.4; §6.5). Ese único valor se usa para `aplicada_en`, para el `creado_en` de los dos asientos y para la ventana del límite diario.
> - Donde no hay cuentas que bloquear (vencimiento del código, expiración perezosa), se lee después del último bloqueo del flujo.
> **Motivo:** toda transacción que inserta asientos en una cuenta tiene el bloqueo de esa cuenta. Quien toma el bloqueo lee la hora cuando el titular anterior ya confirmó, así que su instante es mayor que el de cualquier asiento visible en esa cuenta. Los dos asientos de una transferencia siguen compartiendo instante, porque salen de una sola lectura (D-11, DD-17). `RelojFijo` sigue sirviendo para las pruebas de medianoche.
> **Prueba:** se lanzan transferencias concurrentes hacia una cuenta mientras otra tarea recorre su historial página por página. Las páginas, juntas, no deben tener huecos ni repetidos respecto a los asientos que ya existían al empezar el recorrido.

**Mismo instante en el borde de una página** (R-5.4). El caso es una cuenta con varios movimientos con el mismo `creado_en`. `requirements.md` lo ilustraba antes con "los dos asientos de un traspaso", pero esos asientos caen en cuentas distintas y nunca aparecen juntos en el historial de una cuenta; el ejemplo se corrigió para que requisito y diseño coincidan. La prueba lo fuerza con `RelojFijo`: crea 25 movimientos con el mismo instante en una cuenta, la recorre con `limite = 10` y verifica que cada asiento aparece exactamente una vez, gracias al desempate por `id`.

### 8.4 Filtros de fecha

`desde` y `hasta` son días de calendario en `America/Mexico_City` (D-15). Se convierten en SQL, con la zona con nombre:

```sql
a.creado_en >= ($3::date)::timestamp AT TIME ZONE 'America/Mexico_City'
AND a.creado_en < (($4::date) + 1)::timestamp AT TIME ZONE 'America/Mexico_City'
```

- El rango es `[desde 00:00, hasta + 1 día 00:00)` en hora local (R-5.5).
- Con solo `desde` no hay cota superior; con solo `hasta`, no hay cota inferior.
- `desde > hasta` responde `400 validation-error` (R-5.5).
- La zona vive en una sola constante de `shared`, `ZONA_HORARIA = 'America/Mexico_City'`, y se pasa a la consulta como parámetro.

> **DD-37 · Aprobada · Consulta del historial con fragmentos fijos y contraparte sin datos del titular**
> **Contexto:** D-11 fija el orden, los índices y el cursor. Falta cómo se arma la consulta con filtros opcionales y qué se muestra de la otra parte.
> **Opciones de construcción:** (1) una sola consulta con `($x IS NULL OR columna = $x)` por filtro; (2) fragmentos fijos que se agregan solo si el filtro viene.
> **Decisión:**
> - La opción 2. El repositorio agrega solo los fragmentos de los filtros presentes.
> - **El texto SQL solo se forma concatenando fragmentos constantes** definidos en el propio repositorio. Ningún valor de la petición entra al texto, ni siquiera el tipo o la dirección del orden: todos van como parámetros `$n`, numerados según los fragmentos incluidos. Una prueba unitaria genera la consulta para cada combinación de filtros con valores marcadores y verifica que ninguno aparece en el texto SQL y que todos aparecen en el arreglo de parámetros.
> - La contraparte sigue la tabla de §8.1 y la calcula el dominio.
> - El estado de cuenta (§9) reusa el mismo repositorio, con rango de fechas y sin `LIMIT`.
> **Motivo:** con `$x IS NULL OR …`, PostgreSQL puede elegir un plan genérico que no use el índice por tipo. Con fragmentos fijos, cada combinación de filtros tiene un plan estable con su índice, y eso es lo que mide §8.5. La contraparte no revela datos del titular (R-3.6) ni el alias privado del emisor.

### 8.5 `EXPLAIN ANALYZE`

Medido en T-DOC-01 (2026-11-22) sobre el seed de §3.7: **120,808 asientos**, con la cuenta caliente (la `Principal` de `carga@demo.mx`) en **34,001 movimientos**. PostgreSQL 17 en Docker (`docker-compose.yml`), con la base local.

**Cómo se genera.** `npm run db:explicar` corre `api/src/scripts/explicar-historial.ts`. Ejecuta `ANALYZE` como `billetera_owner` y después `EXPLAIN (ANALYZE, BUFFERS)` como `billetera_app`, el rol de la API. Mide la **consulta real**: el texto y los parámetros salen de `construirConsultaMovimientos`, el mismo constructor que usa el repositorio (DD-37), con parámetros enlazados como en la API. El cursor de la variante 2 se fabrica con la fila 25,000 de la cuenta; ese `OFFSET` es solo del script, no de la consulta medida.

| # | Variante | Índice esperado | Resultado |
|---|---|---|---|
| 1 | Primera página, sin filtros, `limite = 20` | `ix_asiento_historial` | ✅ `Index Scan` sobre `ix_asiento_historial`, 21 filas, sin `Sort`, 1.538 ms |
| 2 | Página profunda, con un cursor a unos 25,000 movimientos del inicio | `ix_asiento_historial`, con el cursor como `Index Cond` | ✅ `Index Scan` con la tupla como `Index Cond`, 21 filas, sin `Sort`, 1.155 ms |
| 3 | Filtro `tipo = ENVIO`, primera página | `ix_asiento_historial_tipo` | ✅ `Index Scan` sobre `ix_asiento_historial_tipo`, 21 filas, sin `Sort`, 0.688 ms |
| 4 | Rango de un mes con `desde` y `hasta` | `ix_asiento_historial`, con el rango como `Index Cond` | ✅ `Index Scan` con el rango como `Index Cond`, 21 filas, sin `Sort`, 0.592 ms |
| 5 | Referencia: la variante 1 con `SET enable_indexscan = off` | `Seq Scan` o `Bitmap Heap Scan`, más `Sort` | `Parallel Seq Scan` sobre las 120,808 filas, más `Sort`, 38.615 ms |

**Criterios de aceptación** para las variantes 1 a 4, todos cumplidos:

- El nodo que lee `asiento` es un `Index Scan` sobre el índice esperado; no `Seq Scan` ni `Bitmap Heap Scan`.
- No hay nodo `Sort`.
- Las filas leídas de `asiento` son del orden de `limite + 1` (21), **también en la variante 2**. Eso demuestra que el costo no crece con la profundidad de la página (RNF-13).
- Se registra el `Execution Time` de cada una; la variante 5 sirve de comparación.

No hizo falta la alternativa de §8.2 ni ajustar ningún índice: la comparación de tuplas aparece como `Index Cond` (variante 2).

Los tiempos son de una sola corrida en una laptop, con todo en caché (`shared hit`). Valen como orden de magnitud y como comparación entre variantes, no como referencia de producción.

#### Variante 1 · Primera página, sin filtros, `limite = 20`

`Index Scan` sobre `ix_asiento_historial` con `cuenta_id` como `Index Cond`. Lee 21 filas de `asiento` (`limite + 1`), sin `Sort`: el índice ya entrega el orden `creado_en DESC, id DESC`. Los tres `JOIN` son `Index Scan` por llave primaria, solo para esas 21 filas. **1.538 ms.**

```text
Limit  (cost=1.40..36.21 rows=21 width=114) (actual time=0.705..1.336 rows=21 loops=1)
  Buffers: shared hit=210
  ->  Nested Loop Left Join  (cost=1.40..56847.27 rows=34285 width=114) (actual time=0.704..1.330 rows=21 loops=1)
        Join Filter: (a.monto_centavos < 0)
        Rows Removed by Join Filter: 6
        Buffers: shared hit=210
        ->  Nested Loop  (cost=1.12..46220.92 rows=34285 width=117) (actual time=0.687..1.236 rows=21 loops=1)
              Buffers: shared hit=171
              ->  Nested Loop  (cost=0.84..28983.64 rows=34285 width=122) (actual time=0.653..1.068 rows=21 loops=1)
                    Buffers: shared hit=108
                    ->  Index Scan using ix_asiento_historial on asiento a  (cost=0.42..7493.34 rows=34285 width=50) (actual time=0.060..0.158 rows=21 loops=1)
                          Index Cond: (cuenta_id = 'cc8dfc4e-d620-c605-1392-c5af66ee88c5'::uuid)
                          Buffers: shared hit=24
                    ->  Memoize  (cost=0.42..0.71 rows=1 width=88) (actual time=0.042..0.042 rows=1 loops=21)
                          Cache Key: a.transferencia_id
                          Cache Mode: logical
                          Hits: 0  Misses: 21  Evictions: 0  Overflows: 0  Memory Usage: 5kB
                          Buffers: shared hit=84
                          ->  Index Scan using pk_transferencia on transferencia t  (cost=0.41..0.70 rows=1 width=88) (actual time=0.014..0.014 rows=1 loops=21)
                                Index Cond: (id = a.transferencia_id)
                                Buffers: shared hit=84
              ->  Index Scan using pk_cuenta on cuenta co  (cost=0.28..0.50 rows=1 width=43) (actual time=0.007..0.007 rows=1 loops=21)
                    Index Cond: (id = CASE WHEN (a.monto_centavos < 0) THEN t.cuenta_destino_id ELSE t.cuenta_origen_id END)
                    Buffers: shared hit=63
        ->  Index Scan using pk_beneficiario on beneficiario b  (cost=0.28..0.30 rows=1 width=29) (actual time=0.003..0.004 rows=1 loops=21)
              Index Cond: (id = t.beneficiario_id)
              Buffers: shared hit=39
Planning:
  Buffers: shared hit=629
Planning Time: 2.613 ms
Execution Time: 1.538 ms
```

#### Variante 2 · Página profunda: cursor a 25,000 movimientos del inicio

`Index Scan` sobre `ix_asiento_historial` con `cuenta_id` **y la tupla `ROW(creado_en, id) < ROW(…)` como `Index Cond`**, no como `Filter`: no hace falta la alternativa de §8.2. Lee 21 filas y 24 buffers de `asiento`, lo mismo que la primera página, aunque el cursor está a 25,000 movimientos: el costo no crece con la profundidad (RNF-13). **1.155 ms.**

```text
Limit  (cost=1.40..73.87 rows=21 width=114) (actual time=0.451..1.050 rows=21 loops=1)
  Buffers: shared hit=213
  ->  Nested Loop Left Join  (cost=1.40..31978.58 rows=9266 width=114) (actual time=0.449..1.044 rows=21 loops=1)
        Join Filter: (a.monto_centavos < 0)
        Rows Removed by Join Filter: 11
        Buffers: shared hit=213
        ->  Nested Loop  (cost=1.12..29106.64 rows=9266 width=117) (actual time=0.441..0.968 rows=21 loops=1)
              Buffers: shared hit=171
              ->  Nested Loop  (cost=0.84..19186.59 rows=9266 width=122) (actual time=0.425..0.843 rows=21 loops=1)
                    Buffers: shared hit=108
                    ->  Index Scan using ix_asiento_historial on asiento a  (cost=0.42..6284.72 rows=9266 width=50) (actual time=0.032..0.131 rows=21 loops=1)
                          Index Cond: ((cuenta_id = 'cc8dfc4e-d620-c605-1392-c5af66ee88c5'::uuid) AND (ROW(creado_en, id) < ROW('2026-07-13 01:54:54.462341+00'::timestamp with time zone, '65726'::bigint)))
                          Buffers: shared hit=24
                    ->  Memoize  (cost=0.42..1.43 rows=1 width=88) (actual time=0.033..0.033 rows=1 loops=21)
                          Cache Key: a.transferencia_id
                          Cache Mode: logical
                          Hits: 0  Misses: 21  Evictions: 0  Overflows: 0  Memory Usage: 5kB
                          Buffers: shared hit=84
                          ->  Index Scan using pk_transferencia on transferencia t  (cost=0.41..1.42 rows=1 width=88) (actual time=0.015..0.015 rows=1 loops=21)
                                Index Cond: (id = a.transferencia_id)
                                Buffers: shared hit=84
              ->  Index Scan using pk_cuenta on cuenta co  (cost=0.28..1.07 rows=1 width=43) (actual time=0.005..0.005 rows=1 loops=21)
                    Index Cond: (id = CASE WHEN (a.monto_centavos < 0) THEN t.cuenta_destino_id ELSE t.cuenta_origen_id END)
                    Buffers: shared hit=63
        ->  Index Scan using pk_beneficiario on beneficiario b  (cost=0.28..0.30 rows=1 width=29) (actual time=0.003..0.003 rows=1 loops=21)
              Index Cond: (id = t.beneficiario_id)
              Buffers: shared hit=42
Planning:
  Buffers: shared hit=22
Planning Time: 0.846 ms
Execution Time: 1.155 ms
```

#### Variante 3 · Filtro `tipo = ENVIO`, primera página

`Index Scan` sobre `ix_asiento_historial_tipo` con `cuenta_id` y `tipo_movimiento` como `Index Cond`. Lee 21 filas, sin `Sort`. Con fragmentos fijos (DD-37), el plan del filtro por tipo usa su índice. **0.688 ms.**

```text
Limit  (cost=1.40..62.32 rows=21 width=114) (actual time=0.123..0.636 rows=21 loops=1)
  Buffers: shared hit=234
  ->  Nested Loop Left Join  (cost=1.40..35020.48 rows=12070 width=114) (actual time=0.122..0.630 rows=21 loops=1)
        Join Filter: (a.monto_centavos < 0)
        Buffers: shared hit=234
        ->  Nested Loop  (cost=1.12..31279.48 rows=12070 width=117) (actual time=0.116..0.558 rows=21 loops=1)
              Buffers: shared hit=171
              ->  Nested Loop  (cost=0.84..20539.40 rows=12070 width=122) (actual time=0.106..0.437 rows=21 loops=1)
                    Buffers: shared hit=108
                    ->  Index Scan using ix_asiento_historial_tipo on asiento a  (cost=0.42..6565.02 rows=12070 width=50) (actual time=0.053..0.161 rows=21 loops=1)
                          Index Cond: ((cuenta_id = 'cc8dfc4e-d620-c605-1392-c5af66ee88c5'::uuid) AND (tipo_movimiento = 'ENVIO'::text))
                          Buffers: shared hit=24
                    ->  Memoize  (cost=0.42..1.20 rows=1 width=88) (actual time=0.012..0.012 rows=1 loops=21)
                          Cache Key: a.transferencia_id
                          Cache Mode: logical
                          Hits: 0  Misses: 21  Evictions: 0  Overflows: 0  Memory Usage: 5kB
                          Buffers: shared hit=84
                          ->  Index Scan using pk_transferencia on transferencia t  (cost=0.41..1.19 rows=1 width=88) (actual time=0.009..0.009 rows=1 loops=21)
                                Index Cond: (id = a.transferencia_id)
                                Buffers: shared hit=84
              ->  Index Scan using pk_cuenta on cuenta co  (cost=0.28..0.89 rows=1 width=43) (actual time=0.005..0.005 rows=1 loops=21)
                    Index Cond: (id = CASE WHEN (a.monto_centavos < 0) THEN t.cuenta_destino_id ELSE t.cuenta_origen_id END)
                    Buffers: shared hit=63
        ->  Index Scan using pk_beneficiario on beneficiario b  (cost=0.28..0.30 rows=1 width=29) (actual time=0.003..0.003 rows=1 loops=21)
              Index Cond: (id = t.beneficiario_id)
              Buffers: shared hit=63
Planning:
  Buffers: shared hit=22
Planning Time: 0.791 ms
Execution Time: 0.688 ms
```

#### Variante 4 · Rango de un mes: `desde = 2026-10-01`, `hasta = 2026-10-31`

`Index Scan` sobre `ix_asiento_historial` con el rango como `Index Cond`. La conversión de §8.4 llega ya resuelta a instantes UTC: `2026-10-01 06:00:00+00` y `2026-11-01 06:00:00+00`, la medianoche local en UTC-6. Lee 21 filas, sin `Sort`. **0.592 ms.**

```text
Limit  (cost=1.39..102.83 rows=21 width=114) (actual time=0.056..0.544 rows=21 loops=1)
  Buffers: shared hit=222
  ->  Nested Loop Left Join  (cost=1.39..28627.09 rows=5926 width=114) (actual time=0.054..0.539 rows=21 loops=1)
        Join Filter: (a.monto_centavos < 0)
        Rows Removed by Join Filter: 6
        Buffers: shared hit=222
        ->  Nested Loop  (cost=1.11..26790.36 rows=5926 width=117) (actual time=0.048..0.474 rows=21 loops=1)
              Buffers: shared hit=171
              ->  Nested Loop  (cost=0.83..17847.47 rows=5926 width=122) (actual time=0.040..0.379 rows=21 loops=1)
                    Buffers: shared hit=108
                    ->  Index Scan using ix_asiento_historial on asiento a  (cost=0.42..6124.47 rows=5926 width=50) (actual time=0.027..0.104 rows=21 loops=1)
                          Index Cond: ((cuenta_id = 'cc8dfc4e-d620-c605-1392-c5af66ee88c5'::uuid) AND (creado_en >= '2026-10-01 06:00:00+00'::timestamp with time zone) AND (creado_en < '2026-11-01 06:00:00+00'::timestamp with time zone))
                          Buffers: shared hit=24
                    ->  Index Scan using pk_transferencia on transferencia t  (cost=0.41..1.98 rows=1 width=88) (actual time=0.012..0.012 rows=1 loops=21)
                          Index Cond: (id = a.transferencia_id)
                          Buffers: shared hit=84
              ->  Index Scan using pk_cuenta on cuenta co  (cost=0.28..1.51 rows=1 width=43) (actual time=0.004..0.004 rows=1 loops=21)
                    Index Cond: (id = CASE WHEN (a.monto_centavos < 0) THEN t.cuenta_destino_id ELSE t.cuenta_origen_id END)
                    Buffers: shared hit=63
        ->  Index Scan using pk_beneficiario on beneficiario b  (cost=0.28..0.30 rows=1 width=29) (actual time=0.002..0.002 rows=1 loops=21)
              Index Cond: (id = t.beneficiario_id)
              Buffers: shared hit=51
Planning:
  Buffers: shared hit=25
Planning Time: 1.068 ms
Execution Time: 0.592 ms
```

#### Variante 5 · Referencia: la variante 1 con `SET enable_indexscan = off`

Sin recorrido de índice: `Parallel Seq Scan` sobre `asiento`, que lee las 120,808 filas (17,000 por proceso pasan el filtro y 43,404 se descartan, en dos procesos) y 1,460 buffers. Después, un `Sort` de las 34,001 filas de la cuenta. **38.615 ms**, unas 25 a 65 veces más que las variantes 1 a 4, con 60 veces más buffers. La diferencia crece con el volumen; las variantes con índice no.

```text
Limit  (cost=4791.34..5055.75 rows=21 width=114) (actual time=34.035..38.161 rows=21 loops=1)
  Buffers: shared hit=1695
  ->  Nested Loop Left Join  (cost=4791.34..436469.11 rows=34285 width=114) (actual time=34.032..38.153 rows=21 loops=1)
        Join Filter: (a.monto_centavos < 0)
        Rows Removed by Join Filter: 6
        Buffers: shared hit=1695
        ->  Nested Loop  (cost=4791.05..288703.39 rows=34285 width=117) (actual time=34.017..38.049 rows=21 loops=1)
              Buffers: shared hit=1656
              ->  Nested Loop  (cost=4790.76..141386.63 rows=34285 width=122) (actual time=34.000..37.926 rows=21 loops=1)
                    Buffers: shared hit=1593
                    ->  Gather Merge  (cost=4790.29..8697.78 rows=34285 width=50) (actual time=32.946..36.682 rows=21 loops=1)
                          Workers Planned: 1
                          Workers Launched: 1
                          Buffers: shared hit=1509
                          ->  Sort  (cost=3790.28..3840.70 rows=20168 width=50) (actual time=19.017..19.098 rows=398 loops=2)
                                Sort Key: a.creado_en DESC, a.id DESC
                                Sort Method: quicksort  Memory: 2759kB
                                Buffers: shared hit=1509
                                Worker 0:  Sort Method: quicksort  Memory: 538kB
                                ->  Parallel Seq Scan on asiento a  (cost=0.00..2348.29 rows=20168 width=50) (actual time=0.057..9.056 rows=17000 loops=2)
                                      Filter: (cuenta_id = 'cc8dfc4e-d620-c605-1392-c5af66ee88c5'::uuid)
                                      Rows Removed by Filter: 43404
                                      Buffers: shared hit=1460
                    ->  Memoize  (cost=0.47..4.48 rows=1 width=88) (actual time=0.058..0.058 rows=1 loops=21)
                          Cache Key: a.transferencia_id
                          Cache Mode: logical
                          Hits: 0  Misses: 21  Evictions: 0  Overflows: 0  Memory Usage: 5kB
                          Buffers: shared hit=84
                          ->  Bitmap Heap Scan on transferencia t  (cost=0.46..4.47 rows=1 width=88) (actual time=0.008..0.008 rows=1 loops=21)
                                Recheck Cond: (a.transferencia_id = id)
                                Heap Blocks: exact=21
                                Buffers: shared hit=84
                                ->  Bitmap Index Scan on pk_transferencia  (cost=0.00..0.46 rows=1 width=0) (actual time=0.005..0.005 rows=1 loops=21)
                                      Index Cond: (id = a.transferencia_id)
                                      Buffers: shared hit=63
              ->  Bitmap Heap Scan on cuenta co  (cost=0.29..4.31 rows=1 width=43) (actual time=0.004..0.004 rows=1 loops=21)
                    Recheck Cond: (CASE WHEN (a.monto_centavos < 0) THEN t.cuenta_destino_id ELSE t.cuenta_origen_id END = id)
                    Heap Blocks: exact=21
                    Buffers: shared hit=63
                    ->  Bitmap Index Scan on pk_cuenta  (cost=0.00..0.29 rows=1 width=0) (actual time=0.003..0.003 rows=1 loops=21)
                          Index Cond: (id = CASE WHEN (a.monto_centavos < 0) THEN t.cuenta_destino_id ELSE t.cuenta_origen_id END)
                          Buffers: shared hit=42
        ->  Bitmap Heap Scan on beneficiario b  (cost=0.29..4.30 rows=1 width=29) (actual time=0.003..0.003 rows=1 loops=21)
              Recheck Cond: (id = t.beneficiario_id)
              Heap Blocks: exact=13
              Buffers: shared hit=39
              ->  Bitmap Index Scan on pk_beneficiario  (cost=0.00..0.29 rows=1 width=0) (actual time=0.002..0.002 rows=1 loops=21)
                    Index Cond: (id = t.beneficiario_id)
                    Buffers: shared hit=26
Planning:
  Buffers: shared hit=22
Planning Time: 0.752 ms
Execution Time: 38.615 ms
```

---

## 9. Estado de cuenta CSV

`GET /cuentas/{cuentaId}/estado-cuenta?mes=AAAA-MM` (D-08):

1. La cuenta debe ser del usuario; si no, `404` (R-B1.4).
2. `mes` debe tener la forma `AAAA-MM` con un mes de 01 a 12; si no, `400 validation-error` (R-B1.5).
3. Ventana: `[AAAA-MM-01 00:00, primer día del mes siguiente 00:00)` en `America/Mexico_City`, con la misma conversión de §8.4 (D-15).
4. **Saldo inicial:** `SUM(monto_centavos)::bigint` de los asientos de la cuenta anteriores al inicio de la ventana, como rango del mismo índice.
5. Movimientos de la ventana en orden cronológico ascendente, con el repositorio de §8.1 (DD-37). El saldo acumulado por fila se calcula en la API sumando enteros.

**Formato**

| Aspecto | Valor |
|---|---|
| Codificación | UTF-8 con BOM (`EF BB BF`) (R-B1.1) |
| Separador y fin de línea | Coma y `CRLF` (RFC 4180) |
| Comillas | Todo campo de texto va entre comillas dobles; una comilla interna se duplica |
| Columnas | `fecha,tipo,concepto,referencia,contraparte,monto,saldo` |
| `fecha` | Hora local `AAAA-MM-DD HH:MM:SS` en `America/Mexico_City` |
| `tipo` | `Depósito`, `Envío`, `Recepción`, `Traspaso enviado`, `Traspaso recibido` |
| `contraparte` | La `etiqueta` de §8.1, más los últimos 4 dígitos de la CLABE si existen |
| `monto`, `saldo` | Pesos con dos decimales, con signo y sin separador de miles: `-0.05`, `1234.56`, `0.00`. Los produce `centavosATextoDecimal` de `shared`, que separa los dos últimos dígitos del texto del entero, sin aritmética de punto flotante (R-B1.2, D-18) |
| Nombre del archivo | `Content-Disposition: attachment; filename="estado-cuenta-<últimos 4 de la CLABE>-AAAA-MM.csv"` |
| Caché | `Cache-Control: no-store` |

**Inyección de fórmulas** (R-B1.3). Si un campo de **texto** (`concepto`, `contraparte`) empieza con `=`, `+`, `-`, `@`, tabulador o retorno de carro, se le antepone un apóstrofo (`'`). `monto`, `saldo`, `fecha` y `referencia` (solo dígitos) nunca se alteran. Los caracteres de control ya no pueden aparecer dentro de los textos (DD-16); el apóstrofo cubre los cuatro caracteres visibles.

**Mes sin movimientos** (cierra el pendiente §12.7 de `requirements.md`). Responde `200` con el BOM y la fila de encabezados, sin filas de datos. Lo mismo vale para un mes futuro o anterior a la creación de la cuenta: son meses válidos sin movimientos.

**Pruebas:**

- Montos: `-5` → `-0.05`, `123456` → `1234.56`, `0` → `0.00`.
- Un concepto `=SUMA(A1)` sale como `'=SUMA(A1)`, y un monto negativo no recibe apóstrofo.
- Mes vacío: solo BOM y encabezados.
- Cambio de mes en hora local: un movimiento a las 23:30 del último día del mes, que en UTC ya cae en el mes siguiente, aparece en el mes local correcto.
- El saldo de la última fila es igual al saldo de la cuenta cuando el mes es el actual.

> **DD-38 · Aprobada · Formato del CSV con saldo acumulado, mes vacío y respuestas sin caché (cierra §12.7)**
> **Contexto:** D-08 fija la codificación, los montos y la inyección de fórmulas, pero no las columnas ni qué responde un mes sin movimientos.
> **Decisión:**
> - Las columnas de la tabla, con un saldo acumulado por fila que parte del saldo inicial del mes.
> - Un mes vacío, futuro o anterior a la cuenta responde `200` con solo los encabezados.
> - Todos los campos de texto van entre comillas.
> - `Cache-Control: no-store` en el CSV y en toda respuesta autenticada (middleware `autenticar`, §2.2).
> **Motivo:** un estado de cuenta sin saldo no permite conciliar, y el saldo inicial cuesta una sola suma por rango del índice. Un mes válido sin datos no es un error, y responder `404` haría indistinguibles "cuenta ajena" y "mes vacío". `no-store` impide que un proxy o el navegador guarden saldos y movimientos.

---

## 10. Observabilidad y auditoría

### 10.1 Logs estructurados

`pino` escribe una línea JSON por evento en `stdout`. En local se puede leer con `pino-pretty`; en producción, el destino está en `docs/aws-deploy.md`.

**Campos de cada línea de una petición:** `level`, `time` (ISO), `reqId` (DD-09), `usuarioId` (después de `autenticar`) y `msg`. La línea de cierre de `pino-http` agrega `req.method`, `req.url`, `res.statusCode` y `responseTime`.

**Contexto de la petición.** Un `AsyncLocalStorage` guarda `{ reqId, usuarioId }` mientras dura la petición. El logger de los casos de uso y `auditoria.registrarEvento` lo leen de ahí, sin pasarlo por parámetro: cada log y cada evento de auditoría llevan el request ID (RNF-12).

**Niveles**

| Nivel | Cuándo |
|---|---|
| `info` | Cierre de cada petición; arranque y parada |
| `warn` | Deadlock reintentado (D-12); `23505` en la llave de idempotencia (§6.2); reúso de refresh (§5.3); `429` |
| `error` | Todo `500`, con la causa y su traza (§7.4); configuración inválida al arrancar (§2.4) |

**Qué nunca se registra y qué se enmascara** (RNF-12; cierra el pendiente §12.6 de `requirements.md`):

| Dato | Tratamiento |
|---|---|
| Cuerpos de petición y de respuesta | **No se registran nunca.** Los serializadores de `pino-http` solo emiten método, URL y código |
| Headers `authorization` y `cookie` de la petición y `set-cookie` de la respuesta | Ocultos con `redact` (rutas `req.headers.authorization`, `req.headers.cookie` y `res.headers["set-cookie"]`), aunque los serializadores no emitan headers: si alguien los agrega, siguen censurados |
| Propiedades `contrasena`, `hash_contrasena`, `accessToken`, `refreshToken`, `refresh_hash`, `codigo`, `codigoSimulado`, `codigo_hmac`, en cualquier objeto registrado | Censuradas con `redact`, con tres rutas por campo: `campo`, `*.campo` y `*.*.campo`. Sin la ruta simple, pino no censura la propiedad en el nivel superior (`logger.info({ contrasena })`), porque `*` siempre exige un nivel de anidación |
| Correo | Enmascarado: `a***@dominio.mx` (primera letra y dominio) |
| CLABE | Enmascarada: `**************1234` (últimos 4 dígitos) |
| `Idempotency-Key`, ids y montos | Tal cual: no son secretos y hacen falta para investigar |

El enmascarado lo hacen dos funciones de `plataforma/logging`, `enmascararCorreo` y `enmascararClabe`, que comparten el logger y la auditoría.

**Prueba de fugas.** Una prueba de integración captura toda la salida del logger mientras ejecuta registro, login, refresh, alta de beneficiario, transferencia con código, confirmación fallida y confirmación correcta. Después busca en el texto crudo la contraseña, **cada access token y cada refresh token emitidos** (incluido el que viaja en la cookie), el código, la CLABE completa y el correo completo. Ninguno debe aparecer. Las peticiones de la prueba mandan `Authorization`, `Cookie` y reciben `Set-Cookie`, de modo que la prueba ejercita las tres rutas de `redact`.

> **DD-39 · Aprobada · Cuerpos nunca registrados, enmascarado de correo y CLABE, y contexto por `AsyncLocalStorage` (cierra §12.6)**
> **Contexto:** RNF-12 lista lo que nunca va a los logs y pide enmascarar "los demás datos sensibles"; `requirements.md` §12.6 deja abierta la CLABE.
> **Opciones:** (1) registrar los cuerpos y censurar campo por campo; (2) no registrar cuerpos y censurar como segunda barrera.
> **Decisión:** la opción 2, con la tabla anterior. El logger oculta siempre los headers `authorization`, `cookie` y `set-cookie`. El request ID y el usuario viajan en `AsyncLocalStorage`. Una prueba busca fugas en la salida cruda del logger y verifica que ningún token, ni access ni refresh, aparezca en ella.
> **Motivo:** censurar campo por campo deja pasar el siguiente campo sensible que alguien agregue. No registrar cuerpos cierra esa clase de fugas por construcción, y `redact` queda como segunda barrera. La CLABE completa junto con el correo identifica a una persona y su cuenta; los últimos 4 dígitos bastan para investigar.

### 10.2 Auditoría

Tabla `evento_auditoria` (§3.2), de solo inserción (RNF-11, DD-18).

| `tipo` | Cuándo | `usuario_id` | `datos` | Requisito |
|---|---|---|---|---|
| `usuario-registrado` | Registro confirmado | El nuevo usuario | `{ cuentas: [ids] }` | — |
| `sesion-iniciada` | Login correcto | El usuario | `{ familiaId, cliente }` | — |
| `login-fallido` | Credenciales incorrectas | `null` | `{ correo: enmascarado }` | — |
| `sesion-cerrada` | Logout que revocó una familia | El usuario | `{ familiaId }` | — |
| `refresh-reuse-detected` | Reúso de un refresh | El usuario | `{ familiaId, sesionesRevocadas }` | R-1.9, RNF-11 |
| `beneficiario-creado` | Alta de beneficiario | El usuario | `{ beneficiarioId, clabe: enmascarada }` | — |
| `fondeo-aplicado` | Cada fondeo: bienvenida y fase 1 del seed | El que recibe | `{ transferenciaId, cuentaDestinoId, montoCentavos }` | R-1.2, RNF-11 |
| `transferencia-pendiente` | Se crea una pendiente | El emisor | `{ transferenciaId, montoCentavos, codigoExpiraEn }` | — |
| `transferencia-aplicada` | Aplicada al crear o al confirmar | El emisor | `{ transferenciaId, tipo, montoCentavos, cuentaOrigenId, cuentaDestinoId }` | RNF-11 |
| `transferencia-rechazada` | Rechazada por cualquier motivo | El emisor | `{ transferenciaId, motivo, montoCentavos }` | RNF-11 |
| `codigo-incorrecto` | Cada intento fallido | El emisor | `{ transferenciaId, intentos }` | R-6.11, RNF-11 |

- **El evento se inserta en la misma transacción que la operación que audita.** Si la inserción falla, la operación entera se revierte: no hay dinero movido sin su evento. La única excepción es `login-fallido`, que no tiene transacción de negocio y se inserta solo.
- `request_id` sale del contexto de la petición (§10.1). En el seed vale `seed`.
- `datos` usa las mismas funciones de enmascarado que los logs y nunca contiene secretos ni códigos.
- La fase 2 del seed (volumen por SQL, DD-20) no genera eventos de auditoría: son datos sintéticos de medición, no operaciones.
- La API no expone la auditoría. La retención en producción se define en `docs/aws-deploy.md`.
- Las pruebas de RNF-23 verifican que cada flujo deja exactamente los eventos de esta tabla, y las de DD-18 que no se pueden modificar ni borrar.

> **DD-40 · Aprobada · Catálogo de auditoría y auditoría dentro de la transacción del negocio**
> **Contexto:** RNF-11 fija un mínimo (fondeo, transferencia aplicada o rechazada, intento fallido de código y reúso de refresh), y el interrogatorio dejó el catálogo para el diseño.
> **Decisión:** el catálogo de la tabla, que agrega sesiones, login fallido, alta de beneficiario y pendientes. Cada evento se inserta en la transacción de su operación. El volumen sintético del seed no se audita.
> **Motivo:** si la auditoría fuera una escritura aparte, un fallo entre las dos dejaría dinero movido sin registro. Los eventos agregados son los primeros que pediría una investigación de fraude: quién inició sesión, desde qué cliente y a quién dio de alta como beneficiario antes de transferir.

### 10.3 Salud y métricas

- `GET /api/health` llama a la dependencia `verificarBase()` de `crearApp` (DD-08). Responde `200 {"estado":"ok"}` si resuelve, y `503 retryable` con `Retry-After: 1` si lanza, sin importar la causa. La implementación real ejecuta `SELECT 1` con un timeout corto (T-API-04). Hasta entonces, `main.ts` pasa un stub.
- Métricas, trazas distribuidas y alarmas quedan para `docs/aws-deploy.md` (CloudWatch, X-Ray u OpenTelemetry). En local bastan los logs JSON y el `EXPLAIN` de §8.5.

---

## 11. Rate limiting

`express-rate-limit` responde `429 too-many-requests` en formato RFC 7807, con `Retry-After` y los headers estándar `RateLimit-*` (R-1.18, R-3.9, RNF-04). Esta sección cierra el pendiente §12.4 de `requirements.md`.

| Ruta | Llave | Ventana | Máximo | Qué cuenta | Requisito |
|---|---|---|---|---|---|
| `POST /auth/login` | IP | 15 min | 20 | Todas las peticiones | R-1.18 |
| `POST /auth/login` | Correo normalizado | 15 min | 5 | Solo los fallos (`skipSuccessfulRequests`) | R-1.18 |
| `POST /auth/registro` | IP | 1 hora | 5 | Todas las peticiones | R-1.18, D-20 |
| `POST /beneficiarios` | `usuarioId` | 1 hora | 10 | Todas las peticiones | R-3.9, D-19 |

- **Headers:** `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset` (`standardHeaders: 'draft-6'`), sin los `X-RateLimit-*` antiguos. El `429` además lleva `Retry-After` en segundos. El problem lo produce `manejadorErrores`, como cualquier otro `type` (§7.3).
- **Dónde viven:** cada módulo crea sus limitadores dentro de su función de rutas (§2.1): `rutasIdentidad` los de login y registro, `rutasBeneficiarios` el del alta, después de `autenticar`. Como `crearModulos` corre en cada `crearApp`, cada app tiene su propio almacén.
- **Llave por IP:** `ipKeyGenerator(req.ip)` de la librería. Una IPv6 cuenta por su subred `/56`, porque un solo cliente suele tener un bloque entero y podría rotar direcciones dentro de él.
- **Login por correo:** frena la adivinación de contraseñas contra una cuenta aunque el atacante cambie de IP. Solo cuenta los fallos, para que el dueño no se bloquee al iniciar sesión varias veces. Un fallo es cualquier respuesta `>= 400`, incluido el `400` de validación. La llave sale del correo del cuerpo, normalizado como en el esquema (`trim` y minúsculas). Si el cuerpo no trae correo, o no es texto, la petición solo cuenta en el límite por IP.
- **Registro por IP:** acota la enumeración de correos que permite el `409` (concesión de DD-23) y la fila que se forma sobre Fondeo (D-20).
- **Beneficiarios por usuario:** el alta no puede usarse como oráculo de qué CLABE existe (D-19).
- **Sin rate limit** en:
  - refresh: cuesta un SHA-256 y exige un refresh válido;
  - confirmar: los 3 intentos por código ya lo acotan (D-07);
  - transferir: ya lo acotan el límite diario, el saldo y el bloqueo por usuario.

  Un límite general por usuario va en "qué haría con más tiempo".
- **IP real:** `app.set('trust proxy', TRUST_PROXY)` (§2.4). En local vale `0`. Express toma la IP del cliente de `X-Forwarded-For`, contando desde la derecha tantos saltos como proxies confiables haya.
  - Con `0`, se ignora `X-Forwarded-For` y se usa la IP de la conexión.
  - Con **el número exacto** de proxies propios (por ejemplo, `1` detrás de un solo ALB), se toma la entrada que agregó el último proxy confiable, y lo que el cliente haya escrito a la izquierda se ignora.
  - **Nunca `true`:** confiaría en toda la cadena, y cualquiera podría falsificar su IP con un `X-Forwarded-For` inventado y así esquivar el rate limit.
  - **Para `docs/aws-deploy.md`:** fijar `TRUST_PROXY` al número exacto de saltos de la arquitectura (CloudFront, ALB) y documentarlo junto al diagrama, porque un valor mayor que el real vuelve a abrir la falsificación.
- **Almacén:** memoria del proceso. Las pruebas lo reinician entre casos.
- **Pruebas:** superar cada límite de la tabla devuelve `429 too-many-requests` con `Retry-After`; un login correcto no consume el límite por correo; el límite de beneficiarios es por usuario, así que un segundo usuario no se ve afectado.

> **DD-41 · Aprobada · Umbrales del rate limit y almacén en memoria (cierra §12.4)**
> **Contexto:** RNF-04 pide rate limit en login, registro y alta de beneficiarios sin fijar umbrales; D-19 sugiere unos 10 por hora para beneficiarios.
> **Opciones de almacén:** (1) memoria del proceso; (2) PostgreSQL; (3) Redis.
> **Decisión:** los umbrales de la tabla, con almacén en memoria para esta entrega. En producción, con varias instancias, se usa Redis (ElastiCache) con el mismo esquema de llaves. `docs/aws-deploy.md` documenta las dos cosas: el almacén y el valor exacto de `TRUST_PROXY` detrás del balanceador, para obtener la IP real sin permitir falsificarla con `X-Forwarded-For`.
> **Motivo:** en local corre un solo proceso, así que la memoria da el comportamiento exacto sin otra dependencia. PostgreSQL como almacén agregaría una escritura a cada intento de login, contra la misma base que mueve el dinero. Con varias instancias, el almacén en memoria multiplicaría el límite por el número de instancias, y por eso producción usa Redis.

---

## 12. Diagramas de secuencia

### 12.1 Registro con fondeo de bienvenida

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant W as Web
    participant A as API
    participant D as PostgreSQL
    U->>W: Correo y contraseña
    W->>W: Valida con el esquema de shared
    W->>A: POST /auth/registro
    A->>A: Rate limit por IP, Zod y hash argon2id
    A->>D: BEGIN e INSERT usuario
    alt Correo ya registrado
        D-->>A: 23505 en uq_usuario_correo
        A->>D: ROLLBACK
        A-->>W: 409 correo-ya-registrado
    else Correo nuevo
        A->>D: INSERT cuentas Principal y Ahorro con CLABE aleatoria
        opt FONDEO_BIENVENIDA_CENTAVOS mayor que 0
            A->>D: Bloquea Fondeo y Principal por id ascendente
            A->>D: Lee el instante con clock_timestamp
            A->>D: INSERT transferencia FONDEO APLICADA y 2 asientos
            Note over D: El trigger mueve los saldos
            A->>D: INSERT evento fondeo-aplicado
        end
        A->>D: INSERT evento usuario-registrado
        A->>D: COMMIT y verificación diferida
        A-->>W: 201 con id y correo
        W->>A: POST /auth/login con cliente web
    end
```

El usuario recién insertado queda bloqueado por su propio `INSERT`, así que el fondeo respeta el orden de D-12: primero el usuario, después las cuentas (D-20).

### 12.2 Login, rotación y reúso del refresh

```mermaid
sequenceDiagram
    autonumber
    participant W as Web
    participant X as Atacante
    participant A as API
    participant D as PostgreSQL
    W->>A: POST /auth/login con cliente web
    A->>D: Busca el usuario por correo
    A->>A: Verifica argon2id, con hash ficticio si no existe
    A->>D: INSERT sesion R1 en la familia F, vence en 7 días
    A-->>W: 200 con access y Set-Cookie R1
    Note over W: El access vence a los 15 min
    W->>A: POST /auth/refresh con cookie R1 y X-Requested-With
    A->>D: SELECT sesion R1 FOR UPDATE
    A->>D: Marca R1 como usada e inserta R2 en F con el mismo vencimiento
    A-->>W: 200 con access y Set-Cookie R2
    X->>A: POST /auth/refresh con R1 robado
    A->>D: SELECT sesion R1 FOR UPDATE
    Note over A: R1 ya estaba usada, es reúso
    A->>D: Revoca todas las sesiones de F
    A->>D: INSERT evento refresh-reuse-detected y COMMIT
    A-->>X: 401 unauthorized
    W->>A: POST /auth/refresh con cookie R2
    A->>D: SELECT sesion R2 FOR UPDATE
    A-->>W: 401 porque la familia está revocada
    W->>W: Muestra el login
```

### 12.3 Transferencia sin código

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant W as Web
    participant A as API
    participant D as PostgreSQL
    U->>W: Origen, destino, monto, concepto y referencia
    W->>W: montoTextoACentavos y esquema de shared
    U->>W: Continuar a la confirmación
    W->>W: Congela los datos y genera la llave K
    U->>W: Enviar
    W->>W: Guarda el intento en fase creacion y deshabilita Enviar
    W->>A: POST /transferencias con Idempotency-Key K
    A->>D: Busca K para el usuario y no existe
    A->>D: Resuelve origen y beneficiario y clasifica TERCERO
    A->>D: BEGIN y bloquea al usuario
    A->>D: Vuelve a buscar K y no existe
    A->>D: Bloquea las dos cuentas por id ascendente
    A->>D: Lee el instante con clock_timestamp
    A->>D: Saldo suficiente y consumido del día dentro del límite
    A->>D: INSERT transferencia APLICADA y 2 asientos
    A->>D: INSERT evento transferencia-aplicada
    A->>D: COMMIT y verificación diferida
    A-->>W: 201 con comprobante
    W->>W: Borra el intento
    W->>U: Comprobante
```

Con saldo insuficiente falla la validación de saldo (paso 14). La API inserta la transferencia `RECHAZADA` con su evento y responde `422 saldo-insuficiente` con `transferenciaId`. La web muestra el motivo en lenguaje claro y no muestra comprobante (R-4.12).

### 12.4 Transferencia con código y confirmación

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant W as Web
    participant A as API
    participant D as PostgreSQL
    participant O as ProveedorOtp
    W->>A: POST /transferencias, monto mayor que el umbral, llave K
    A->>D: Bloquea usuario y cuentas y lee el instante
    A->>D: Saldo y límite suficientes, sin mover dinero
    A->>D: INSERT transferencia PENDIENTE_CONFIRMACION
    A->>D: INSERT código con HMAC que vence en 5 min
    A->>D: INSERT evento transferencia-pendiente y COMMIT
    A->>O: Entrega el código
    O-->>A: codigoSimulado, solo en modo simulado
    A-->>W: 202 con transferenciaId y codigoExpiraEn
    W->>W: Pasa el intento a fase confirmacion
    U->>W: Código incorrecto
    W->>A: POST /transferencias/id/confirmar
    A->>D: Bloquea usuario, luego transferencia y código
    A->>A: timingSafeEqual de los HMAC, no coinciden
    A->>D: Suma 1 a intentos, evento codigo-incorrecto y COMMIT
    A-->>W: 422 codigo-incorrecto con intentosRestantes 2
    U->>W: Código correcto
    W->>A: POST /transferencias/id/confirmar
    A->>D: Bloquea usuario, luego transferencia y código
    A->>A: Los HMAC coinciden y el código sigue vigente
    A->>D: Bloquea las cuentas y vuelve a leer el instante
    A->>D: Revalida saldo y límite con la hora de confirmación
    A->>D: UPDATE a APLICADA, INSERT 2 asientos y evento, COMMIT
    A-->>W: 201 con comprobante
    W->>W: Borra el intento
```

### 12.5 Dos peticiones simultáneas con la misma llave

```mermaid
sequenceDiagram
    autonumber
    participant C as Cliente
    participant A1 as API, petición 1
    participant A2 as API, petición 2
    participant D as PostgreSQL
    par Doble envío
        C->>A1: POST /transferencias con llave K
    and
        C->>A2: POST /transferencias con llave K
    end
    A1->>D: Busca K y no existe
    A2->>D: Busca K y no existe
    A1->>D: BEGIN y bloquea al usuario
    A2->>D: BEGIN y pide el bloqueo del usuario
    Note over A2,D: Espera, como máximo 5 s de lock_timeout
    A1->>D: Revisa K, bloquea cuentas, aplica y COMMIT
    A1-->>C: 201 con comprobante
    D-->>A2: Obtiene el bloqueo
    A2->>D: Vuelve a buscar K y encuentra la fila de la petición 1
    A2->>A2: Compara el hash y es el mismo
    A2->>D: COMMIT sin escribir
    A2-->>C: 201 con el mismo comprobante
```

Si los hashes difieren, la petición 2 responde `422 idempotency-key-reused`. Si, pese al bloqueo, el `INSERT` chocara con `uq_transferencia_usuario_llave`, la red de seguridad de §6.2 lee la fila ganadora en otra transacción.

### 12.6 Recarga de la web a mitad del envío

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant W as Web
    participant S as sessionStorage
    participant A as API
    U->>W: Enviar
    W->>S: Guarda el intento con llave K, cuerpo y fase creacion
    W->>A: POST /transferencias con llave K
    U->>W: Recarga la página antes de la respuesta
    Note over A: La API confirma la transferencia y la respuesta se pierde
    W->>A: POST /auth/refresh con la cookie
    A-->>W: 200 con access nuevo
    W->>S: Lee el intento guardado
    W->>U: Verificando operación anterior
    W->>A: POST /transferencias con la misma llave K y el mismo cuerpo
    A-->>W: 201 con la respuesta original reconstruida
    W->>S: Borra el intento
    W->>U: Comprobante
```

Variantes (§6.2):

- Si el reenvío recibe `202`, la web consulta `GET /transferencias/{id}` y muestra el estado real antes de pedir el código.
- Si el intento estaba en fase `confirmacion`, la web reenvía la confirmación con el código guardado, nunca la creación.
- En modo simulado, `codigoSimulado` se toma del intento guardado (DD-25).

### 12.7 Red perdida en la app móvil

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant M as App móvil
    participant S as SecureStore
    participant A as API
    U->>M: Confirma la transferencia a un beneficiario
    M->>S: Guarda el intento con llave K, cuerpo, usuario y fase creacion
    M->>A: POST /transferencias con llave K
    Note over A: Aplica y confirma, luego espera DEMO_LATENCIA_MS
    Note over M: Modo avión, la respuesta se pierde
    M->>U: Verificando estado de tu transferencia
    M->>A: Reintento a 1 s con la misma llave
    Note over M: Sin red, falla
    M->>A: Reintento a 2 s con la misma llave
    Note over M: Sin red, falla
    Note over M: NetInfo detecta que volvió la conexión
    M->>A: Reintento inmediato con la misma llave
    A-->>M: 201 con la respuesta original reconstruida
    M->>S: Borra el intento
    M->>U: Comprobante
```

Variantes:

- Si se agotan los reintentos (1, 2, 4, 8 y 16 s), la app muestra "Estado desconocido" con un solo botón, "Verificar de nuevo", que reenvía con la misma llave (R-4.30).
- Si el access vence durante los reintentos, se refresca con la promesa única y se sigue con la misma llave (R-4.29).
- Si la respuesta es `202`, la app consulta `GET /transferencias/{id}` y muestra el estado real antes de pedir el código (DD-32).
- Si el intento estaba en fase `confirmacion`, se reintenta `POST /transferencias/{id}/confirmar` con el mismo código, nunca la creación (§6.2).
- Al reabrir la app con un intento guardado del mismo usuario, se resuelve antes de mostrar el saldo; si es de otro usuario, no se envía (R-4.31).

---

## 13. Clientes

### 13.1 `packages/shared`

Sin dependencias de React, de Node ni de Expo. Lo usan la API, la web y la app móvil (RNF-18).

| Módulo | Exporta | Requisitos |
|---|---|---|
| `dinero` | `montoTextoACentavos`, `formatearMXN`, `centavosATextoDecimal`, `TOPE_CENTAVOS` | R-2.5, R-4.33, R-4.34, R-B1.2, D-18 |
| `clabe` | `digitoVerificador`, `validarClabe` | R-3.2 a R-3.4, R-3.10, D-19 |
| `tiempo` | `ZONA_HORARIA`, `instanteIso` (DD-22) | D-15 |
| `esquemas` | Esquemas Zod de entrada: registro, login, refresh, beneficiario, transferencia (con `destino` discriminado, DD-26), confirmación, `Idempotency-Key`, filtros del historial, mes; `normalizarTexto` (`trim` + NFC); y la lista de contraseñas comunes (`contrasenas-comunes.ts`, generada por `scripts/generar-contrasenas-comunes.mjs`, §5.1) | RNF-01, RNF-18, DD-28 |
| `problemas` | `TIPOS_PROBLEMA` y `mensajeDeProblema(type)`: los textos en español que muestran web y móvil. El tipo `TipoProblema` no se define aquí: viene de los tipos generados del contrato (`api`) | R-4.12 |
| `api` | Tipos generados de `openapi.yaml` y sus alias (§4.3) | RNF-18 |

**`montoTextoACentavos(texto)`** devuelve `{ ok: true, centavos }` o `{ ok: false, error }`. Trabaja **sobre el texto**, sin multiplicar ni redondear (D-18):

1. Quita un `$` inicial opcional y los espacios.
2. Valida contra `^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$`. Esto rechaza el signo, la notación exponencial, las comas mal agrupadas y los textos vacíos. Más de 2 decimales da el error "Máximo 2 decimales".
3. Quita las comas de la parte entera y completa la fracción a 2 dígitos con ceros a la derecha (`"1"` → `"10"`).
4. Concatena parte entera y fracción en un solo texto de dígitos (`"0" + "10"` → `"010"`) y lo convierte con `Number`. Es un entero exacto, porque el tope cabe en `Number.MAX_SAFE_INTEGER`.
5. Rechaza `0` y cualquier valor mayor que `TOPE_CENTAVOS` (`100000000000`).

Textos de `error`, que web y móvil muestran tal cual:

| Caso | `error` |
|---|---|
| No cumple el formato del paso 2 (signo, exponente, comas mal agrupadas, vacío) | `"Monto inválido"` |
| Más de 2 decimales | `"Máximo 2 decimales"` |
| Cero | `"El monto debe ser mayor que cero"` |
| Mayor que `TOPE_CENTAVOS` | `"El monto supera el tope"` |

Casos de prueba: los de R-4.33, y además `"1.005"` → error, `"00.50"` → `50`, `"1,000.5"` → `100050`, `"$1,000,000.00"` → `100000000` y `"1000000000.01"` → error por tope.

**`formatearMXN(centavos)`** (D-18):

1. Separa el signo y toma el valor absoluto como texto, completado con ceros a la izquierda hasta 3 dígitos (`5` → `"005"`).
2. Los pesos son todo menos los dos últimos dígitos, y los centavos son esos dos últimos.
3. Formatea los pesos, que son un entero, con `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).formatToParts(...)` y reemplaza la parte `fraction` por los centavos exactos.
4. Antepone el signo: `-250` → `-$2.50`.

En la primera tarea móvil se verifica que Hermes soporte `formatToParts`. Si no lo soporta, se usa un formateo manual de miles con los mismos casos de prueba (D-18).

**`centavosATextoDecimal(centavos)`** hace la misma separación de texto, sin `Intl`, para el CSV: `-5` → `-0.05`, `0` → `0.00` (DD-38).

**`digitoVerificador(primeros17)`** (D-19, R-3.4) recibe el texto de los primeros 17 dígitos y devuelve un entero de 0 a 9: multiplica cada dígito por los pesos 3, 7, 1 en ciclo, toma cada producto módulo 10, los suma y aplica `(10 - (suma % 10)) % 10`. Solo usa enteros. Si la entrada no son exactamente 17 dígitos, lanza `RangeError`: es un error de programación, no de captura.

**`validarClabe(texto)`** (R-3.2 a R-3.4, R-3.10) devuelve `{ ok: true, clabe }` o `{ ok: false, error }`, con la misma forma que `montoTextoACentavos`. Es estricta: no recorta ni quita espacios. El formulario quita los espacios antes de llamarla, igual que con el monto. Revisa en este orden y reporta el primer fallo:

| Caso | `error` |
|---|---|
| Algún carácter no numérico (letras, espacios, guiones) | `"La CLABE solo admite números"` |
| Longitud distinta de 18, incluido el texto vacío | `"La CLABE debe tener 18 dígitos"` |
| Dígito verificador incorrecto | `"El dígito verificador de la CLABE no es válido"` |

Casos de prueba: una CLABE cuya suma ponderada termina en 0 (dígito `0`, no `10`), la CLABE de Fondeo `999000000000000001` (§3.6), textos con letras, 17 y 19 dígitos.

**`instanteIso(textoPg)`** (DD-22, DD-07) convierte el texto de `timestamptz` que entrega `pg` (con `TimeZone=UTC`) al formato de la API, **operando sobre el texto** y sin pasar por `Date`. Acepta solo `AAAA-MM-DD HH:MM:SS`, con una fracción opcional de 1 a 6 dígitos (PostgreSQL quita los ceros finales y omite la fracción cuando vale cero), seguido de `+00`. Cambia el espacio por `T`, completa la fracción a 6 dígitos con ceros a la derecha y cambia `+00` por `Z`: `2026-11-14 16:05:09.12+00` → `2026-11-14T16:05:09.120000Z`. Cualquier otro texto, incluido otro desfase (`-06`, `+00:00`), lanza un error.

**`mensajeDeProblema(type)`** (R-4.12, DD-23) devuelve el texto en español que web y móvil muestran para cada `type` de §7.2. Los textos no llevan números variables: la pantalla muestra aparte extensiones como `intentosRestantes`. Recibe cualquier texto porque el `type` llega de la red; un `type` fuera del catálogo devuelve el texto de `internal-error`. `TipoProblema` es el tipo generado desde el `enum` de `openapi.yaml` (§4.3), que es la única fuente del catálogo. `TIPOS_PROBLEMA` es la misma lista disponible en tiempo de ejecución, declarada con `satisfies readonly TipoProblema[]`, y una prueba de tipos (`expectTypeOf(...).toEqualTypeOf<TipoProblema>()`) exige que sean exactamente el mismo conjunto.

| `type` | HTTP | Texto |
|---|---|---|
| `validation-error` | 400 | Revisa los datos marcados. |
| `invalid-cursor` | 400 | El historial cambió. Vuelve a cargarlo. |
| `unauthorized` | 401 | Tu sesión terminó. Inicia sesión de nuevo. |
| `credenciales-invalidas` | 401 | Correo o contraseña incorrectos. |
| `not-found` | 404 | No encontramos lo que buscas. |
| `correo-ya-registrado` | 409 | Ese correo ya está registrado. Inicia sesión o usa otro correo. |
| `beneficiario-duplicado` | 409 | Ya tienes un beneficiario con esa CLABE o ese alias. |
| `clabe-not-found` | 422 | La CLABE no corresponde a ninguna cuenta de la plataforma. |
| `misma-cuenta` | 422 | La cuenta de origen y la de destino deben ser distintas. |
| `idempotency-key-reused` | 422 | No pudimos procesar este envío. Inicia uno nuevo. |
| `saldo-insuficiente` | 422 | La cuenta origen no tiene saldo suficiente para esta transferencia. |
| `limite-diario-excedido` | 422 | La transferencia supera tu límite diario. Tu límite se renueva a medianoche. |
| `codigo-incorrecto` | 422 | El código es incorrecto. Inténtalo de nuevo. |
| `codigo-agotado` | 422 | Agotaste los intentos del código. La transferencia fue rechazada. |
| `codigo-expirado` | 422 | El código expiró. La transferencia fue rechazada. |
| `too-many-requests` | 429 | Demasiados intentos. Espera un momento y vuelve a intentarlo. |
| `retryable` | 503 | El servicio está ocupado. Inténtalo de nuevo en unos segundos. |
| `internal-error` | 500 | Ocurrió un error inesperado. Inténtalo más tarde. |

**Reglas de lint en `api`, `web`, `mobile` y `shared`** (RNF-09, D-18):

| Regla | Prohíbe |
|---|---|
| `no-restricted-globals` y `no-restricted-properties` | `parseFloat`, `Number.parseFloat`, `Math.round`, `Math.floor`, `Math.ceil` |
| `no-restricted-syntax` | Cualquier división entre el literal `100` (`x / 100`) y cualquier llamada a `.toFixed(...)` |
| `no-restricted-imports` (solo `mobile`) | `@react-native-async-storage/async-storage` (RNF-20) |

Las reglas de dinero aplican también en `api/**`, código y pruebas. La única excepción permitida es un falso positivo fuera del camino del dinero, por ejemplo la espera aleatoria del reintento de deadlock (§2.3). Se desactiva solo en esa línea, con `// eslint-disable-next-line <regla> -- <motivo>`. No se permiten excepciones por archivo ni por bloque.

> **DD-42 · Aprobada · Reglas de lint para el dinero y el almacenamiento móvil**
> **Contexto:** D-18 pide prohibir con lint `parseFloat` y `/ 100` sobre montos, y RNF-20 prohíbe `AsyncStorage`.
> **Decisión:** además de `parseFloat` y `/ 100`, el lint prohíbe `Number.parseFloat`, `Math.round`, `Math.floor`, `Math.ceil` y `.toFixed` en `api`, `web`, `mobile` y `shared`. En `mobile` prohíbe además importar `AsyncStorage`. La regla aplica a todo el código y no intenta detectar "solo los montos". Una excepción solo se admite en la línea, con un comentario que diga el motivo. _(Ampliada en T-API-03: al principio cubría solo `web`, `mobile` y `shared`. Se extendió a `api` porque ahí viven los casos de uso que mueven dinero.)_
> **Motivo:** D-18 dice que en el sistema no existe ninguna operación de redondeo. Esas funciones son exactamente las de redondeo, y `toFixed` es el camino más común para formatear dinero con punto flotante. Detectar solo los montos exigiría análisis de tipos frágil; prohibirlas en general cuesta pocas excepciones explicadas. Prohibir el import convierte RNF-20 en una verificación automática.

### 13.2 Web

**Rutas** (React Router):

| Ruta | Pantalla | Requisitos |
|---|---|---|
| `/login`, `/registro` | Login y registro | HU-1 |
| `/` | Resumen: cuentas con saldo y límite del día (`GET /limites`) | R-2.1, R-2.6, R-6.7 |
| `/cuentas/:cuentaId` | Historial con filtros y paginación, y botón del estado de cuenta | R-5.11, R-B1.6 |
| `/beneficiarios` | Lista y formulario de alta | R-3.1, R-3.10 |
| `/transferir` | Flujo de transferencia: formulario → confirmación → código → comprobante o rechazo | HU-4, HU-6 |

`/transferir` es una sola ruta con la máquina del intento (abajo). Sus fases no son rutas, para que el botón "atrás" del navegador no cree un segundo intento.

**Sesión** (D-05, D-06, R-1.13 a R-1.15):

- El access vive en una variable de módulo de `auth/`, nunca en `localStorage` ni en `sessionStorage`.
- Al cargar la app, una ruta protegida espera a `POST /auth/refresh` antes de pintar datos (R-1.14).
- El cliente `fetch` agrega `Authorization`. Ante un `401 unauthorized`, refresca **una vez** y repite la petición original **una vez**. Repetir es seguro: un `POST /transferencias` lleva la misma llave. Un `401 credenciales-invalidas` del login no dispara el refresh: se muestra su texto en el formulario.
- El refresh corre dentro de `navigator.locks.request('billetera-refresh', …)`. Dentro del lock, la pestaña vuelve a revisar si otra ya obtuvo un access válido mientras esperaba; si es así, no rota (R-1.15).
  - **Alcance de la revisión previa.** El access vive en la memoria de cada pestaña, así que una pestaña no puede ver el access que obtuvo otra. La revisión ahorra refresh **dentro de una misma pestaña**: si varias peticiones reciben `401` a la vez, la primera rota y las demás encuentran, dentro del lock, un access distinto del que les falló y lo reutilizan. **Entre pestañas** hay un refresh por pestaña. El lock garantiza que nunca se solapan, y la segunda pestaña manda la cookie que la primera ya rotó, así que la API no detecta un falso reúso (R-1.15).
- Cerrar sesión llama a `POST /auth/logout`, borra el access en memoria y el intento de `sessionStorage`, y limpia la caché de TanStack Query (R-1.12).

**Datos del servidor** (TanStack Query):

| Clave | Uso |
|---|---|
| `['cuentas']` | Resumen |
| `['limites']` | Resumen y formulario de transferencia |
| `['movimientos', cuentaId, filtros]` | `useInfiniteQuery` con `siguienteCursor` |
| `['beneficiarios']` | Lista y selector de destino |
| `['transferencia', id]` | Consulta del estado real (§6.2) |

- Valores por defecto: `staleTime` de 30 s; un reintento para las consultas, salvo respuestas 4xx; ningún reintento automático para mutaciones.
- **Al terminar una transferencia, aplicada o rechazada**, la máquina del intento invalida las consultas `['cuentas']` y `['movimientos']` (todas las cuentas y filtros, por prefijo) y además `['limites']` (DD-43). Así, el resumen y el historial se vuelven a pedir al servidor y nunca muestran un saldo calculado en el cliente.
- La transferencia **no** usa `useMutation`: su ciclo de vida es la máquina del intento, que no debe depender de los reintentos de la librería.

**Estados por pantalla** (RNF-17):

| Pantalla | Cargando | Vacío | Error | Éxito |
|---|---|---|---|---|
| Resumen | Esqueleto de tarjetas | — (siempre hay 2 cuentas, D-20) | Mensaje con "Reintentar" | Tarjetas con saldo y límite disponible |
| Historial | Esqueleto de filas | "Sin movimientos" o "Sin resultados para estos filtros", según haya filtros | Mensaje con "Reintentar" | Tabla con "Cargar más" mientras haya `siguienteCursor` |
| Beneficiarios | Esqueleto | "Aún no tienes beneficiarios", con el formulario visible | Mensaje con "Reintentar"; los errores del alta van junto a su campo | Lista y confirmación del alta |
| Transferir | Selectores deshabilitados mientras cargan cuentas y beneficiarios | "Registra un beneficiario" con enlace, si no hay destinos | Por fase (máquina abajo) | Comprobante |
| Login y registro | Botón con `aria-busy` | — | Error del formulario o de campo | Redirección al resumen |

**Máquina del intento de transferencia** (D-16, DD-25, DD-32):

```mermaid
stateDiagram-v2
    [*] --> Editando
    Editando --> Confirmando: Continuar, congela datos y genera llave
    Confirmando --> Editando: Editar, descarta la llave
    Confirmando --> Enviando: Enviar, guarda intento en fase creacion
    Enviando --> Comprobante: 201
    Enviando --> Rechazado: 422 u otro 4xx salvo 401
    Enviando --> CapturandoCodigo: 202 de la primera respuesta
    Enviando --> VerificandoEstado: 202 de un reintento o reanudación
    Enviando --> ErrorReintentable: Red, timeout de 15 s, 5xx o 401
    ErrorReintentable --> Enviando: Reintentar con la misma llave
    [*] --> VerificandoAnterior: Hay un intento guardado
    VerificandoAnterior --> Enviando: Fase creacion
    VerificandoAnterior --> ConfirmandoCodigo: Fase confirmacion con código en vuelo
    VerificandoAnterior --> VerificandoEstado: Fase confirmacion sin código en vuelo
    VerificandoEstado --> Comprobante: GET da APLICADA
    VerificandoEstado --> Rechazado: GET da RECHAZADA, o 4xx salvo 401
    VerificandoEstado --> CapturandoCodigo: GET da PENDIENTE_CONFIRMACION
    VerificandoEstado --> ErrorVerificacion: Red, timeout, 5xx o 401
    ErrorVerificacion --> VerificandoEstado: Reintentar el GET
    CapturandoCodigo --> ConfirmandoCodigo: Confirmar, fase confirmacion con el código
    ConfirmandoCodigo --> Comprobante: 201
    ConfirmandoCodigo --> CapturandoCodigo: 422 codigo-incorrecto
    ConfirmandoCodigo --> Rechazado: 422 de rechazo u otro 4xx salvo 401
    ConfirmandoCodigo --> ErrorConfirmacion: Red, timeout, 5xx o 401
    ErrorConfirmacion --> ConfirmandoCodigo: Reintentar la confirmación
    Comprobante --> [*]: Borra el intento
    Rechazado --> [*]: Borra el intento
```

- **Reanudación.** Si al cargar `/transferir` hay un intento en `sessionStorage`, la máquina arranca en un estado `VerificandoAnterior`, que muestra "Verificando operación anterior…" (R-4.25). Según la fase guardada:
  - `creacion`: pasa a `Enviando` y reenvía la creación con la misma llave.
  - `confirmacion` con un código en vuelo: pasa a `ConfirmandoCodigo` y reenvía la confirmación con ese código.
  - `confirmacion` sin código en vuelo (la recarga ocurrió en la pantalla del código): pasa a `VerificandoEstado` y consulta `GET /transferencias/{id}`. Si sigue pendiente, la captura muestra el `codigoSimulado` guardado (DD-25).
  - En fase `confirmacion` **nunca** se reenvía la creación (§6.2).

  No se puede iniciar otro intento hasta resolverlo.
- **Respuestas fuera del caso feliz** (corrección de T-WEB-06). Un resultado incierto nunca cierra el intento: la red, el timeout, **cualquier** `5xx` (no solo el `503`) y un `401` que el refresh no resolvió llevan a `ErrorReintentable`, `ErrorConfirmacion` o `ErrorVerificacion`, que conservan la llave y el intento. Los demás `4xx` (`422` de cualquier tipo, `404`, `400`) cierran el intento en `Rechazado`: la API no guardó nada o guardó un rechazo (§6.2), así que un envío nuevo con una llave nueva no puede duplicar dinero.
- **`ErrorVerificacion`.** Si el `GET` de `VerificandoEstado` falla por red, timeout, `5xx` o `401`, se ofrece "Reintentar", que repite el `GET`. Es una lectura, así que repetirla es seguro.
- **Doble clic y doble Enter** (R-4.21). "Enviar" y "Confirmar" son el botón `submit` de un `<form>`, así que el clic y el Enter pasan por el mismo `onSubmit`. Ese manejador revisa una bandera en `useRef` **antes** de cualquier `setState` y descarta el segundo disparo del mismo ciclo. El botón queda `disabled` con `aria-busy="true"` mientras la petición está en vuelo.
- **Timeout:** `AbortController` de 15 s por petición, igual que en móvil (D-17).
- **Rechazo** (R-4.12): muestra `mensajeDeProblema(type)` y un botón "Nueva transferencia", que vuelve a `Editando` con una llave nueva (R-4.23, R-6.15). Nunca muestra comprobante.
- **`codigoSimulado`:** si viene, se muestra junto a la captura, marcado como "Modo de prueba", y se guarda con el intento (DD-25).

**Formularios** (DD-03, RNF-18):

- React Hook Form con `zodResolver` y los esquemas de `shared` tal cual, sin copiarlos en la web.
- Los mensajes por defecto de Zod (tipo inválido, campo faltante, opción fuera del `enum`) vienen en inglés. La web activa el locale español de Zod (`z.config(es())`, de `zod/locales`) en `src/app/zod-es.ts`. Ese módulo se importa antes que cualquier esquema, en `main.tsx` y en el setup de las pruebas. `shared` y `web` resuelven la misma instalación de `zod`, así que la configuración global también aplica a los esquemas de `shared`. Los mensajes propios de los esquemas (política de contraseñas de §5.1, textos de DD-16 y de `validarClabe`) ya están en español y tienen prioridad sobre el locale.
- La API no activa el locale: el usuario ve el `detail` fijo de §7.1, y los errores de campo de la web salen de su propia validación. La app móvil hace lo mismo que la web en su esqueleto.

**Montos y fechas:**

- El campo de monto es de texto con `inputMode="decimal"`, y se convierte con `montoTextoACentavos` al validar.
- Los saldos y montos se muestran con `formatearMXN`.
- Las fechas se muestran con `Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City' })`. Convertir el instante a `Date` es aceptable aquí, porque solo se usa para mostrarlo (la precisión de milisegundos basta); el cursor nunca pasa por `Date` (D-11).

**Estado de cuenta** (R-B1.6): selector de mes y botón "Descargar CSV". El cliente hace el `fetch` con `Authorization`, recibe un `Blob` y lo descarga con un enlace temporal; el nombre del archivo sale de `Content-Disposition`.

**Accesibilidad** (RNF-19):

- Todo campo tiene un `<label>` asociado. Su error va en un elemento enlazado con `aria-describedby`, y el campo se marca con `aria-invalid`.
- Al fallar un envío, el foco va al primer campo con error.
- Al cambiar de pantalla o de fase, el foco va al encabezado `h1` de la pantalla nueva.
- Los mensajes de estado ("Verificando operación anterior…", intentos restantes) se anuncian en una región `aria-live="polite"`.
- El foco es visible en todos los controles. Los colores se definen como tokens con contraste AA verificado.
- Todos los flujos se completan solo con teclado. No hay acciones que solo respondan al ratón.
- Las pruebas de Testing Library buscan los elementos por rol y por etiqueta, y corren `axe` (`vitest-axe`) sobre login, resumen, historial, beneficiarios y cada fase de la transferencia.

> **DD-43 · Aprobada · Cliente web: refresh con Web Locks, una sola repetición tras `401`, transferencia sin `useMutation` y verificación con `axe`**
> **Contexto:** D-05, D-06 y D-16 fijan los tokens, la coordinación entre pestañas y el ciclo de vida de la llave, pero no la mecánica del cliente.
> **Decisión:**
> - Ante un `401`, el cliente refresca una vez dentro del Web Lock, revisando primero si otra pestaña ya lo hizo, y repite la petición una vez.
> - Al terminar una transferencia, aplicada o rechazada, se invalidan las consultas de TanStack Query de cuentas y movimientos (y de límites). Los datos del servidor siempre pasan por TanStack Query, como pide el enunciado; ningún saldo se actualiza a mano en el cliente.
> - La transferencia es una máquina de estados propia, no un `useMutation`. El doble disparo se bloquea con una bandera en `useRef`. El timeout es de 15 s.
> - El flujo de transferencia es una sola ruta.
> - La accesibilidad se verifica con `axe` en las pruebas.
> **Motivo:** la revisión dentro del lock evita que dos pestañas roten en cadena. Un `setState` no se aplica hasta el siguiente render, y la bandera en `useRef` sí bloquea dos eventos del mismo ciclo, que es justo el doble clic. Los reintentos automáticos de `useMutation` no saben de llaves de idempotencia. Una sola ruta impide que "atrás" y "adelante" del navegador creen intentos. `axe` convierte el "contraste suficiente" y las etiquetas en verificaciones automáticas.

### 13.3 App móvil

**Navegación** (React Navigation, native stack, DD-03):

```mermaid
flowchart TD
    R{Raíz} -->|Sin sesión| L[Login]
    R -->|Con sesión e intento pendiente del usuario| V[Resolviendo transferencia]
    R -->|Con sesión y sin intento pendiente| S[Saldo]
    V -->|Resuelto| S
    S --> M[Movimientos<br/>últimos 20 de la cuenta elegida]
    S --> T[Transferir<br/>beneficiario, origen, monto, concepto, referencia]
    T --> C[Confirmar]
    C --> E[Estado de la transferencia<br/>verificando, código, comprobante, rechazo o desconocido]
    E --> S
```

La raíz monta **un solo stack a la vez** según el estado de la sesión y del intento. Mientras haya un intento sin resolver, el stack con Saldo no existe, así que no hay forma de navegar a otra transferencia (R-4.30, R-4.31).

**Pantallas y estados** (RNF-17):

| Pantalla | Cargando | Vacío | Error | Éxito |
|---|---|---|---|---|
| Login | Botón ocupado | — | Mensaje del formulario | Saldo |
| Saldo | Indicador | — | Mensaje con "Reintentar" | Cuentas con saldo y límite disponible |
| Movimientos | Indicador | "Sin movimientos" | Mensaje con "Reintentar" | Lista de los últimos 20 (`limite = 20`, sin paginar) (R-5.12) |
| Transferir | Indicador mientras cargan cuentas y beneficiarios | "Registra un beneficiario en la web", si no hay ninguno (R-4.26) | Errores de campo | Pasa a Confirmar |
| Estado | "Verificando estado de tu transferencia…" | — | "Estado desconocido" con "Verificar de nuevo" | Comprobante, captura del código o rechazo |

**Sesión** (D-05, D-06, R-1.17):

- El refresh se guarda en `expo-secure-store` con la llave `billetera.refresh`. El access solo vive en memoria.
- Una sola promesa de refresh en vuelo; las peticiones que reciben `401` la esperan.
- **El refresh nuevo se escribe en SecureStore antes de usar el access nuevo.** Si la app muere entre la respuesta del servidor y esa escritura, el refresh guardado ya está usado, el siguiente refresh se detecta como reúso y el usuario vuelve a iniciar sesión. Se acepta: el resultado es seguro (la familia se revoca), aunque incómodo.

**Intento guardado** (`billetera.intento` en SecureStore, D-17, §6.2): `{ usuarioId, llave, cuerpo, fase, transferenciaId?, codigoExpiraEn?, codigoSimulado?, codigo? }`. Mide menos de 1 KB, por debajo del límite práctico de SecureStore (unos 2 KB por valor en iOS). El campo `codigo` solo existe mientras la confirmación está en vuelo.

**Motor de reintentos:**

| Resultado de la petición | Acción |
|---|---|
| `201`, `202` o `422` | Resuelve (§6.2): comprobante, verificación del estado real o captura del código, o rechazo |
| Error de red, timeout de 15 s, `5xx` o `503` | Reintenta con la misma llave a 1, 2, 4, 8 y 16 s. Si `NetInfo` detecta que volvió la conexión, cancela la espera y reintenta de inmediato |
| `401` | Espera la promesa de refresh y reintenta sin consumir un turno de espera (R-4.29). Si el refresh falla, conserva el intento y lleva al login; al volver a entrar el mismo usuario, se reanuda |
| Otro `4xx` (`400`, `404`) | Error definitivo: muestra el mensaje y borra el intento. No ocurre con datos congelados de un intento válido |
| Se agotan los reintentos | "Estado desconocido" con un solo botón, "Verificar de nuevo", que reinicia la serie con la misma llave (R-4.30) |

Un `500` también se reintenta: no hay forma de saber si la transacción alcanzó a confirmarse, y repetir con la misma llave es seguro (D-03).

**Contenido oculto en segundo plano** (RNF-21; cierra la rama "móvil en segundo plano" del interrogatorio):

- Un componente en la raíz escucha `AppState`. Cuando el estado deja de ser `active` (`inactive` en iOS al abrir el selector de apps, `background` en ambos), pinta una capa opaca a pantalla completa con el logo, por encima de toda la navegación. Además, marca el contenido de abajo como oculto para la accesibilidad, para que no lo lea un lector de pantalla.
- En Android, `expo-screen-capture` (`preventScreenCaptureAsync`) activa `FLAG_SECURE`: la miniatura de recientes sale en negro y se bloquean las capturas **y la grabación** de pantalla. Lo controla la variable `EXPO_PUBLIC_BLOQUEAR_CAPTURAS`:
  - `true` en producción: el perfil de compilación de producción de EAS la fija, y la app usa `true` si la variable falta.
  - `false` en desarrollo (`mobile/.env` de ejemplo), porque `FLAG_SECURE` impediría grabar el video de la entrega.
  - La capa opaca de `AppState` **no** depende de esta variable: está siempre activa.
- En iOS, la capa cubre la instantánea que el sistema toma al pasar a `inactive`.
- La capa se quita al volver a `active`. Desbloquear con biometría queda como tarea opcional (`expo-local-authentication`, D-08).

**Pruebas de la app móvil** (`jest-expo`):

- RNF-26: un `fetch` simulado falla dos veces y a la tercera responde `201`. Con temporizadores falsos se verifica que las tres peticiones llevan la misma `Idempotency-Key` y que la app muestra el comprobante.
- Una respuesta `202` en un reintento lleva a `GET /transferencias/{id}` antes de mostrar la captura del código.
- Un intento en fase `confirmacion` reintenta la confirmación, y nunca la creación.
- Un intento guardado de otro usuario no se envía (R-4.31).
- El cambio de `AppState` a `inactive` muestra la capa y oculta los saldos.
- La recuperación de `codigoSimulado` desde el intento guardado (DD-25).
- Una prueba de lint verifica que importar `AsyncStorage` falla (DD-42).

> **DD-44 · Aprobada · Ocultar el contenido en segundo plano con una capa por `AppState` y `FLAG_SECURE` en Android**
> **Contexto:** RNF-21 pide ocultar saldos, movimientos y transferencias al pasar a segundo plano, incluida la vista previa del selector de apps. El interrogatorio dejó el cómo para el diseño.
> **Opciones:** (1) solo una capa con `AppState`; (2) solo `FLAG_SECURE`; (3) las dos.
> **Decisión:** las dos. La capa responde a `inactive` y `background` y está siempre activa. En Android, `FLAG_SECURE` se activa con `expo-screen-capture` según `EXPO_PUBLIC_BLOQUEAR_CAPTURAS`: activo en producción (también si la variable falta) y desactivable en desarrollo, porque bloquea la grabación de pantalla que exige el video de la entrega.
> **Motivo:** en iOS la instantánea del selector se toma al pasar a `inactive`, y solo una capa pintada en ese momento la cubre. En Android, el sistema puede tomar la miniatura antes de que React pinte la capa, y `FLAG_SECURE` la oscurece desde el sistema operativo, sin depender del momento del render.

> **DD-45 · Aprobada · Política de reintentos y persistencia de la sesión en móvil**
> **Contexto:** D-17 fija la espera exponencial, `NetInfo`, los 15 s y "Estado desconocido", pero no qué respuestas se reintentan ni en qué orden se guardan los tokens.
> **Decisión:**
> - Se reintentan los errores de red, el timeout y todo `5xx`.
> - Un `401` refresca y reintenta sin consumir espera.
> - Un `4xx` distinto de `401` y `422` es definitivo.
> - El refresh rotado se escribe en SecureStore antes de usar el access nuevo.
> **Motivo:** después de un `5xx`, el cliente no puede saber si el servidor confirmó la transacción, y la llave hace seguro repetir. Un `4xx` de validación no cambia al repetir. Escribir el refresh primero minimiza la ventana en la que un cierre forzado de la app dejaría guardado un refresh ya usado; si ocurre, el resultado es seguro (revocación y nuevo login).

---

## 14. Estrategia de pruebas y CI

### 14.1 Niveles

| Nivel | Paquete y herramienta | Qué cubre | Requisitos |
|---|---|---|---|
| Unitarias | `shared`, Vitest | `validarClabe` y `digitoVerificador` (incluidos el dígito 0 y la CLABE de Fondeo), `montoTextoACentavos`, `formatearMXN`, `centavosATextoDecimal`, `instanteIso`, esquemas Zod, prueba de tipos contra los tipos generados (DD-27) | RNF-22, R-3.4, R-4.33, R-2.5 |
| Unitarias | `api`, Vitest | Dominio puro: clasificación, orden de validación (DD-31), hash de petición (§6.2), `respuestaDeTransferencia`, contraparte (§8.1), cursor (§8.3), construcción de la consulta del historial (DD-37), CSV (§9), enmascarado (§10.1), configuración (§2.4) | RNF-22, RNF-15 |
| Integración | `api`, Vitest + Supertest contra `billetera_test` | Todos los flujos HTTP contra PostgreSQL real (§14.2) | RNF-23 |
| Concurrencia | `api`, Vitest | 100 transferencias simultáneas y escenarios de §14.3 | RNF-24 |
| Componentes | `web`, Vitest + Testing Library + `vitest-axe` | Flujo de transferencia y pantallas (§13.2) | RNF-25, RNF-19 |
| Componentes | `mobile`, `jest-expo` + Testing Library de React Native | Reintentos, reanudación y segundo plano (§13.3) | RNF-26, RNF-21 |

### 14.2 Integración contra PostgreSQL

**Preparación.** Un `globalSetup` revierte todas las migraciones de `billetera_test` y las aplica desde cero con el rol dueño, de modo que el esquema es exactamente el de las migraciones y no quedan datos de corridas anteriores. Cada archivo de pruebas vacía las tablas de datos (`TRUNCATE … CASCADE`, conservando Fondeo) y crea sus usuarios. El `globalSetup` y la limpieza **se niegan a correr** (lanzan antes de tocar nada) si la base de la URL no se llama exactamente `billetera_test`, para que una variable mal puesta nunca vacíe otra base. La API de prueba se conecta como `billetera_app`, igual que en producción, con `RelojFijo` cuando la prueba controla la hora y `ProveedorOtpSimulado`.

**Conexión de las pruebas.** `npm run test:integracion -w api` usa su propia configuración de Vitest (`api/vitest.integracion.config.ts`, solo `test/integracion/**` y `test/concurrencia/**`, archivos en serie, con el mismo `globalSetup` y las mismas invariantes). `npm test -w api` no la incluye, así que corre sin base. Las URLs salen de dos variables propias de las pruebas, que **no forman parte del esquema de configuración de la API** (§2.4):

| Variable | Rol | Valor por defecto (base local de `init.sql`) |
|---|---|---|
| `PRUEBAS_DATABASE_URL` | `billetera_app` | `postgresql://billetera_app:billetera_app_dev@127.0.0.1:5433/billetera_test` |
| `PRUEBAS_DATABASE_URL_MIGRACIONES` | `billetera_owner` | `postgresql://billetera_owner:billetera_owner_dev@127.0.0.1:5433/billetera_test` |

En CI se fijan con las del *service container* (§14.5).

**Invariantes después de cada prueba.** Un `afterEach` global verifica, como el rol dueño:

- `saldo_centavos = SUM(asiento.monto_centavos)` para toda cuenta (D-01);
- `SUM(saldo_centavos) = 0` sobre todas las cuentas (D-02);
- ninguna transferencia `APLICADA` sin sus dos asientos, ni asientos en una no aplicada (DD-17).

Una prueba que deje la base fuera de cuadre falla, aunque sus propias aserciones pasen.

**Cobertura mínima por área**

| Área | Casos | Requisitos |
|---|---|---|
| Registro | Crea usuario, dos cuentas con CLABE válida, fondeo y eventos. Si se fuerza un fallo dentro de la transacción, no queda nada. Correo duplicado: `409`. Rate limit | R-1.1 a R-1.5, R-1.18 |
| Sesión | Login correcto e incorrecto con el mismo `401`; rotación; reúso que revoca la familia y audita; vencimiento absoluto (DD-30); cookie con sus atributos y sin refresh en el cuerpo para la web; `X-Requested-With` obligatorio; logout | R-1.6 a R-1.13, R-1.16 |
| Cuentas y beneficiarios | Solo las propias; ajenas dan `404`; Fondeo nunca aparece; los tres pasos de validación de la CLABE en orden; `clabe-not-found`; duplicados `409`; CLABE propia permitida | R-2.1 a R-2.4, R-3.1 a R-3.11 |
| Transferencias | Aplicada (`201`, saldos y asientos); saldo insuficiente (`422`, fila `RECHAZADA` sin asientos); misma cuenta (`422` y rechazo también por SQL directo); destino ajeno `404`; traspaso sin código y fuera del límite | R-4.1 a R-4.10 |
| Idempotencia | Repetición idéntica (mismo código y cuerpo, salvo `codigoSimulado`, DD-25); cuerpo distinto `422`; misma llave con dos usuarios; repetición de un `202` después de aplicar la transferencia (DD-32); reintento tras `503` | R-4.13 a R-4.17, R-4.19 |
| Límite diario | Exactamente en el límite; un centavo más; traspasos y depósitos no cuentan; medianoche con `RelojFijo` (los cuatro escenarios de §6.4) | R-6.1 a R-6.7 |
| Código | Umbral estricto; `202` sin mover dinero; correcto aplica; incorrecto cuenta y audita aunque la respuesta sea `422`; tercer fallo agota; vencido expira al confirmar y al consultar; confirmar una aplicada repite el `201`; confirmar una ajena da `404` | R-6.8 a R-6.17 |
| Historial | Orden; tamaño de página; `siguienteCursor` nulo al final; 25 movimientos con el mismo instante; filtros de fecha en hora local; filtro por tipo; cursor de otros filtros o de otra cuenta da `invalid-cursor` | R-5.1 a R-5.10 |
| Estado de cuenta | Casos de §9 | R-B1.1 a R-B1.5 |
| Integridad y permisos | Tablas de DD-17 y DD-18; `search_path` de las funciones `SECURITY DEFINER` | RNF-06, RNF-07, RNF-11 |
| Errores | Cada `type` del catálogo (§7.2); error interno sin filtraciones (§7.4); cada respuesta validada contra `openapi.yaml` (DD-27) | RNF-01 |
| Logs y auditoría | Prueba de fugas (§10.1); eventos de cada flujo (§10.2) | RNF-11, RNF-12 |

### 14.3 Concurrencia

| Escenario | Configuración | Verifica | Requisitos |
|---|---|---|---|
| **100 transferencias simultáneas desde una cuenta** | Pool de 10 conexiones. Saldo inicial para unas 60 transferencias de monto fijo, todas a tercero bajo el umbral y con el límite configurado alto para la prueba | `aplicadas × monto + saldo final = saldo inicial`; aplicadas + rechazadas = 100; cada rechazada con `SALDO_INSUFICIENTE`; `saldo = SUM(asientos)` y `SUM(saldos) = 0`; **cero deadlocks**, contando los reintentos por `40P01` en el log `warn` | RNF-24, R-4.18 |
| Cruzadas | A envía a B y B envía a A, 50 de cada lado, al mismo tiempo | Cero deadlocks e invariantes | D-12 |
| Límite con dos cuentas | Un usuario lanza a la vez transferencias a tercero desde `Principal` y desde `Ahorro`, que juntas superan el límite | Lo aplicado nunca supera el límite | R-6.4 |
| Misma llave | 10 peticiones simultáneas con la misma llave y el mismo cuerpo | Una sola transferencia y 10 respuestas idénticas | R-4.16 |
| Cursor con escrituras | Transferencias concurrentes hacia una cuenta mientras se recorre su historial | Sin huecos ni repetidos (DD-36) | R-5.4 |

### 14.4 Trazabilidad en las pruebas

El nombre de cada prueba empieza con los IDs que verifica: `it('R-4.14 repetición con la misma llave devuelve el mismo cuerpo', …)`. Así, `grep "R-4.14"` lleva del requisito a su prueba, y la matriz de §17 se puede comprobar contra el código.

### 14.5 CI (GitHub Actions)

`.github/workflows/ci.yml` corre en cada `push` y en cada pull request contra `main`, con Node 24 y la caché de npm (RNF-29).

| Job | Pasos |
|---|---|
| `calidad` | `npm ci`; compilar `shared`; `npm run lint`; `npm run lint:verificar-reglas` (DD-42); `npm run typecheck`; `redocly lint specs/openapi.yaml`; `npm run gen:tipos` y `git diff --exit-code` (DD-27) |
| `unitarias` | Pruebas de `shared`, `api` (unitarias) y `web` |
| `integracion` | *Service container* `postgres:17`; después del checkout, un paso ejecuta `docker/postgres/init.sql` con `psql` como superusuario; `npm run test:integracion -w api` (integración y concurrencia), con `PRUEBAS_DATABASE_URL*` apuntando al contenedor (§14.2) |

**Por qué `init.sql` se ejecuta y no se monta.** GitHub Actions arranca los *service containers* antes de los pasos del job, es decir, antes del checkout, así que el archivo todavía no existe en el runner y no se puede montar en `/docker-entrypoint-initdb.d`. El paso con `psql -v ON_ERROR_STOP=1 -f docker/postgres/init.sql` aplica el mismo archivo que usa Docker Compose en local (DD-06), y falla el job si alguna sentencia falla.
| `movil` | Pruebas de `mobile` con `jest-expo` |

Los cuatro jobs son obligatorios para fusionar a `main`, y `main` debe quedar en verde (RNF-29).

> **DD-46 · Aprobada · Invariantes después de cada prueba de integración e IDs en el nombre de cada prueba**
> **Contexto:** RNF-23 y RNF-24 piden cubrir idempotencia, límite, saldo y concurrencia; RNF-33 pide trazabilidad hasta la prueba.
> **Decisión:**
> - Un `afterEach` global verifica las invariantes de D-01, D-02 y DD-17 después de **cada** prueba de integración.
> - Cada prueba nombra en su título los IDs `R-`, `RNF-` o `DD-` que verifica.
> - El CI tiene cuatro jobs obligatorios.
> **Motivo:** una prueba de un flujo pensaría en sus propias aserciones y no en el cuadre global. El `afterEach` convierte cada prueba en una prueba de "el dinero siempre cuadra", que es lo que el enunciado más valora. Los IDs en el título cierran la cadena requerimiento → diseño → tarea → commit → prueba sin herramientas extra.

---

## 15. Resolución de pendientes

### 15.1 Ramas del interrogatorio y pendientes de `requirements.md` §12

| Origen | Pendiente | Resuelto en | Decisión |
|---|---|---|---|
| Rama del interrogatorio (`ai-log.md`) | Parámetros de rate limiting | §11 | DD-41 |
| Rama del interrogatorio | Catálogo de auditoría | §10.2 | DD-40 |
| Rama del interrogatorio | Enmascaramiento en logs | §10.1 | DD-39 |
| Rama del interrogatorio | Catálogo de errores RFC 7807 | §4.1, §7 | DD-23, DD-35 |
| Rama del interrogatorio | Ocultar contenido en segundo plano en móvil | §13.3 | DD-44 |
| Rama del interrogatorio | Política de contraseñas | §5.1 | DD-28 |
| `requirements.md` §12.1 | Política de contraseña | §5.1 | DD-28 |
| `requirements.md` §12.2 | Códigos HTTP del correo y del beneficiario duplicados | §4.1, §7.2 | DD-23 (`409`) |
| `requirements.md` §12.3 | Longitudes de nombre, alias, concepto y referencia | §3.2, §6.7 | DD-16 |
| `requirements.md` §12.4 | Umbrales y ventanas del rate limit | §11 | DD-41 |
| `requirements.md` §12.5 | Contenido del comprobante | §6.6 | DD-34 |
| `requirements.md` §12.6 | Datos enmascarados en logs, incluida la CLABE | §10.1 | DD-39 |
| `requirements.md` §12.7 | CSV de un mes sin movimientos | §9 | DD-38 |

Queda un solo pendiente abierto, a propósito: **§8.5 `EXPLAIN ANALYZE`**, que depende del seed y se cierra en su tarea de implementación.

### 15.2 Para "qué haría con más tiempo" del README

Además de los elementos de `requirements.md` §11, el diseño agregó estos (RNF-31):

| Elemento | Origen |
|---|---|
| Registro con verificación por correo, para que el registro no revele qué correos existen | DD-23 |
| Volver a calcular el hash de una contraseña al subir los parámetros de argon2id | DD-28 |
| Llave de idempotencia también en la confirmación, para que reintentar un código incorrecto no consuma otro intento | §6.2 |
| Rate limit general por usuario en las rutas autenticadas | §11 |
| Firma asimétrica del access (RS256 o EdDSA) cuando otro servicio tenga que verificar tokens | DD-29 |
| Varias subcuentas de Fondeo para repartir el punto caliente del registro | §6.3, D-20 |
| Desbloqueo biométrico en móvil, si no entra como tarea opcional | §13.3, D-08 |

### 15.3 Para `docs/aws-deploy.md`

El diseño dejó estos puntos para la propuesta de AWS (RNF-30):

| Punto | Origen |
|---|---|
| `TRUST_PROXY` con el número exacto de saltos detrás de CloudFront y el ALB | §11, DD-41 |
| Redis (ElastiCache) como almacén del rate limit con varias instancias | DD-41 |
| Destino y retención de los logs y de la auditoría | §10 |
| Secretos (`JWT_SECRETO`, `OTP_HMAC_SECRETO`, credenciales de los dos roles) en Secrets Manager, con migraciones ejecutadas por el rol dueño desde el pipeline | §2.4, §3.4 |
| Punto caliente de Fondeo en el escenario ×100 | §6.3, D-20 |
| Métricas, trazas y alarmas | §10.3 |

---

## 16. Decisiones nuevas de diseño

Las 46 decisiones tomadas en este documento. La columna "Relación" indica qué decisión o requisito existente precisan, completan o exceptúan; las que no tienen relación solo resuelven algo que `decisiones.md` no cubría. Esta tabla es la única fuente de las decisiones de diseño (§0.2); `decisiones.md` remite aquí.

| ID | Decisión | Sección | Relación | Estado |
|---|---|---|---|---|
| DD-01 | Versiones mayores del stack | §1.1 | Enunciado Fase 2 | Aprobada |
| DD-02 | Librerías de la API | §1.1 | — | Aprobada |
| DD-03 | Librerías de los clientes | §1.1 | — | Aprobada |
| DD-04 | Ejecutores de pruebas | §1.1 | — | Aprobada |
| DD-05 | Compilación del paquete compartido y ejecución de migraciones | §1.2, §3.5 | Enunciado Fase 2 (migraciones con TypeORM) | Aprobada |
| DD-06 | Base de datos local en Docker con base de pruebas separada | §1.3 | — | Aprobada |
| DD-07 | Las marcas de tiempo de negocio salen del `Reloj` y viajan como texto | §2.1 | Precisa D-11 y D-15; precisada por DD-36 | Aprobada |
| DD-08 | Capas con regla de imports y composición manual | §2.1 | RNF-16 | Aprobada |
| DD-09 | El request ID viaja en el header, no en el cuerpo del problem | §2.2 | Protege R-4.14 | Aprobada |
| DD-10 | Timeouts de bloqueo y de sentencia responden `503` sin reintento en el servidor | §2.3 | Precisa D-12 | Aprobada |
| DD-11 | Convenciones de tipos y llaves | §3.1 | — | Aprobada |
| DD-12 | Columnas de la transferencia de fondeo | §3.2 | Precisa D-02 | Aprobada |
| DD-13 | Tipo de movimiento `FONDEO_SALIDA` | §3.2 | **Completa D-09** | Aprobada |
| DD-14 | El código usa `transferencia_id` como llave primaria, sin columna `usado` | §3.2 | Precisa D-07 | Aprobada |
| DD-15 | La auditoría no tiene llaves foráneas | §3.2 | — | Aprobada |
| DD-16 | Longitudes y caracteres de los campos de texto | §3.2 | Cierra `requirements.md` §12.3 | Aprobada |
| DD-17 | La base valida la clasificación y la coherencia completa de cada transferencia | §3.3 | Amplía D-04 y D-14 | Aprobada |
| DD-18 | El rol de la API no puede escribir saldos ni borrar nada | §3.4 | Amplía D-01 | Aprobada |
| DD-19 | Generación de CLABE aleatoria y validación también en la base | §3.6 | Precisa D-19 | Aprobada |
| DD-20 | Seed en dos fases y datos de volumen fuera del límite diario | §3.7 | Precisa D-13 y D-20 | Aprobada |
| DD-21 | JSON en camelCase, sin versión en la ruta y listas envueltas | §4.1 | Renombra el campo de R-4.8, R-4.35 y D-18 a `montoCentavos` | Aprobada |
| DD-22 | Formato de los instantes en la API | §4.1 | — | Aprobada |
| DD-23 | Formato del `type` de los problemas y códigos de los duplicados | §4.1 | Precisa R-4.3; cierra §12.2; concesión frente a R-1.7 | Aprobada |
| DD-24 | Transporte del refresh token entre web y móvil | §4.2 | Precisa D-06 | Aprobada |
| DD-25 | La repetición de un `202` no incluye `codigoSimulado` | §4.2 | **Única excepción a R-4.14** | Aprobada |
| DD-26 | El destino de una transferencia es una unión discriminada | §4.2 | — | Aprobada |
| DD-27 | Verificación del contrato y documentación solo fuera de producción | §4.3 | RNF-18, RNF-28 | Aprobada |
| DD-28 | Política de contraseñas y parámetros de argon2id | §5.1 | Cierra §12.1 | Aprobada |
| DD-29 | JWT con HS256 y sin revocación del access | §5.2 | Precisa D-05 | Aprobada |
| DD-30 | La familia de sesión vence 7 días después del login | §5.3 | Precisa D-05 | Aprobada |
| DD-31 | Saldo y límite se validan también al crear una pendiente, saldo primero | §6.1 | Precisa D-14 | Aprobada |
| DD-32 | La repetición devuelve la respuesta original; reanudación por fase en los clientes | §6.2 | Precisa D-03, **D-16 y D-17** | Aprobada |
| DD-33 | El HMAC del código incluye el id de la transferencia; el fallo informa los intentos restantes | §6.5 | Precisa D-07 | Aprobada |
| DD-34 | Contenido del comprobante | §6.6 | Cierra §12.5 | Aprobada |
| DD-35 | Traducción de errores por nombre de restricción, con textos fijos | §7.3 | RNF-01 | Aprobada |
| DD-36 | El instante de aplicación se lee con `clock_timestamp()` después de bloquear las cuentas | §8.3 | **Precisa DD-07 y D-11** | Aprobada |
| DD-37 | Consulta del historial con fragmentos fijos y contraparte sin datos del titular | §8.4 | Precisa D-11 | Aprobada |
| DD-38 | Formato del CSV con saldo acumulado, mes vacío y respuestas sin caché | §9 | Precisa D-08; cierra §12.7 | Aprobada |
| DD-39 | Cuerpos nunca registrados, enmascarado de correo y CLABE, contexto por `AsyncLocalStorage` | §10.1 | Cierra §12.6 | Aprobada |
| DD-40 | Catálogo de auditoría y auditoría dentro de la transacción del negocio | §10.2 | Amplía RNF-11 | Aprobada |
| DD-41 | Umbrales del rate limit y almacén en memoria | §11 | Cierra §12.4 | Aprobada |
| DD-42 | Reglas de lint para el dinero y el almacenamiento móvil | §13.1 | Amplía D-18 | Aprobada |
| DD-43 | Cliente web: refresh con Web Locks, una repetición tras `401`, transferencia sin `useMutation`, `axe` | §13.2 | Precisa D-05, D-06 y D-16 | Aprobada |
| DD-44 | Ocultar el contenido en segundo plano con una capa por `AppState` y `FLAG_SECURE` en Android | §13.3 | RNF-21 | Aprobada |
| DD-45 | Política de reintentos y persistencia de la sesión en móvil | §13.3 | Precisa D-17 | Aprobada |
| DD-46 | Invariantes después de cada prueba de integración e IDs en el nombre de cada prueba | §14.5 | RNF-23, RNF-24, RNF-33 | Aprobada |

---

## 17. Matriz de trazabilidad

Cada criterio de `requirements.md` y la sección de este documento que lo resuelve. Las pruebas de cada criterio se localizan por su ID en el nombre de la prueba (§14.4).

### 17.1 HU-1 · Registro e inicio de sesión

| Criterio | Secciones |
|---|---|
| R-1.1 | §2.1 (`identidad`), §3.2 (`cuenta`), §3.6, §12.1 |
| R-1.2 | §6.3, §10.2, §12.1 |
| R-1.3 | §2.3, §12.1, §14.2 |
| R-1.4 | §4.1 (DD-23), §7.2, §7.3 |
| R-1.5 | §5.1, §7.2 |
| R-1.6 | §5.2, §5.3 |
| R-1.7 | §5.1, §7.2 |
| R-1.8 | §5.3, §12.2 |
| R-1.9 | §5.3, §10.2, §12.2 |
| R-1.10 | §5.3 |
| R-1.11 | §2.2, §5.2 |
| R-1.12 | §5.3, §6.2, §13.2, §13.3 |
| R-1.13 | §4.2 (DD-24), §5.3 |
| R-1.14 | §13.2 |
| R-1.15 | §5.3, §13.2 |
| R-1.16 | §5.4 |
| R-1.17 | §5.3, §13.3 |
| R-1.18 | §11 |

### 17.2 HU-2 · Cuentas y saldo

| Criterio | Secciones |
|---|---|
| R-2.1 | §3.2, §4.2 |
| R-2.2 | §3.3 |
| R-2.3 | §3.2, §4.2, §6.1 |
| R-2.4 | §7.2 |
| R-2.5 | §13.1 |
| R-2.6 | §13.2, §13.3 |

### 17.3 HU-3 · Beneficiario con CLABE

| Criterio | Secciones |
|---|---|
| R-3.1 | §3.2 (`beneficiario`), §4.2 |
| R-3.2 | §3.6, §4.2, §13.1 |
| R-3.3 | §7.2, §13.1 |
| R-3.4 | §3.6, §13.1 |
| R-3.5 | §3.3 (`validar_beneficiario`), §7.2 |
| R-3.6 | §4.2, §6.6, §8.1 |
| R-3.7 | §3.2, §7.3 |
| R-3.8 | §3.3, §4.2 (DD-26) |
| R-3.9 | §11 |
| R-3.10 | §13.1, §13.2 |
| R-3.11 | §4.2, §7.2 |
| R-3.12 | §3.6, §3.7 |

### 17.4 HU-4 · Transferencia

| Criterio | Secciones |
|---|---|
| R-4.1 | §3.3, §6.1, §12.3 |
| R-4.2 | §3.3 (DD-17), §6.1 |
| R-4.3 | §6.1, §6.2, §7.2 |
| R-4.4 | §3.2, §6.1 |
| R-4.5 | §6.1, §6.4 |
| R-4.6 | §6.1, §7.2 |
| R-4.7 | §3.3, §6.1 |
| R-4.8 | §4.1, §6.7 |
| R-4.9 | §3.2, §6.7 |
| R-4.10 | §4.2, §6.5 |
| R-4.11 | §6.6, §13.2, §13.3 |
| R-4.12 | §12.3, §13.2, §13.3 |
| R-4.13 | §6.2 |
| R-4.14 | §6.2, §12.5 |
| R-4.15 | §6.2 |
| R-4.16 | §6.1, §6.2, §12.5 |
| R-4.17 | §3.2, §6.2 |
| R-4.18 | §6.1, §6.3 |
| R-4.19 | §2.3, §6.3 |
| R-4.20 a R-4.25 | §6.2 (reanudación), §12.6, §13.2 |
| R-4.26 a R-4.32 | §6.2 (reanudación), §12.7, §13.3 |
| R-4.33 a R-4.35 | §4.1, §6.7, §13.1 |

### 17.5 HU-5 · Historial

| Criterio | Secciones |
|---|---|
| R-5.1 | §8.1 |
| R-5.2 | §8.1 |
| R-5.3 | §4.2, §8.3 |
| R-5.4 | §8.3 (DD-36) |
| R-5.5 | §8.4 |
| R-5.6 | §8.1, §8.2 |
| R-5.7 | §8.3 |
| R-5.8 | §8.1 |
| R-5.9 | §8.1 |
| R-5.10 | §8.1 |
| R-5.11 | §13.2 |
| R-5.12 | §13.3 |

### 17.6 HU-6 · Límite diario y código

| Criterio | Secciones |
|---|---|
| R-6.1 | §6.4 |
| R-6.2 | §6.1, §7.2 |
| R-6.3 | §6.4 |
| R-6.4 | §6.1, §6.3 |
| R-6.5 | §6.4 |
| R-6.6 | §6.4, §8.3 (DD-36) |
| R-6.7 | §6.4 |
| R-6.8 | §6.1, §6.5 |
| R-6.9 | §6.1 |
| R-6.10 a R-6.14 | §6.5 |
| R-6.15 | §6.5, §13.2 |
| R-6.16 | §6.5, §10.1 |
| R-6.17 | §2.4, §4.2 (DD-25) |
| R-6.18 | §13.2, §13.3 |

### 17.7 HU-B1 · Estado de cuenta CSV

| Criterio | Secciones |
|---|---|
| R-B1.1 a R-B1.5 | §9 |
| R-B1.6 | §13.2 |

### 17.8 Requisitos no funcionales

| Requisito | Secciones |
|---|---|
| RNF-01 | §7 |
| RNF-02 | §5.2, §5.3 |
| RNF-03 | §5.1 |
| RNF-04 | §11 |
| RNF-05 | §5.4 |
| RNF-06 | §3.2, §3.3 |
| RNF-07 | §3.3, §3.4 |
| RNF-08 | §2.3, §6.3 |
| RNF-09 | §2.3 (parsers de `pg`), §13.1 |
| RNF-10 | §2.1 (DD-07), §6.4, §8.3 (DD-36) |
| RNF-11 | §3.4, §10.2 |
| RNF-12 | §10.1 |
| RNF-13 | §8.3 |
| RNF-14 | §8.2, §8.5 |
| RNF-15 | §2.4 |
| RNF-16 | §1.1, §2, §3.5 |
| RNF-17 | §13.2, §13.3 |
| RNF-18 | §4.3, §13.1 |
| RNF-19 | §13.2 |
| RNF-20 | §13.1 (DD-42), §13.3 |
| RNF-21 | §13.3 |
| RNF-22 a RNF-24 | §14.1 a §14.3 |
| RNF-25 | §13.2, §14.1 |
| RNF-26 | §13.3, §14.1 |
| RNF-27 | §1.3, §3.7 |
| RNF-28 | §4.3 |
| RNF-29 | §14.5 |
| RNF-30 | Fuera de este documento: `docs/aws-deploy.md`. Sus insumos de diseño están en §15.3 |
| RNF-31 | Fuera de este documento: `README.md`. Sus insumos de diseño están en §1.3 y §15.2 |
| RNF-32 | §1.3; las instrucciones van en el README |
| RNF-33 | §0, §14.4; la trazabilidad de tareas y commits va en `tasks.md` |

### 17.9 Casos borde del enunciado

| Caso | Secciones |
|---|---|
| CB-1 Doble clic en "Enviar" | §6.2, §12.5, §12.6, §13.2 |
| CB-2 Pérdida de red en móvil | §6.2, §12.7, §13.3 |
| CB-3 Redondeo | §2.3, §4.1, §9, §13.1 |
| CB-4 Límite que cruza medianoche | §6.4, §8.3 (DD-36) |
| CB-5 Transferencia a la propia cuenta | §3.2, §3.3, §6.1 |
