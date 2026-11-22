import { Button, StyleSheet, Text, View } from 'react-native';
import { mensajeDeError } from '../api/mensaje-error';

type Props = { titulo: string; error: unknown; alReintentar: () => void };

/** Estado de error de una pantalla (RNF-17): mensaje y "Reintentar". */
export function ErrorConReintento({ titulo, error, alReintentar }: Props) {
  return (
    <View style={estilos.contenedor} accessibilityRole="alert">
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text>{mensajeDeError(error)}</Text>
      <Button title="Reintentar" onPress={alReintentar} />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { gap: 8, paddingVertical: 8 },
  titulo: { fontWeight: '600' },
});
