// Estado de la transferencia (design.md §13.3, R-4.11, R-4.12, R-4.28, R-4.30): verificando,
// comprobante, rechazo, captura del código o "Estado desconocido". Nunca dice que la operación
// no se hizo: si no hay respuesta, el resultado es desconocido (D-17).
import { type Comprobante, formatearMXNSinIntl } from '@billetera/shared';
import { useSyncExternalStore } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../contexto';
import { formatearFecha } from '../formato/fecha';
import type { EstadoMotor } from '../transferencia/motor';
import { Fila } from './PantallaConfirmar';

export const VERIFICANDO = 'Verificando estado de tu transferencia…';
export const DESCONOCIDO = 'Estado desconocido';

export function PantallaEstado() {
  const { motor } = useApp();
  const estado = useSyncExternalStore(motor.suscribir, motor.obtenerEstado);
  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      <Contenido estado={estado} />
    </ScrollView>
  );
}

function Contenido({ estado }: { estado: EstadoMotor }) {
  const { motor } = useApp();
  switch (estado.tipo) {
    case 'inactivo':
    case 'verificando':
      return (
        <View style={estilos.bloque} accessibilityLiveRegion="polite">
          <ActivityIndicator accessibilityLabel={VERIFICANDO} />
          <Text style={estilos.titulo}>{VERIFICANDO}</Text>
        </View>
      );
    case 'desconocido':
      return (
        <View style={estilos.bloque} accessibilityRole="alert">
          <Text style={estilos.titulo}>{DESCONOCIDO}</Text>
          <Text>
            No pudimos confirmar el resultado con el servidor. Al verificar usamos la misma
            operación, así que tu dinero no se enviará dos veces.
          </Text>
          <Button title="Verificar de nuevo" onPress={() => motor.verificarDeNuevo()} />
        </View>
      );
    case 'comprobante':
      return (
        <View style={estilos.bloque}>
          <Text style={estilos.titulo} accessibilityRole="header">
            Transferencia aplicada
          </Text>
          <DetalleComprobante comprobante={estado.comprobante} />
          <Button title="Volver al saldo" onPress={() => motor.cerrar()} />
        </View>
      );
    case 'rechazo':
      return (
        <View style={estilos.bloque} accessibilityRole="alert">
          <Text style={estilos.titulo}>Transferencia rechazada</Text>
          <Text>{estado.mensaje}</Text>
          <Button title="Volver al saldo" onPress={() => motor.cerrar()} />
        </View>
      );
    case 'codigo':
      return (
        <View style={estilos.bloque}>
          <Text style={estilos.titulo}>Confirma con tu código</Text>
          <Text>
            La transferencia de {formatearMXNSinIntl(estado.montoCentavos)} necesita un código de
            confirmación. Vence: {formatearFecha(estado.codigoExpiraEn)}.
          </Text>
          {estado.codigoSimulado ? (
            <Text>Modo de prueba · código: {estado.codigoSimulado}</Text>
          ) : null}
        </View>
      );
  }
}

function DetalleComprobante({ comprobante: c }: { comprobante: Comprobante }) {
  return (
    <>
      <Fila etiqueta="Monto" valor={formatearMXNSinIntl(c.montoCentavos)} />
      <Fila etiqueta="Desde" valor={`${c.origen.nombre} · ••${c.origen.clabeTerminacion}`} />
      <Fila
        etiqueta="Para"
        valor={`${c.destino.etiqueta} · ${c.destino.nombre} · ••${c.destino.clabeTerminacion}`}
      />
      <Fila etiqueta="Concepto" valor={c.concepto} />
      <Fila etiqueta="Referencia" valor={c.referencia} />
      <Fila etiqueta="Aplicada" valor={formatearFecha(c.aplicadaEn)} />
      <Fila etiqueta="Folio" valor={c.transferenciaId} />
    </>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  bloque: { gap: 8 },
  titulo: { fontSize: 18, fontWeight: '600' },
});
