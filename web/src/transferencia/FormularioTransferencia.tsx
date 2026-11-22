import {
  formatearMXN,
  type Beneficiario,
  type Cuenta,
  type SolicitudTransferencia,
} from '@billetera/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { Campo } from '../componentes/Campo';
import { CampoOpciones, type Opcion } from '../componentes/CampoOpciones';
import { codificarDestino, esquemaFormulario, type ValoresFormulario } from './formulario';

/** Lo que se congela al pasar a la confirmación (R-4.20), con los textos para mostrarlo. */
export type DatosCongelados = {
  solicitud: SolicitudTransferencia;
  origen: string;
  destino: string;
};

type Props = {
  cuentas: Cuenta[];
  beneficiarios: Beneficiario[];
  disponibleCentavos: number;
  valoresIniciales: ValoresFormulario | null;
  /** §13.2: los selectores quedan deshabilitados mientras cargan cuentas y beneficiarios. */
  cargando?: boolean;
  alContinuar: (datos: DatosCongelados, valores: ValoresFormulario) => void;
};

const terminacion = (clabe: string) => `···${clabe.slice(-4)}`;

function opcionesDestino(cuentas: Cuenta[], beneficiarios: Beneficiario[], origen: string) {
  const deBeneficiarios: Opcion[] = beneficiarios.map((b) => ({
    valor: codificarDestino({ tipo: 'BENEFICIARIO', beneficiarioId: b.id }),
    etiqueta: `${b.alias} (${b.nombre}) ${terminacion(b.clabe)}`,
  }));
  const propias: Opcion[] = cuentas
    .filter((c) => c.id !== origen)
    .map((c) => ({
      valor: codificarDestino({ tipo: 'CUENTA_PROPIA', cuentaId: c.id }),
      etiqueta: `${c.nombre} (cuenta propia) ${terminacion(c.clabe)}`,
    }));
  return [...deBeneficiarios, ...propias];
}

/**
 * Captura de la transferencia (design.md §13.2). Valida con el esquema de shared antes de pasar
 * a la confirmación; el monto es texto con `inputMode="decimal"` (R-4.33).
 */
export function FormularioTransferencia({
  cuentas,
  beneficiarios,
  disponibleCentavos,
  valoresIniciales,
  cargando = false,
  alContinuar,
}: Props) {
  const valores: ValoresFormulario = valoresIniciales ?? {
    cuentaOrigenId: cuentas[0]?.id ?? '',
    destino: '',
    monto: '',
    concepto: '',
    referencia: '',
  };
  const {
    register,
    handleSubmit,
    getValues,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(esquemaFormulario), defaultValues: valores });
  const origen = useWatch({ control, name: 'cuentaOrigenId' });
  const destinos = opcionesDestino(cuentas, beneficiarios, origen);

  const continuar = handleSubmit((solicitud) => {
    const etiquetaDe = (opciones: Opcion[], valor: string) =>
      opciones.find((o) => o.valor === valor)?.etiqueta ?? '';
    const capturados = getValues();
    alContinuar(
      {
        solicitud,
        origen: etiquetaDe(opcionesOrigen(cuentas), capturados.cuentaOrigenId),
        destino: etiquetaDe(destinos, capturados.destino),
      },
      capturados,
    );
  });

  return (
    <form onSubmit={continuar} noValidate aria-label="Datos de la transferencia">
      <CampoOpciones
        id="transferencia-origen"
        leyenda="Cuenta de origen"
        opciones={opcionesOrigen(cuentas)}
        registro={register('cuentaOrigenId')}
        error={errors.cuentaOrigenId?.message}
        disabled={cargando}
      />
      {cargando ? (
        <CampoOpciones
          id="transferencia-destino"
          leyenda="Destino"
          opciones={[]}
          registro={register('destino')}
          disabled
        />
      ) : destinos.length === 0 ? (
        <p>
          No tienes destinos. <Link to="/beneficiarios">Registra un beneficiario</Link>
        </p>
      ) : (
        <CampoOpciones
          id="transferencia-destino"
          leyenda="Destino"
          opciones={destinos}
          registro={register('destino')}
          error={errors.destino?.message}
        />
      )}
      <Campo
        id="transferencia-monto"
        etiqueta="Monto"
        inputMode="decimal"
        autoComplete="off"
        registro={register('monto')}
        error={errors.monto?.message}
      />
      <p>Disponible hoy para transferir a terceros: {formatearMXN(disponibleCentavos)}</p>
      <Campo
        id="transferencia-concepto"
        etiqueta="Concepto"
        autoComplete="off"
        registro={register('concepto')}
        error={errors.concepto?.message}
      />
      <Campo
        id="transferencia-referencia"
        etiqueta="Referencia"
        inputMode="numeric"
        autoComplete="off"
        registro={register('referencia')}
        error={errors.referencia?.message}
      />
      <button type="submit" disabled={cargando}>
        Continuar
      </button>
    </form>
  );
}

function opcionesOrigen(cuentas: Cuenta[]): Opcion[] {
  return cuentas.map((c) => ({
    valor: c.id,
    etiqueta: `${c.nombre} ${terminacion(c.clabe)}, saldo ${formatearMXN(c.saldoCentavos)}`,
  }));
}
