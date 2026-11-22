// Saldo (design.md §13.3, R-2.6): cuentas con su saldo y el límite disponible del día.
import { type Cuenta, formatearMXNSinIntl, type Limites } from '@billetera/shared';
import { useCallback } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../contexto';
import { ErrorConReintento } from './ErrorConReintento';
import { useCarga } from './useCarga';

type Props = { alVerMovimientos: (cuenta: Cuenta) => void };

export function PantallaSaldo({ alVerMovimientos }: Props) {
  const { cliente, sesion } = useApp();
  const cargar = useCallback(
    () => Promise.all([cliente.get('/cuentas'), cliente.get('/limites')]),
    [cliente],
  );
  const carga = useCarga(cargar);

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      {carga.estado === 'cargando' ? (
        <ActivityIndicator accessibilityLabel="Cargando cuentas" />
      ) : carga.estado === 'error' ? (
        <ErrorConReintento
          titulo="No pudimos cargar tus cuentas."
          error={carga.error}
          alReintentar={carga.reintentar}
        />
      ) : (
        <>
          {carga.datos[0].items.map((cuenta) => (
            <TarjetaCuenta key={cuenta.id} cuenta={cuenta} alVerMovimientos={alVerMovimientos} />
          ))}
          <LimiteDelDia limites={carga.datos[1]} />
        </>
      )}
      <Button title="Cerrar sesión" onPress={() => void sesion.cerrarSesion()} />
    </ScrollView>
  );
}

function TarjetaCuenta({ cuenta, alVerMovimientos }: { cuenta: Cuenta } & Props) {
  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>{cuenta.nombre}</Text>
      <Text>Saldo disponible</Text>
      <Text style={estilos.monto}>{formatearMXNSinIntl(cuenta.saldoCentavos)}</Text>
      <Button
        title="Ver movimientos"
        accessibilityLabel={`Ver movimientos de ${cuenta.nombre}`}
        onPress={() => alVerMovimientos(cuenta)}
      />
    </View>
  );
}

/** R-6.7: el límite, lo consumido y lo disponible llegan de `GET /limites`; no se recalculan. */
function LimiteDelDia({ limites }: { limites: Limites }) {
  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>Límite de hoy</Text>
      <Text>Disponible para transferir a terceros</Text>
      <Text style={estilos.monto}>{formatearMXNSinIntl(limites.disponibleCentavos)}</Text>
      <Text>Consumido hoy: {formatearMXNSinIntl(limites.consumidoCentavos)}</Text>
      <Text>Límite diario: {formatearMXNSinIntl(limites.limiteCentavos)}</Text>
      <Text>Se renueva a medianoche, hora del centro de México.</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  tarjeta: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, gap: 4 },
  titulo: { fontSize: 18, fontWeight: '600' },
  monto: { fontSize: 22, fontWeight: '600' },
});
