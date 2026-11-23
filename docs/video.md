# Guion del video de la entrega

Duración máxima: **5:00** (T-DOC-05). El video muestra el rechazo por saldo insuficiente en la web **y** en la app móvil (R-4.12), con los usuarios demo del seed (RNF-27, D-13).

## Preparación (antes de grabar)

1. **Volver a correr el seed.** En las pruebas manuales, Ana le transfirió $24,500.00 a Beto, así que los saldos ya no son los del seed:

   ```sh
   npm run db:seed
   ```

   Ana queda con $80,000.00 y Beto con $500.00, sin movimientos del día.

2. **`api/.env`:**

   ```sh
   OTP_SIMULADO=true        # el código aparece en pantalla como "Modo de prueba"
   DEMO_LATENCIA_MS=8000    # 8 s antes de responder POST /transferencias y /confirmar (D-17)
   ```

   La latencia también aplica a los envíos de la web: cada uno tarda 8 s. El guion ya cuenta con esas esperas; si hace falta tiempo, se recortan al editar.

3. **`mobile/.env`:** `EXPO_PUBLIC_BLOQUEAR_CAPTURAS=false`, para que Android permita grabar la pantalla (DD-44). La capa que oculta los saldos en segundo plano sigue activa. Revisa la IP de la LAN con `ipconfig` y que `EXPO_PUBLIC_API_URL` la use.

4. **Tercera usuaria para recibir las transferencias de Ana.** Si Ana le transfiere a Beto, el saldo de Beto sube y deja de servir para el saldo insuficiente. Antes de grabar, registra en la web `carla@demo.mx` (con cualquier contraseña válida) y anota la CLABE de su cuenta `Principal`. En el video, Ana la da de alta como beneficiaria.

5. Arranca `npm run dev` y `npm run mobile`. Abre la web en Chrome, Edge o Firefox, en <http://localhost:5173>, con la sesión cerrada. Ten la app abierta en el teléfono, también con la sesión cerrada. Activa la grabación de pantalla del teléfono.

Contraseña de `ana@demo.mx` y `beto@demo.mx`: `demo billetera 2026`.

## Guion

### Web (0:00 – 2:50)

| Tiempo | Pantalla | Acción | Qué se dice |
|---|---|---|---|
| 0:00 – 0:15 | Login | Presentación breve | "Billetera digital: API en Express y PostgreSQL, web en React y app en Expo. Montos en centavos enteros en todo el sistema." |
| 0:15 – 0:35 | Login → Resumen | Entra como `beto@demo.mx` | "Beto tiene $500.00 en Principal." |
| 0:35 – 0:55 | Transferir | Beto le envía **$600.00** a Ana. Espera de 8 s | "Más de lo que tiene: la API la rechaza con el motivo **saldo insuficiente**, y el saldo no cambia." Cerrar sesión |
| 0:55 – 1:10 | Login → Resumen | Entra como `ana@demo.mx` | "Ana tiene $80,000.00 y un límite diario de $50,000.00." |
| 1:10 – 1:30 | Beneficiarios | Da de alta a Carla con su CLABE y el alias `carla` | "La CLABE se valida: 18 dígitos, dígito verificador y que pertenezca a una cuenta de la plataforma." |
| 1:30 – 1:50 | Transferir | **$1,500.00** a Carla. Espera de 8 s → comprobante | "Transferencia normal, hasta $10,000, sin código: queda aplicada." |
| 1:50 – 2:20 | Transferir → Código | **$12,000.00** a Carla. Espera de 8 s → captura del código. Escribe un código incorrecto → "Te quedan 2 intentos". Escribe el de "Modo de prueba" → comprobante | "Más de $10,000 pide un código de un solo uso. Uno incorrecto descuenta un intento; el correcto la aplica." |
| 2:20 – 2:35 | Transferir | **$40,000.00** a Carla. Espera de 8 s → rechazo | "Ana ya consumió $13,500.00 de su límite: $40,000 lo excede y se rechaza con **límite diario excedido**." |
| 2:35 – 2:50 | Historial | Filtra por la fecha de hoy con "Aplicar filtros": aparecen el depósito del seed y los dos envíos a Carla; los rechazos no mueven dinero y no aparecen | "Historial con filtros de fecha y paginado por cursor; con más resultados aparece 'Cargar más'." Cerrar sesión |

### Móvil (2:50 – 4:50)

| Tiempo | Pantalla | Acción | Qué se dice |
|---|---|---|---|
| 2:50 – 3:05 | Login → Saldo | Entra como `beto@demo.mx` | "La misma API desde la app." |
| 3:05 – 3:25 | Transferir → Confirmar | Beto le envía **$600.00** a Ana. Espera de 8 s → rechazo | "También en el teléfono: **saldo insuficiente**." Cerrar sesión |
| 3:25 – 3:45 | Login → Saldo | Entra como `ana@demo.mx` | "Saldo: $66,500.00, y el límite consumido del día: $13,500.00." |
| 3:45 – 3:55 | Movimientos | Abre los últimos 20 movimientos | "Los envíos de la web aparecen aquí." |
| 3:55 – 4:35 | Transferir → Confirmar → Estado | **$1,000.00** a Carla. Toca "Enviar" y **activa el modo avión** durante los 8 s de latencia. Se ve "Verificando estado de tu transferencia…" mientras los reintentos fallan. **Desactiva el modo avión** → comprobante | "La API ya la aplicó, pero la respuesta se perdió. El intento quedó guardado en SecureStore con su llave de idempotencia. Al volver la red, la app reintenta con **la misma llave** y la API devuelve el mismo comprobante, sin cobrarla dos veces." |
| 4:35 – 4:40 | Movimientos | Muestra un solo envío de $1,000.00 | "Un solo movimiento: no hubo duplicado." |
| 4:40 – 4:50 | Selector de apps | Abre el selector de apps del sistema | "En segundo plano, la app tapa los saldos con una capa." |

### Cierre (4:50 – 5:00)

| Tiempo | Pantalla | Qué se dice |
|---|---|---|
| 4:50 – 5:00 | README | "Specs, trazabilidad y la propuesta de AWS están en el repositorio." |

## Comprobaciones antes de publicar

- [ ] La duración es de 5:00 o menos.
- [ ] Se ve el rechazo por saldo insuficiente en la web (0:35) y en la app móvil (3:05).
- [ ] La recuperación con modo avión termina en el comprobante y en un solo movimiento.
- [ ] Ningún secreto de `api/.env` aparece en pantalla.
- [x] El enlace del video queda en la sección "Video" del README.
