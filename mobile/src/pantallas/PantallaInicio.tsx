// Pantalla con sesión de T-MOB-02. T-MOB-03 la sustituye por Saldo.
import { Button, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../contexto';

export function PantallaInicio() {
  const { sesion } = useApp();
  return (
    <View style={estilos.contenedor}>
      <Text>Sesión iniciada.</Text>
      <Button title="Cerrar sesión" onPress={() => void sesion.cerrarSesion()} />
    </View>
  );
}

const estilos = StyleSheet.create({ contenedor: { padding: 16, gap: 8 } });
