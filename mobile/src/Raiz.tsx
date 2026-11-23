// Navegación (design.md §13.3, DD-03): un solo stack a la vez según el estado de la sesión y del
// intento. Mientras el motor tiene un intento sin resolver, el stack con Saldo no existe, así que
// no hay forma de iniciar otra transferencia (R-4.30). Al entrar con sesión, primero se resuelve
// el intento guardado ("Resolviendo transferencia") y solo después existe el saldo (R-4.31).
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

  // R-4.31: si ya se revisó el intento guardado en esta entrada con sesión. Se reinicia al
  // perder la sesión, para revisarlo de nuevo cuando el usuario vuelva a entrar.
  const [intentoRevisado, setIntentoRevisado] = useState(false);
  if (estado !== 'con-sesion' && intentoRevisado) setIntentoRevisado(false);

  useEffect(() => {
    void sesion.restaurar();
  }, [sesion]);

  useEffect(() => {
    if (estado !== 'con-sesion' || intentoRevisado) return;
    let vigente = true;
    void motor.reanudar().finally(() => {
      if (vigente) setIntentoRevisado(true);
    });
    return () => {
      vigente = false;
    };
  }, [estado, intentoRevisado, motor]);

  if (estado === 'restaurando') {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator accessibilityLabel="Recuperando tu sesión" />
      </View>
    );
  }

  if (estado === 'con-sesion' && !intentoRevisado && estadoMotor.tipo === 'inactivo') {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator accessibilityLabel="Resolviendo transferencia" />
        <Text>Resolviendo transferencia…</Text>
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
