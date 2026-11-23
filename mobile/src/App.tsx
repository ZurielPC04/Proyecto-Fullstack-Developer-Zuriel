// Raíz de la app móvil: lee la configuración y cablea las dependencias reales
// (expo-secure-store, fetch, NetInfo y expo-crypto) para la sesión, el cliente y el motor.
import * as Crypto from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { StyleSheet, Text, View } from 'react-native';
import { crearCliente } from './api/cliente';
import { crearSesion } from './auth/sesion';
import { leerConfig } from './config';
import type { ContextoApp } from './contexto';
import { Raiz } from './Raiz';
import { conexionNetInfo } from './transferencia/conexion';
import { crearMotor } from './transferencia/motor';

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
  if (!config.ok || contexto === null) {
    return (
      <View style={estilos.error}>
        <Text style={estilos.titulo}>Error de configuración</Text>
        <Text accessibilityRole="alert">{config.ok ? '' : config.error}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }
  return (
    <>
      <Raiz contexto={contexto} />
      <StatusBar style="auto" />
    </>
  );
}

const estilos = StyleSheet.create({
  error: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  titulo: { fontSize: 20, fontWeight: '600' },
});
