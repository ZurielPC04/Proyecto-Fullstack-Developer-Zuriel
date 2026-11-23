# Proyecto Fullstack Developer Zuriel

Billetera digital en un monorepo con npm workspaces: API en Express y PostgreSQL, web en React y app móvil en Expo. Los montos viajan y se guardan como centavos enteros en todo el sistema.

| Carpeta | Contenido |
|---|---|
| `packages/shared` | Dinero, CLABE, tiempo, errores RFC 7807, esquemas Zod y tipos generados de `specs/openapi.yaml` |
| `api` | API REST (Express 5, TypeORM, PostgreSQL 17) |
| `web` | Web (React, Vite) |
| `mobile` | App móvil (Expo SDK 58, React Native) |
| `specs` | `requirements.md`, `design.md`, `tasks.md`, `ai-log.md`, `decisiones.md` y `openapi.yaml` |
| `docs` | [`aws-deploy.md`](docs/aws-deploy.md) (propuesta de producción en AWS) |

## Índice

1. [Requisitos previos](#requisitos-previos)
2. [Correr en local](#correr-en-local)
3. [Base de datos local](#base-de-datos-local)
4. [App móvil](#app-móvil)
5. [Pruebas](#pruebas)
6. [Pruebas en Windows](#pruebas-en-windows)
7. [Dependencias y `npm audit`](#dependencias-y-npm-audit)
8. [Video](#video)
9. [Qué haría con más tiempo](#qué-haría-con-más-tiempo)

## Requisitos previos

- **Node 24.** La versión está en `.nvmrc` (`nvm use` la toma). Solo se usa `npm`; no `pnpm` ni `yarn`.
- **Docker Desktop.** En Windows requiere el **backend WSL2**.
- **Chrome, Edge o Firefox** para la web. Tratan `localhost` como contexto seguro y aceptan la cookie `Secure` del refresh sin HTTPS. No hay una bandera para desactivar `Secure`.
- **Para la app móvil:** Expo Go para SDK 58 en un teléfono Android o iPhone de la misma red, o un emulador de Android o simulador de iOS. Ver [App móvil](#app-móvil).

## Correr en local

```sh
npm ci
cp api/.env.example api/.env
```

En `api/.env`, llena `JWT_SECRETO` y `OTP_HMAC_SECRETO` con dos valores distintos de 32 bytes o más; sin ellos la API no arranca. Genera cada uno con:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Después:

```sh
npm run db:up        # PostgreSQL 17 en Docker (localhost:5433)
npm run db:migrate   # migraciones con el rol dueño
npm run db:seed      # usuarios demo y 120,000 asientos o más
npm run dev          # API en :3000 y web en :5173
```

- **Web:** <http://localhost:5173>
- **Swagger UI:** <http://localhost:3000/api/docs> (el contrato en <http://localhost:3000/api/openapi.yaml>)

**Usuarios demo.** Contraseña de los dos: `demo billetera 2026`.

| Usuario | Saldo de `Principal` | Para mostrar | CLABE `Principal` | CLABE `Ahorro` |
|---|---|---|---|---|
| `ana@demo.mx` | $80,000.00 | Transferencia normal (≤ $10,000), con código (> $10,000) y, después de esas dos, límite diario excedido ($50,000) | `999180000000000015` | `999180000000000028` |
| `beto@demo.mx` | $500.00 | Saldo insuficiente | `999180000000000031` | `999180000000000044` |

- Cada uno ya tiene registrado al otro como beneficiario.
- Con `OTP_SIMULADO=true` (valor de `.env.example`), el código de un solo uso aparece en la pantalla de captura como "Modo de prueba".
- `npm run db:seed` vacía y regenera todo con una semilla fija: córrelo de nuevo para volver a los saldos de la tabla.

**El volumen del seed no respeta el límite diario (DD-20).** Los 200 usuarios sintéticos y la cuenta `carga@demo.mx` existen solo para medir el historial con 100,000 movimientos o más (`npm run db:explicar`, `specs/design.md` §8.5). Se insertan por SQL con todos los triggers activos (saldo no negativo, suma cero, clasificación y fechas), pero el límite diario es una regla de la aplicación y no de la base, así que esas cuentas lo superan. Los usuarios demo sí pasan por los casos de uso reales y respetan todas las reglas.

## Base de datos local

```sh
npm run db:up
```

Levanta PostgreSQL 17 en Docker, en `localhost:5433`, con las bases `billetera` y `billetera_test`.

Si el puerto `5433` está ocupado, cámbialo con la variable `POSTGRES_PORT`, en el shell o en un archivo `.env` en la raíz (por ejemplo, `POSTGRES_PORT=5434`), y usa el mismo puerto en las URL de `api/.env`.

## App móvil

La app habla directo con la API (sin el proxy de Vite ni cookies). Un teléfono físico **no** puede usar `localhost`: ahí `localhost` es el propio teléfono.

### 1. Instalar Expo Go para SDK 58

Expo Go para SDK 58 **no está en Play Store**. Se instala de una de dos formas:

- Con el teléfono conectado por USB y la depuración USB activada, corre `npm run mobile` y presiona **`a`**: Expo instala la versión correcta de Expo Go y abre la app. Requiere `adb`, de las [Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools), en el `PATH`.
- Descargándola desde <https://expo.dev/go> y eligiendo SDK 58.

### 2. Configurar la URL de la API

```sh
cp mobile/.env.example mobile/.env
```

En `mobile/.env`, fija `EXPO_PUBLIC_API_URL` con **la IP de la computadora en la red local**:

- **Windows:** `ipconfig`, campo "Dirección IPv4" del adaptador Wi-Fi o Ethernet que usas (por ejemplo, `192.168.1.50`).
- **macOS:** `ipconfig getifaddr en0`.

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000/api
```

- **Teléfono y computadora en la misma red.**
- **La IP puede cambiar** al reconectar el Wi-Fi. Revísala con `ipconfig` antes de cada sesión de pruebas y, si cambió, actualiza `mobile/.env` y reinicia `npm run mobile`.
- **Emulador de Android:** usa `http://10.0.2.2:3000/api`, que es el `localhost` de la computadora visto desde el emulador. El simulador de iOS sí puede usar `http://localhost:3000/api`.
- `EXPO_PUBLIC_BLOQUEAR_CAPTURAS=false` (valor de `.env.example`) desactiva FLAG_SECURE en Android para poder grabar la pantalla. Si falta o tiene otro valor, se bloquean las capturas, como en producción. La capa que oculta saldos en el selector de apps está siempre activa (DD-44).

### 3. Firewall de Windows

Permite las conexiones entrantes a los puertos **3000** (API) y **8081** (Metro) solo en **redes privadas**, y marca tu Wi-Fi como red privada. En PowerShell como administrador:

```powershell
New-NetFirewallRule -DisplayName "Billetera API 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Profile Private -Action Allow
New-NetFirewallRule -DisplayName "Billetera Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Profile Private -Action Allow
```

### 4. Arrancar

Con la API corriendo (`npm run dev`):

```sh
npm run mobile
```

Escanea el QR con Expo Go (Android) o con la cámara (iOS), o presiona `a` con el teléfono conectado por USB.

**Varios adaptadores de red** (VirtualBox, WSL, Hyper-V, VPN): Metro puede anunciar la IP equivocada en el QR. Arranca indicando la IP de la LAN:

```sh
# Git Bash
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.50 npm run mobile
```

```powershell
# PowerShell
$env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.1.50"; npm run mobile
```

### Alternativa sin Wi-Fi: cable USB con `adb reverse`

Si la red no deja que el teléfono vea la computadora (Wi-Fi de oficina, aislamiento de clientes), el cable USB sirve de túnel:

1. En `mobile/.env`: `EXPO_PUBLIC_API_URL=http://localhost:3000/api`.
2. Crea los dos túneles:

   ```sh
   adb reverse tcp:8081 tcp:8081
   adb reverse tcp:3000 tcp:3000
   ```

3. Arranca Metro solo en `localhost`:

   ```sh
   npm run build:shared
   cd mobile
   npx expo start --localhost
   ```

4. **Presionar `a` borra los reverses.** Después de abrir la app con `a`, vuelve a crear el del 3000 (`adb reverse tcp:3000 tcp:3000`); el del 8081 lo recrea Expo. Revisa los activos con `adb reverse --list`.

## Pruebas

```sh
npm test                               # unitarias de shared, api, web y mobile
npm run db:up                          # requisito de la integración
npm run test:integracion -w api        # integración y concurrencia contra billetera_test
npm run trazabilidad                   # cada R- y RNF- tiene prueba y commit (RNF-33)
```

`npm run trazabilidad` busca cada `R-` y `RNF-` de `specs/requirements.md` en los títulos de las pruebas y en los mensajes de commit. Exime de prueba solo a los criterios de documentación y de CI (lista y motivo en `scripts/trazabilidad.mjs`) y reporta aparte los criterios de las P2 omitidas.

- Por proyecto: `npm test -w packages/shared`, `npm test -w api`, `npm test -w web`, `npm test -w mobile`.
- **Filtrar por ID.** Cada prueba lleva en su título los IDs que verifica (DD-46), así que se puede correr solo lo de un criterio:

  ```sh
  npm test -w api -- -t "R-4.14"
  npm run test:integracion -w api -- -t "R-4.14"
  npm test -w mobile -- -t "R-4.30"
  ```

- Calidad: `npm run lint`, `npm run lint:verificar-reglas`, `npm run typecheck`, `npm run format:check` y `npm run lint:contrato`.
- Después de cada prueba de integración, un `afterEach` global verifica que el dinero cuadra: saldo igual a la suma de asientos por cuenta y suma total cero (DD-46).
- El CI (`.github/workflows/ci.yml`) corre los jobs `calidad`, `unitarias`, `integracion` y `movil`, los cuatro obligatorios.

## Pruebas en Windows

En Windows, alguna corrida completa de `npm run test:integracion -w api` puede terminar con un worker de Vitest en `0xC0000409` ("during started state"), sin mensaje en stderr y cada vez en un archivo distinto. Es un problema del entorno, no de las pruebas: al repetir la corrida pasa. La integración usa `pool: 'forks'`, así que el reporte dice en qué archivo ocurrió.

## Dependencias y `npm audit`

**Política.** Las dependencias directas van con **versión exacta** (sin `^` ni `~`) y publicadas hace **2 semanas o más** al momento de instalarlas, para reducir el riesgo de un paquete comprometido recién publicado. Las de `mobile` salen además de `bundledNativeModules.json` de `expo@58.0.23`.

**Excepción: 54 transitivas de Expo.** Al instalar `mobile`, 54 paquetes transitivos se resolvieron a versiones posteriores al corte, por los rangos de sus dependientes (por ejemplo, `@expo/cli`, `@expo/metro-config`, `babel-preset-expo`, Babel y React Navigation). Fijarlos con `overrides` dejó el árbol incompleto, así que se aceptaron con estas mitigaciones:

- Ninguno de los 54 tiene **scripts de instalación**.
- `npm audit signatures` limpio: todas las firmas del registro verificadas, ninguna faltante o inválida.
- El `package-lock.json` guarda el hash de **integridad** de cada paquete, y la instalación es siempre con `npm ci`, que falla si algún archivo descargado no coincide.

El detalle está en `specs/ai-log.md`, sesión 25 (lista de los 54 y verificaciones) y sesión 27 (`expo-screen-capture`).

**Avisos de `npm audit` aceptados**

- **Desarrollo:** `minimatch` (GHSA-g3hv-75wg-m249), dentro de `typescript-eslint`. Solo corre al hacer lint. El arreglo que propone `npm audit fix --force` es bajar de versión `typescript-eslint`, así que no se aplica.
- **Producción:** `typeorm` → `glob@10` → `minimatch@9` (GHSA-3g3m-2fjr-6pw4 y GHSA-g3hv-75wg-m249). **No es alcanzable:** TypeORM solo usa `glob` cuando recibe patrones de texto en `migrations`, `entities` o `subscribers`, y aquí recibe listas de clases. La prueba de integración `listas-explicitas.test.ts` (DD-05) falla si alguien agrega un patrón como `'src/**/*.ts'`. La salida real es TypeORM 1.x (ver más abajo). Detalle en `specs/ai-log.md`, sesiones 7 y 16.

## Video

📹 **Video de la entrega:** _(enlace pendiente)_

## Qué haría con más tiempo

**Tareas P2 omitidas en la línea de corte** (`specs/tasks.md` §10)

| Tarea | Qué falta | Criterios sin cubrir |
|---|---|---|
| T-API-23 · Estado de cuenta CSV | `GET /api/cuentas/{id}/estado-cuenta?mes=AAAA-MM` en UTF-8 con BOM, montos con `centavosATextoDecimal`, saldo acumulado y protección contra fórmulas (DD-38) | R-B1.1 a R-B1.5 |
| T-WEB-08 · Botón de descarga del estado de cuenta | Selector de mes y botón "Descargar CSV" en el historial | R-B1.6 |
| T-MOB-07 · Desbloqueo biométrico | `expo-local-authentication` para quitar la capa de privacidad al volver a primer plano | — (bonus fuera de alcance, `requirements.md` §11) |

`esquemaQueryEstadoCuenta` (validación del mes, R-B1.5) y `centavosATextoDecimal` (R-B1.2) ya existen en `packages/shared` con sus pruebas; falta el endpoint que los use.

**Fuera de alcance en `specs/requirements.md` §11**

- Transferencias programadas.
- Estado de cuenta en PDF.
- Reenvío del código de un solo uso.
- Expiración de las llaves de idempotencia a las 24 h.
- Límite diario configurable por usuario.
- Abrir cuentas adicionales.
- Transferencias fuera de la plataforma (SPEI).
- Cognito como proveedor de identidad.
- Desbloqueo biométrico en móvil (T-MOB-07, arriba).

**Agregados por el diseño (`specs/design.md` §15.2)**

- Registro con verificación por correo, para que el registro no revele qué correos existen (DD-23).
- Volver a calcular el hash de una contraseña al subir los parámetros de argon2id (DD-28).
- Llave de idempotencia también en la confirmación, para que reintentar un código incorrecto no consuma otro intento.
- **Rate limit general por usuario** en las rutas autenticadas (transferir, confirmar y consultas), además de los límites de login, registro y beneficiarios.
- Firma asimétrica del access (RS256 o EdDSA) cuando otro servicio tenga que verificar tokens (DD-29).
- Varias subcuentas de Fondeo para repartir el punto caliente del registro (D-20; ver `docs/aws-deploy.md` §10.2).

**Otros**

- **TypeORM 1.x**, que quita la cadena `glob` → `minimatch` de los avisos de `npm audit` de producción. Implica revisar la API de migraciones y DataSource frente a DD-01.
- **Proveedor real de OTP** (SMS o correo, por ejemplo Amazon SNS o SES) en lugar de `OTP_SIMULADO`, detrás de la misma interfaz de proveedor.
- **Redis para el rate limit** (ElastiCache en producción), para que el límite sea uno solo entre varias instancias de la API (DD-41; ver `docs/aws-deploy.md` §4).
- **Dividir el bundle de la web** con `React.lazy` por ruta (historial, beneficiarios, transferencia), para que el login cargue menos JavaScript.
