// Estado de la transferencia (design.md §13.3, R-4.11, R-4.12, R-4.28, R-4.30, R-6.18): verificando,
// comprobante, rechazo, captura del código o "Estado desconocido". Nunca dice que la operación
// no se hizo: si no hay respuesta, el resultado es desconocido (D-17).
import { type Comprobante, esquemaConfirmacion, formatearMXNSinIntl } from '@billetera/shared';
import { useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
      return <CapturaCodigo estado={estado} />;
  }
}

/** R-6.18: la captura del código, con el `codigoSimulado` guardado en modo de prueba (DD-25). */
function CapturaCodigo({ estado }: { estado: Extract<EstadoMotor, { tipo: 'codigo' }> }) {
  const { motor } = useApp();
  const enVuelo = useRef(false);
  const [codigo, setCodigo] = useState('');
  const [errorCampo, setErrorCampo] = useState<string | null>(null);

  async function confirmar() {
    // Un segundo toque del mismo ciclo se descarta antes de cualquier setState (R-4.21).
    if (enVuelo.current) return;
    const resultado = esquemaConfirmacion.safeParse({ codigo: codigo.trim() });
    if (!resultado.success) {
      setErrorCampo(resultado.error.issues[0]?.message ?? 'Debe tener 6 dígitos.');
      return;
    }
    enVuelo.current = true;
    setErrorCampo(null);
    try {
      await motor.confirmar(resultado.data.codigo);
    } finally {
      enVuelo.current = false;
    }
  }

  const error = errorCampo ?? estado.error ?? null;
  return (
    <View style={estilos.bloque}>
      <Text style={estilos.titulo} accessibilityRole="header">
        Confirma con tu código
      </Text>
      <Text>
        La transferencia de {formatearMXNSinIntl(estado.montoCentavos)} necesita un código de
        confirmación. Vence: {formatearFecha(estado.codigoExpiraEn)}.
      </Text>
      {estado.codigoSimulado ? <Text>Modo de prueba · código: {estado.codigoSimulado}</Text> : null}
      <Text>Código</Text>
      <TextInput
        accessibilityLabel="Código"
        style={estilos.campo}
        value={codigo}
        onChangeText={setCodigo}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
      />
      {error ? (
        <Text accessibilityRole="alert" style={estilos.error}>
          {error}
        </Text>
      ) : null}
      <Button title="Confirmar" onPress={() => void confirmar()} />
    </View>
  );
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
  campo: { borderWidth: 1, borderColor: '#888', borderRadius: 6, padding: 10 },
  error: { color: '#b00020' },
});
