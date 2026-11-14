# Billetera digital MXN

Billetera en pesos mexicanos donde los usuarios consultan sus cuentas, registran beneficiarios y se envían dinero entre cuentas de la misma plataforma.

## Language

### Dinero y cuentas

**Cuenta**:
Contenedor de dinero en MXN con una CLABE y un saldo. Puede ser de usuario o de sistema.
_Avoid_: Wallet, monedero

**Saldo**:
Dinero disponible en una cuenta; siempre es igual a la suma de sus asientos.
_Avoid_: Balance

**Asiento**:
Registro inmutable de un cargo o abono a una cuenta, producido por una transferencia.
_Avoid_: Partida, línea contable

**Cuenta de sistema**:
Cuenta que no pertenece a ningún usuario y que la plataforma usa internamente. La única es Fondeo.
_Avoid_: Cuenta interna, cuenta técnica

**Fondeo**:
Cuenta de sistema de la que sale todo el dinero que entra a la plataforma; su saldo negativo es el total depositado.
_Avoid_: Tesorería, cuenta maestra

**Depósito**:
Entrada de dinero desde Fondeo a una cuenta de usuario, tal como la ve el usuario.
_Avoid_: Recarga, abono inicial

### Transferencias

**Transferencia**:
Operación que mueve dinero de una cuenta origen a una cuenta destino y produce asientos que suman cero.
_Avoid_: Pago, operación, transacción

**Traspaso**:
Transferencia entre dos cuentas del mismo usuario.
_Avoid_: Transferencia propia, movimiento interno

**Transferencia a tercero**:
Transferencia hacia una cuenta de otro usuario.
_Avoid_: Pago a tercero

### Historial

**Movimiento**:
Un asiento tal como lo ve el dueño de la cuenta en su historial: depósito, envío, recepción o traspaso.
_Avoid_: Transacción, asiento (en la interfaz)

**Envío**:
Movimiento de salida de una transferencia a tercero.
_Avoid_: Transferencia enviada, cargo

**Recepción**:
Movimiento de entrada de una transferencia a tercero.
_Avoid_: Transferencia recibida, abono
