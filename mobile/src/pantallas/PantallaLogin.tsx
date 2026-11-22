// Login (design.md §13.3): botón ocupado mientras carga y mensaje del formulario si falla.
import { esquemaLogin } from '@billetera/shared';
import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { mensajeDeError } from '../api/mensaje-error';
import { useApp } from '../contexto';

// DD-24: el cliente lo agrega la sesión; el usuario solo captura correo y contraseña.
const esquema = esquemaLogin.omit({ cliente: true });

type Errores = { correo?: string; contrasena?: string; formulario?: string };

type Props = { alVerEstadoServidor: () => void };

export function PantallaLogin({ alVerEstadoServidor }: Props) {
  const { sesion } = useApp();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    const resultado = esquema.safeParse({ correo, contrasena });
    if (!resultado.success) {
      const campos: Errores = {};
      for (const problema of resultado.error.issues) {
        const campo = problema.path[0];
        if ((campo === 'correo' || campo === 'contrasena') && campos[campo] === undefined) {
          campos[campo] = problema.message;
        }
      }
      setErrores(campos);
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      await sesion.iniciarSesion(resultado.data.correo, resultado.data.contrasena);
    } catch (error) {
      setErrores({ formulario: mensajeDeError(error) });
      setEnviando(false);
    }
  }

  return (
    <View style={estilos.contenedor}>
      <Text nativeID="etiqueta-correo">Correo</Text>
      <TextInput
        accessibilityLabelledBy="etiqueta-correo"
        accessibilityLabel="Correo"
        style={estilos.campo}
        value={correo}
        onChangeText={setCorreo}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        editable={!enviando}
      />
      {errores.correo ? <Text style={estilos.error}>{errores.correo}</Text> : null}

      <Text nativeID="etiqueta-contrasena">Contraseña</Text>
      <TextInput
        accessibilityLabelledBy="etiqueta-contrasena"
        accessibilityLabel="Contraseña"
        style={estilos.campo}
        value={contrasena}
        onChangeText={setContrasena}
        secureTextEntry
        autoComplete="current-password"
        editable={!enviando}
      />
      {errores.contrasena ? <Text style={estilos.error}>{errores.contrasena}</Text> : null}

      {errores.formulario ? (
        <Text accessibilityRole="alert" style={estilos.error}>
          {errores.formulario}
        </Text>
      ) : null}

      {enviando ? (
        <ActivityIndicator accessibilityLabel="Iniciando sesión" />
      ) : (
        <Button title="Entrar" onPress={() => void entrar()} />
      )}
      <Button title="Estado del servidor" onPress={alVerEstadoServidor} />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 8 },
  campo: { borderWidth: 1, borderColor: '#888', borderRadius: 6, padding: 10 },
  error: { color: '#b00020' },
});
