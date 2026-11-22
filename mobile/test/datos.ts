// Datos de prueba con la forma del contrato (openapi.yaml).
import type { Cuenta, Limites, Movimiento } from '@billetera/shared';

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
