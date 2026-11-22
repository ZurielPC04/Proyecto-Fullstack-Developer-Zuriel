// Pantalla del esqueleto (T-MOB-01): muestra GET /health y los montos de R-2.5 con el
// formateador sin Intl, porque Hermes no acepta BigInt en formatToParts (D-18 punto 5).
import { formatearMXNSinIntl } from '@billetera/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { consultarSalud, type ResultadoSalud } from '../api/salud';

const MONTOS_R_2_5 = [5, 100, 123456, -250] as const;

/** Solo informativo: si el motor acepta `formatToParts` con este valor, sin lanzar. */
function soportaFormatToParts(valor: number | bigint): boolean {
  try {
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).formatToParts(valor);
    return true;
  } catch {
    return false;
  }
}

const FORMAT_TO_PARTS = {
  numero: soportaFormatToParts(1234),
  bigint: soportaFormatToParts(BigInt(1234)),
};

type Props = { apiUrl: string; fetchFn?: typeof fetch };

export function PantallaSalud({ apiUrl, fetchFn }: Props) {
  const [resultado, setResultado] = useState<ResultadoSalud | null>(null);
  const [consulta, setConsulta] = useState(0);

  useEffect(() => {
    let vigente = true;
    void consultarSalud(apiUrl, fetchFn).then((r) => {
      if (vigente) setResultado(r);
    });
    return () => {
      vigente = false;
    };
  }, [apiUrl, fetchFn, consulta]);

  const reintentar = useCallback(() => {
    setResultado(null);
    setConsulta((n) => n + 1);
  }, []);

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.titulo}>API</Text>
      <Text selectable>{apiUrl}</Text>
      {resultado === null ? (
        <ActivityIndicator accessibilityLabel="Consultando la API" />
      ) : resultado.ok ? (
        <Text>Estado: {resultado.estado}</Text>
      ) : (
        <View style={estilos.bloque}>
          <Text accessibilityRole="alert">{resultado.error}</Text>
          <Button title="Reintentar" onPress={reintentar} />
        </View>
      )}

      <Text style={estilos.titulo}>Formato de montos (R-2.5)</Text>
      {MONTOS_R_2_5.map((centavos) => (
        <Text key={centavos}>
          {centavos} → {formatearMXNSinIntl(centavos)}
        </Text>
      ))}
      <Text>formatToParts con number: {FORMAT_TO_PARTS.numero ? 'sí' : 'no'}</Text>
      <Text>formatToParts con BigInt: {FORMAT_TO_PARTS.bigint ? 'sí' : 'no'}</Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 8 },
  titulo: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  bloque: { gap: 8 },
});
