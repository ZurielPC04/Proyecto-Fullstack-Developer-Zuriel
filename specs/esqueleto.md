# Esqueleto general — Billetera digital MXN

Visión inicial del sistema, sin tecnologías concretas. Sirve como insumo para `requirements.md` y `design.md`.

## 1. Vista general del sistema

```mermaid
flowchart LR
    U((Usuario))

    subgraph Clientes
        WEB["Panel web<br/>completo"]
        MOV["App móvil<br/>alcance reducido"]
    end

    SH["Contrato compartido<br/>tipos y validaciones"]

    subgraph Backend["API"]
        GW["Entrada HTTP<br/>validación · errores · rate limit · request ID"]
        MOD["Módulos de dominio"]
    end

    DB[("Base de datos relacional<br/>integridad en la base")]
    OTP["Proveedor de código<br/>de un solo uso (simulado)"]
    LOG["Logs estructurados<br/>datos enmascarados"]

    U --> WEB & MOV
    WEB & MOV -->|HTTPS + token| GW
    SH -.-> WEB & MOV & GW
    GW --> MOD --> DB
    MOD --> OTP
    GW & MOD --> LOG
```

## 2. Módulos de dominio

```mermaid
flowchart TB
    subgraph API
        AUTH["Identidad<br/>registro · login · sesión"]
        CTA["Cuentas<br/>saldo disponible"]
        BEN["Beneficiarios<br/>alta · validación CLABE"]
        TRF["Transferencias<br/>idempotencia · bloqueo · asientos"]
        LIM["Límites y confirmación<br/>límite diario · código"]
        MOVS["Movimientos<br/>historial · filtros · cursor"]
        AUD["Auditoría<br/>solo inserción"]
        BON["Bonus<br/>estado de cuenta · programadas"]
    end

    AUTH --> CTA
    TRF --> CTA
    TRF --> BEN
    TRF --> LIM
    TRF --> MOVS
    TRF --> AUD
    AUTH --> AUD
    BON -.-> MOVS
    BON -.-> TRF
```

| Historia | Módulo principal |
|---|---|
| HU-1. Registro e inicio de sesión | Identidad |
| HU-2. Ver cuentas y saldo | Cuentas |
| HU-3. Registrar beneficiario con CLABE | Beneficiarios |
| HU-4. Enviar transferencia | Transferencias |
| HU-5. Historial con filtros, paginado | Movimientos |
| HU-6. Límite diario y código | Límites y confirmación |
| HU-B1 / HU-B2. Bonus | Estado de cuenta / Programadas |

## 3. Modelo de datos conceptual

```mermaid
erDiagram
    USUARIO ||--o{ CUENTA : posee
    USUARIO ||--o{ BENEFICIARIO : registra
    USUARIO ||--o{ SESION : abre
    CUENTA ||--o{ ASIENTO : acumula
    TRANSFERENCIA ||--|{ ASIENTO : "genera (suman cero)"
    TRANSFERENCIA }o--|| CUENTA : "origen"
    TRANSFERENCIA }o--|| CUENTA : "destino"
    BENEFICIARIO }o--o| CUENTA : "apunta por CLABE"
    TRANSFERENCIA ||--o| CODIGO_CONFIRMACION : "requiere si supera monto"
    USUARIO ||--o{ EVENTO_AUDITORIA : origina

    USUARIO {
        id id
        string email
        string hash_contrasena
        datetime creado_en
    }
    CUENTA {
        id id
        id usuario_id
        string clabe
        int saldo_centavos
    }
    BENEFICIARIO {
        id id
        id usuario_id
        string nombre
        string alias
        string clabe
    }
    TRANSFERENCIA {
        id id
        string llave_idempotencia
        id origen
        id destino
        int monto_centavos
        string concepto
        string referencia
        string estado
    }
    ASIENTO {
        id id
        id transferencia_id
        id cuenta_id
        int monto_centavos
        string tipo
        datetime fecha
    }
    CODIGO_CONFIRMACION {
        id id
        id transferencia_id
        string hash
        datetime expira
        bool usado
    }
    SESION {
        id id
        id usuario_id
        string refresh_hash
        datetime expira
        bool revocada
    }
    EVENTO_AUDITORIA {
        id id
        string actor
        string accion
        string datos
        datetime fecha
    }
```

Reglas que la base de datos garantiza por sí sola, no solo el código:

- El saldo nunca es negativo.
- La llave de idempotencia es única.
- Los asientos de cada transferencia suman cero.
- La auditoría solo admite inserciones.

## 4. Flujo de una transferencia

```mermaid
sequenceDiagram
    actor U as Usuario
    participant C as Cliente (web/móvil)
    participant A as API
    participant D as Base de datos

    U->>C: Llena monto, destino, concepto, referencia
    C->>C: Valida y genera llave de idempotencia (1 por intento)
    C->>A: Solicitar transferencia + llave
    A->>D: ¿Existe la llave?
    alt Ya existe
        D-->>A: Resultado previo
        A-->>C: Mismo resultado (sin duplicar)
    else Nueva
        A->>A: Valida límite diario
        alt Supera el monto de confirmación
            A-->>C: Requiere código
            U->>C: Ingresa código
            C->>A: Confirmar + misma llave
        end
        A->>D: Inicia transacción
        A->>D: Bloquea cuentas en orden fijo
        A->>D: Verifica saldo
        A->>D: Inserta transferencia + 2 asientos + auditoría
        A->>D: Confirma transacción
        A-->>C: Comprobante
    end
    Note over C,A: Si se cae la red, el cliente reintenta<br/>con la MISMA llave o consulta el estado
```

## 5. Mapa de pantallas

```mermaid
flowchart LR
    subgraph Web
        W1[Login / Registro] --> W2[Resumen de cuentas]
        W2 --> W3[Historial<br/>filtros + paginación]
        W2 --> W4[Beneficiarios<br/>alta]
        W2 --> W5[Transferir] --> W6[Confirmación] --> W7[Código si aplica] --> W8[Comprobante]
    end

    subgraph Movil["Móvil"]
        M1[Login] --> M2[Saldo]
        M2 --> M3[Últimos 20 movimientos]
        M2 --> M4[Transferir a beneficiario] --> M5[Estado real de la operación]
    end
```

Cada pantalla contempla los estados **cargando**, **vacío**, **error** y **éxito**.
