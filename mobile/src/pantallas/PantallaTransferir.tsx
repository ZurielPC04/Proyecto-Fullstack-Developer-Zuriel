// Transferir (design.md §13.3, R-4.26, R-4.33): solo a beneficiarios registrados. El monto pasa
// por `montoTextoACentavos` y el cuerpo por `esquemaTransferencia` de shared, sin copiarlos.
import {
  type Beneficiario,
  type Cuenta,
  esquemaTransferencia,
  formatearMXNSinIntl,
  montoTextoACentavos,
  type SolicitudTransferencia,
} from '@billetera/shared';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../contexto';
import { ErrorConReintento } from './ErrorConReintento';
import { useCarga } from './useCarga';

/** Lo que Confirmar muestra y lo que el motor envía, ya congelado (R-4.27). */
export type DatosConfirmar = {
  cuerpo: SolicitudTransferencia;
  origen: string;
  destino: string;
};

type Props = { alContinuar: (datos: DatosConfirmar) => void };

type Campo = 'cuentaOrigenId' | 'destino' | 'montoCentavos' | 'concepto' | 'referencia';
type Errores = Partial<Record<Campo, string>>;

export const SIN_BENEFICIARIOS = 'Registra un beneficiario en la web';

export function PantallaTransferir({ alContinuar }: Props) {
  const { cliente } = useApp();
  const cargar = useCallback(
    () => Promise.all([cliente.get('/cuentas'), cliente.get('/beneficiarios')]),
    [cliente],
  );
  const carga = useCarga(cargar);

  if (carga.estado === 'cargando') {
    return (
      <View style={estilos.contenedor}>
        <ActivityIndicator accessibilityLabel="Cargando cuentas y beneficiarios" />
      </View>
    );
  }
  if (carga.estado === 'error') {
    return (
      <View style={estilos.contenedor}>
        <ErrorConReintento
          titulo="No pudimos cargar tus cuentas y beneficiarios."
          error={carga.error}
          alReintentar={carga.reintentar}
        />
      </View>
    );
  }
  const [cuentas, beneficiarios] = carga.datos;
  if (beneficiarios.items.length === 0) {
    return (
      <View style={estilos.contenedor}>
        <Text style={estilos.titulo}>{SIN_BENEFICIARIOS}</Text>
        <Text>
          Desde la app solo puedes enviar a beneficiarios ya registrados. Agrégalos en la web con su
          CLABE.
        </Text>
      </View>
    );
  }
  return (
    <Formulario
      cuentas={cuentas.items}
      beneficiarios={beneficiarios.items}
      alContinuar={alContinuar}
    />
  );
}

function Formulario({
  cuentas,
  beneficiarios,
  alContinuar,
}: Props & { cuentas: Cuenta[]; beneficiarios: Beneficiario[] }) {
  const [cuentaOrigenId, setCuentaOrigenId] = useState(cuentas[0]?.id ?? '');
  const [beneficiarioId, setBeneficiarioId] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [errores, setErrores] = useState<Errores>({});

  function continuar() {
    const nuevos: Errores = {};
    const cuenta = cuentas.find((c) => c.id === cuentaOrigenId);
    const beneficiario = beneficiarios.find((b) => b.id === beneficiarioId);
    if (cuenta === undefined) nuevos.cuentaOrigenId = 'Elige la cuenta de origen.';
    if (beneficiario === undefined) nuevos.destino = 'Elige el beneficiario.';
    // R-4.33: texto a centavos sin multiplicar ni redondear.
    const centavos = montoTextoACentavos(monto);
    if (!centavos.ok) nuevos.montoCentavos = centavos.error;

    const resultado = esquemaTransferencia.safeParse({
      cuentaOrigenId,
      destino: { tipo: 'BENEFICIARIO', beneficiarioId },
      montoCentavos: centavos.ok ? centavos.centavos : 1,
      concepto,
      referencia,
    });
    if (!resultado.success) {
      for (const problema of resultado.error.issues) {
        const campo = problema.path[0] as Campo;
        nuevos[campo] ??= problema.message;
      }
    }
    if (Object.keys(nuevos).length > 0 || !resultado.success || !cuenta || !beneficiario) {
      setErrores(nuevos);
      return;
    }
    setErrores({});
    alContinuar({
      cuerpo: resultado.data,
      origen: cuenta.nombre,
      destino: `${beneficiario.alias} · ${beneficiario.nombre}`,
    });
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.titulo}>Cuenta de origen</Text>
      {cuentas.map((cuenta) => (
        <Opcion
          key={cuenta.id}
          etiqueta={`${cuenta.nombre} · ${formatearMXNSinIntl(cuenta.saldoCentavos)}`}
          elegida={cuenta.id === cuentaOrigenId}
          alElegir={() => setCuentaOrigenId(cuenta.id)}
        />
      ))}
      <ErrorCampo texto={errores.cuentaOrigenId} />

      <Text style={estilos.titulo}>Beneficiario</Text>
      {beneficiarios.map((b) => (
        <Opcion
          key={b.id}
          etiqueta={`${b.alias} · ${b.nombre} · ••${b.clabe.slice(-4)}`}
          elegida={b.id === beneficiarioId}
          alElegir={() => setBeneficiarioId(b.id)}
        />
      ))}
      <ErrorCampo texto={errores.destino} />

      <CampoTexto
        etiqueta="Monto"
        valor={monto}
        alCambiar={setMonto}
        teclado="decimal-pad"
        error={errores.montoCentavos}
      />
      <CampoTexto
        etiqueta="Concepto"
        valor={concepto}
        alCambiar={setConcepto}
        error={errores.concepto}
      />
      <CampoTexto
        etiqueta="Referencia"
        valor={referencia}
        alCambiar={setReferencia}
        teclado="number-pad"
        error={errores.referencia}
      />
      <Button title="Continuar" onPress={continuar} />
    </ScrollView>
  );
}

function Opcion({
  etiqueta,
  elegida,
  alElegir,
}: {
  etiqueta: string;
  elegida: boolean;
  alElegir: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: elegida }}
      accessibilityLabel={etiqueta}
      onPress={alElegir}
      style={[estilos.opcion, elegida && estilos.opcionElegida]}
    >
      <Text>
        {elegida ? '◉' : '○'} {etiqueta}
      </Text>
    </Pressable>
  );
}

function CampoTexto({
  etiqueta,
  valor,
  alCambiar,
  teclado = 'default',
  error,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (texto: string) => void;
  teclado?: 'default' | 'decimal-pad' | 'number-pad';
  error: string | undefined;
}) {
  return (
    <>
      <Text>{etiqueta}</Text>
      <TextInput
        accessibilityLabel={etiqueta}
        style={estilos.campo}
        value={valor}
        onChangeText={alCambiar}
        keyboardType={teclado}
        autoCorrect={false}
      />
      <ErrorCampo texto={error} />
    </>
  );
}

function ErrorCampo({ texto }: { texto: string | undefined }) {
  return texto ? <Text style={estilos.error}>{texto}</Text> : null;
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 8 },
  titulo: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  opcion: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10 },
  opcionElegida: { borderColor: '#1a56db' },
  campo: { borderWidth: 1, borderColor: '#888', borderRadius: 6, padding: 10 },
  error: { color: '#b00020' },
});
