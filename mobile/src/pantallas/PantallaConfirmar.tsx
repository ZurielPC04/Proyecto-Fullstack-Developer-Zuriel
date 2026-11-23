// Confirmar (design.md §13.3, R-4.27): el resumen de los datos congelados. "Enviar" pide al motor
// que guarde el intento y lo envíe; la raíz cambia sola a la pantalla Estado.
import { formatearMXNSinIntl } from '@billetera/shared';
import { useRef, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../contexto';
import type { DatosConfirmar } from './PantallaTransferir';

type Props = { datos: DatosConfirmar; alEditar: () => void };

export const SIN_PREPARAR = 'No pudimos preparar tu transferencia. Inténtalo de nuevo.';

export function PantallaConfirmar({ datos, alEditar }: Props) {
  const { motor } = useApp();
  const enVuelo = useRef(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    // R-4.21: un segundo toque del mismo ciclo se descarta antes de cualquier setState.
    if (enVuelo.current) return;
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    try {
      await motor.iniciar(datos.cuerpo);
    } catch {
      // No se guardó el intento, así que tampoco se envió nada.
      enVuelo.current = false;
      setEnviando(false);
      setError(SIN_PREPARAR);
    }
  }

  const { cuerpo } = datos;
  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Confirma tu transferencia</Text>
      <Fila etiqueta="Monto" valor={formatearMXNSinIntl(cuerpo.montoCentavos)} />
      <Fila etiqueta="Desde" valor={datos.origen} />
      <Fila etiqueta="Para" valor={datos.destino} />
      <Fila etiqueta="Concepto" valor={cuerpo.concepto} />
      <Fila etiqueta="Referencia" valor={cuerpo.referencia} />
      {error ? (
        <Text accessibilityRole="alert" style={estilos.error}>
          {error}
        </Text>
      ) : null}
      {enviando ? (
        <ActivityIndicator accessibilityLabel="Enviando transferencia" />
      ) : (
        <>
          <Button title="Enviar" onPress={() => void enviar()} />
          <Button title="Editar" onPress={alEditar} />
        </>
      )}
    </View>
  );
}

export function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <Text>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 8 },
  titulo: { fontSize: 18, fontWeight: '600' },
  fila: { gap: 2 },
  etiqueta: { color: '#555' },
  error: { color: '#b00020' },
});
