// Movimientos (design.md §13.3, R-5.12): los últimos 20 de la cuenta elegida, sin paginar.
import { formatearMXNSinIntl, type Movimiento, type TipoMovimiento } from '@billetera/shared';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../contexto';
import { formatearFecha } from '../formato/fecha';
import { ErrorConReintento } from './ErrorConReintento';
import { useCarga } from './useCarga';

/** R-5.12: la app muestra los últimos 20, sin paginar. */
export const LIMITE_MOVIMIENTOS = 20;

/** R-5.9: una entrada desde Fondeo es "Depósito", nunca una transferencia. */
export const ETIQUETA_TIPO: Record<TipoMovimiento, string> = {
  DEPOSITO: 'Depósito',
  ENVIO: 'Envío',
  RECEPCION: 'Recepción',
  TRASPASO_SALIDA: 'Traspaso enviado',
  TRASPASO_ENTRADA: 'Traspaso recibido',
};

export function PantallaMovimientos({ cuentaId }: { cuentaId: string }) {
  const { cliente } = useApp();
  const cargar = useCallback(
    () =>
      cliente.get('/cuentas/{cuentaId}/movimientos', {
        path: { cuentaId },
        query: { limite: LIMITE_MOVIMIENTOS },
      }),
    [cliente, cuentaId],
  );
  const carga = useCarga(cargar);

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      {carga.estado === 'cargando' ? (
        <ActivityIndicator accessibilityLabel="Cargando movimientos" />
      ) : carga.estado === 'error' ? (
        <ErrorConReintento
          titulo="No pudimos cargar los movimientos."
          error={carga.error}
          alReintentar={carga.reintentar}
        />
      ) : carga.datos.items.length === 0 ? (
        <Text>Sin movimientos</Text>
      ) : (
        carga.datos.items.map((m) => <FilaMovimiento key={m.id} movimiento={m} />)
      )}
    </ScrollView>
  );
}

function FilaMovimiento({ movimiento: m }: { movimiento: Movimiento }) {
  return (
    <View style={estilos.fila}>
      <View style={estilos.encabezado}>
        <Text style={estilos.tipo}>{ETIQUETA_TIPO[m.tipo]}</Text>
        <Text style={estilos.monto}>{formatearMXNSinIntl(m.montoCentavos)}</Text>
      </View>
      <Text>{m.contraparte.etiqueta}</Text>
      <Text>{m.concepto}</Text>
      <Text style={estilos.fecha}>{formatearFecha(m.fecha)}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 8 },
  fila: { borderBottomWidth: 1, borderColor: '#ddd', paddingVertical: 8, gap: 2 },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between' },
  tipo: { fontWeight: '600' },
  monto: { fontWeight: '600' },
  fecha: { color: '#666' },
});
