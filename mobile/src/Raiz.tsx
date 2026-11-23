// Navegación (design.md §13.3, DD-03): un solo stack a la vez según el estado de la sesión y del
// intento. Mientras el motor tiene un intento sin resolver, el stack con Saldo no existe, así que
// no hay forma de iniciar otra transferencia (R-4.30).
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { type ContextoApp, ProveedorApp } from './contexto';
import { PantallaConfirmar } from './pantallas/PantallaConfirmar';
import { PantallaEstado } from './pantallas/PantallaEstado';
import { PantallaLogin } from './pantallas/PantallaLogin';
import { PantallaMovimientos } from './pantallas/PantallaMovimientos';
import { PantallaSaldo } from './pantallas/PantallaSaldo';
import { PantallaSalud } from './pantallas/PantallaSalud';
import { type DatosConfirmar, PantallaTransferir } from './pantallas/PantallaTransferir';

export type RutasRaiz = {
  Login: undefined;
  Salud: undefined;
  Saldo: undefined;
  Movimientos: { cuentaId: string; nombre: string };
  Transferir: undefined;
  Confirmar: DatosConfirmar;
  Estado: undefined;
};

const Stack = createNativeStackNavigator<RutasRaiz>();

export function Raiz({ contexto }: { contexto: ContextoApp }) {
  const { sesion, apiUrl, motor } = contexto;
  const estado = useSyncExternalStore(sesion.suscribir, sesion.obtenerEstado);
  const estadoMotor = useSyncExternalStore(motor.suscribir, motor.obtenerEstado);

  useEffect(() => {
    void sesion.restaurar();
  }, [sesion]);

  if (estado === 'restaurando') {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator accessibilityLabel="Recuperando tu sesión" />
      </View>
    );
  }

  return (
    <ProveedorApp value={contexto}>
      <NavigationContainer>
        <Stack.Navigator>
          {estado === 'con-sesion' && estadoMotor.tipo !== 'inactivo' ? (
            <Stack.Screen
              name="Estado"
              component={PantallaEstado}
              options={{ title: 'Estado de la transferencia', gestureEnabled: false }}
            />
          ) : estado === 'con-sesion' ? (
            <>
              <Stack.Screen name="Saldo" options={{ title: 'Saldo' }}>
                {({ navigation }) => (
                  <PantallaSaldo
                    alTransferir={() => navigation.navigate('Transferir')}
                    alVerMovimientos={(cuenta) =>
                      navigation.navigate('Movimientos', {
                        cuentaId: cuenta.id,
                        nombre: cuenta.nombre,
                      })
                    }
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Movimientos"
                options={({ route }) => ({ title: `Movimientos · ${route.params.nombre}` })}
              >
                {({ route }) => <PantallaMovimientos cuentaId={route.params.cuentaId} />}
              </Stack.Screen>
              <Stack.Screen name="Transferir" options={{ title: 'Transferir' }}>
                {({ navigation }) => (
                  <PantallaTransferir
                    alContinuar={(datos) => navigation.navigate('Confirmar', datos)}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Confirmar" options={{ title: 'Confirmar' }}>
                {({ navigation, route }) => (
                  <PantallaConfirmar datos={route.params} alEditar={() => navigation.goBack()} />
                )}
              </Stack.Screen>
            </>
          ) : (
            <>
              <Stack.Screen name="Login" options={{ title: 'Iniciar sesión' }}>
                {({ navigation }) => (
                  <PantallaLogin alVerEstadoServidor={() => navigation.navigate('Salud')} />
                )}
              </Stack.Screen>
              <Stack.Screen name="Salud" options={{ title: 'Estado del servidor' }}>
                {() => <PantallaSalud apiUrl={apiUrl} />}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </ProveedorApp>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
