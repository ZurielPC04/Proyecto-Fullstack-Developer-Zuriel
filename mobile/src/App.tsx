// Raíz de la app móvil: lee la configuración y cablea las dependencias reales
// (expo-secure-store, fetch, NetInfo y expo-crypto) para la sesión, el cliente y el motor. La capa
// de privacidad cubre todo, incluida la navegación (DD-44).
import * as Crypto from 'expo-crypto';
import * as ScreenCapture from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { StyleSheet, Text, View } from 'react-native';
import { crearCliente } from './api/cliente';
import { crearSesion } from './auth/sesion';
import { leerConfig } from './config';
import type { ContextoApp } from './contexto';
import { aplicarBloqueoCapturas } from './privacidad/capturas';
import { CapaPrivacidad } from './privacidad/CapaPrivacidad';
import { Raiz } from './Raiz';
import { conexionNetInfo } from './transferencia/conexion';
import { crearMotor } from './transferencia/motor';

// DD-44: FLAG_SECURE en Android, activo si la variable falta. Expo reemplaza al compilar solo el
// acceso estático `process.env.EXPO_PUBLIC_*`.
void aplicarBloqueoCapturas(process.env.EXPO_PUBLIC_BLOQUEAR_CAPTURAS, () =>
  ScreenCapture.preventScreenCaptureAsync(),
);

const config = leerConfig();

function crearContexto(apiUrl: string): ContextoApp {
  const sesion = crearSesion({ apiUrl, almacen: SecureStore });
  const cliente = crearCliente({ apiUrl, sesion });
  const motor = crearMotor({
    cliente,
    sesion,
    almacen: SecureStore,
    conexion: conexionNetInfo,
    generarLlave: () => Crypto.randomUUID(),
  });
  return { apiUrl, sesion, cliente, motor };
}

const contexto = config.ok ? crearContexto(config.config.apiUrl) : null;

export function App() {
  return (
    <CapaPrivacidad>
      {!config.ok || contexto === null ? (
        <View style={estilos.error}>
          <Text style={estilos.titulo}>Error de configuración</Text>
          <Text accessibilityRole="alert">{config.ok ? '' : config.error}</Text>
        </View>
      ) : (
        <Raiz contexto={contexto} />
      )}
      <StatusBar style="auto" />
    </CapaPrivacidad>
  );
}

const estilos = StyleSheet.create({
  error: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  titulo: { fontSize: 20, fontWeight: '600' },
});
