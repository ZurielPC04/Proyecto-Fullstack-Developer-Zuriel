// Raíz de la app móvil (design.md §13.3, DD-03): React Navigation con native stack.
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { leerConfig } from './config';
import { PantallaSalud } from './pantallas/PantallaSalud';

export type RutasRaiz = { Salud: undefined };

const Stack = createNativeStackNavigator<RutasRaiz>();

const config = leerConfig();

export function App() {
  if (!config.ok) {
    return (
      <View style={estilos.error}>
        <Text style={estilos.titulo}>Error de configuración</Text>
        <Text accessibilityRole="alert">{config.error}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }
  const { apiUrl } = config.config;
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Salud" options={{ title: 'Billetera' }}>
          {() => <PantallaSalud apiUrl={apiUrl} />}
        </Stack.Screen>
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}

const estilos = StyleSheet.create({
  error: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  titulo: { fontSize: 20, fontWeight: '600' },
});
