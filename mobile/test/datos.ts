// Datos de prueba con la forma del contrato (openapi.yaml).
import type {
  Beneficiario,
  Comprobante,
  Cuenta,
  Limites,
  Movimiento,
  PendienteConfirmacion,
  SolicitudTransferencia,
} from '@billetera/shared';

export const CUENTAS: Cuenta[] = [
  { id: 'c1', nombre: 'Principal', clabe: '646180000000000001', saldoCentavos: 123456 },
  { id: 'c2', nombre: 'Ahorro', clabe: '646180000000000002', saldoCentavos: 5 },
];

export const LIMITES: Limites = {
  limiteCentavos: 5_000_000,
  consumidoCentavos: 250,
  disponibleCentavos: 4_999_750,
  dia: '2026-11-22',
  reiniciaEn: '2026-11-23T06:00:00.000Z',
};

export function movimiento(
  id: string,
  tipo: Movimiento['tipo'],
  montoCentavos: number,
  etiqueta: string,
): Movimiento {
  return {
    id,
    transferenciaId: `00000000-0000-4000-8000-00000000000${id.length}`,
    tipo,
    montoCentavos,
    fecha: '2026-11-22T18:30:00.000Z',
    concepto: `Concepto ${id}`,
    referencia: tipo === 'DEPOSITO' ? null : '1234567',
    contraparte: { etiqueta, clabeTerminacion: tipo === 'DEPOSITO' ? null : '0001' },
  };
}

// Transferencias (T-MOB-04 y T-MOB-05): ids con formato UUID, como exige `esquemaTransferencia`.
export const USUARIO = '11111111-1111-4111-8111-111111111111';
export const OTRO_USUARIO = '22222222-2222-4222-8222-222222222222';
export const CUENTA_ORIGEN = '33333333-3333-4333-8333-333333333333';
export const BENEFICIARIO = '44444444-4444-4444-8444-444444444444';
export const TRANSFERENCIA = '55555555-5555-4555-8555-555555555555';

export const CUENTAS_UUID: Cuenta[] = [
  { id: CUENTA_ORIGEN, nombre: 'Principal', clabe: '646180000000000001', saldoCentavos: 5_000_000 },
];

export const BENEFICIARIOS: Beneficiario[] = [
  {
    id: BENEFICIARIO,
    nombre: 'Luis Pérez',
    alias: 'Luis',
    clabe: '646180000000000099',
    esCuentaPropia: false,
  },
];

export const CUERPO: SolicitudTransferencia = {
  cuentaOrigenId: CUENTA_ORIGEN,
  destino: { tipo: 'BENEFICIARIO', beneficiarioId: BENEFICIARIO },
  montoCentavos: 150_050,
  concepto: 'Renta',
  referencia: '1234567',
};

export const COMPROBANTE: Comprobante = {
  transferenciaId: TRANSFERENCIA,
  estado: 'APLICADA',
  tipo: 'TERCERO',
  montoCentavos: 150_050,
  concepto: 'Renta',
  referencia: '1234567',
  origen: { cuentaId: CUENTA_ORIGEN, nombre: 'Principal', clabeTerminacion: '0001' },
  destino: { etiqueta: 'Luis', nombre: 'Luis Pérez', clabeTerminacion: '0099' },
  creadaEn: '2026-11-22T18:30:00.000Z',
  aplicadaEn: '2026-11-22T18:30:00.000Z',
};

export const PENDIENTE: PendienteConfirmacion = {
  transferenciaId: TRANSFERENCIA,
  estado: 'PENDIENTE_CONFIRMACION',
  montoCentavos: 1_500_000,
  codigoExpiraEn: '2026-11-22T18:35:00.000Z',
  codigoSimulado: '123456',
};
