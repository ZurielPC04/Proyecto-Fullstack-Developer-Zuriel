import { describe, expect, it } from 'vitest';
import {
  respuestaDeTransferencia,
  type FilaTransferencia,
} from '../../src/modulos/transferencias/transferencias.respuesta.js';

const aplicada: FilaTransferencia = {
  id: '0b6f1f8e-4f0c-4b8e-9a51-7d0e0f6a2c11',
  estado: 'APLICADA',
  tipo: 'TERCERO',
  montoCentavos: 12345,
  concepto: 'Renta',
  referencia: '0012',
  origen: {
    cuentaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    nombre: 'Principal',
    clabe: '999180000000001234',
  },
  destino: {
    cuentaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    etiqueta: 'Casero',
    nombre: 'Juan Pérez',
    clabe: '999180000000005678',
  },
  creadoEn: '2026-11-14 16:05:09.12345+00',
  aplicadaEn: '2026-11-14 16:05:09.12345+00',
  motivoRechazo: null,
  codigo: null,
};

describe('respuestaDeTransferencia (§6.2)', () => {
  it('R-4.1 DD-34 aplicada sin código → 201 con el comprobante y solo 4 dígitos de CLABE', () => {
    expect(respuestaDeTransferencia(aplicada)).toEqual({
      status: 201,
      cuerpo: {
        transferenciaId: '0b6f1f8e-4f0c-4b8e-9a51-7d0e0f6a2c11',
        estado: 'APLICADA',
        tipo: 'TERCERO',
        montoCentavos: 12345,
        concepto: 'Renta',
        referencia: '0012',
        origen: {
          cuentaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          nombre: 'Principal',
          clabeTerminacion: '1234',
        },
        destino: { etiqueta: 'Casero', nombre: 'Juan Pérez', clabeTerminacion: '5678' },
        creadaEn: '2026-11-14T16:05:09.123450Z',
        aplicadaEn: '2026-11-14T16:05:09.123450Z',
      },
    });
  });

  it('R-6.8 DD-32 DD-25 creada como pendiente → 202 sin codigoSimulado, aunque ya se haya aplicado', () => {
    const pendiente: FilaTransferencia = {
      ...aplicada,
      codigo: { expiraEn: '2026-11-14 16:10:09.12345+00', intentos: 0 },
    };
    const esperado = {
      status: 202,
      cuerpo: {
        transferenciaId: '0b6f1f8e-4f0c-4b8e-9a51-7d0e0f6a2c11',
        estado: 'PENDIENTE_CONFIRMACION',
        montoCentavos: 12345,
        codigoExpiraEn: '2026-11-14T16:10:09.123450Z',
      },
    };
    expect(
      respuestaDeTransferencia({
        ...pendiente,
        estado: 'PENDIENTE_CONFIRMACION',
        aplicadaEn: null,
      }),
    ).toEqual(esperado);
    expect(respuestaDeTransferencia(pendiente)).toEqual(esperado);
  });

  it('R-4.3 DD-23 rechazada sin código → 422 con type del motivo, motivo y transferenciaId', () => {
    const rechazada: FilaTransferencia = {
      ...aplicada,
      estado: 'RECHAZADA',
      aplicadaEn: null,
      motivoRechazo: 'SALDO_INSUFICIENTE',
    };
    expect(respuestaDeTransferencia(rechazada)).toEqual({
      status: 422,
      cuerpo: {
        type: 'saldo-insuficiente',
        title: 'Saldo insuficiente',
        status: 422,
        detail: 'La cuenta origen no tiene saldo suficiente para esta transferencia.',
        motivo: 'SALDO_INSUFICIENTE',
        transferenciaId: '0b6f1f8e-4f0c-4b8e-9a51-7d0e0f6a2c11',
      },
    });
  });
});
