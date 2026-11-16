import { describe, expect, it } from 'vitest';
import { esquemaQueryEstadoCuenta, esquemaQueryMovimientos } from '../src/esquemas/historial.js';

function campos(entrada: unknown) {
  const r = esquemaQueryMovimientos.safeParse(entrada);
  return r.error?.issues.map((i) => i.path.join('.')) ?? [];
}

describe('esquemaQueryMovimientos', () => {
  it('R-5.2 sin parámetros, limite vale 20', () => {
    expect(esquemaQueryMovimientos.parse({})).toEqual({ limite: 20 });
  });

  it('R-5.5 R-5.6 acepta todos los filtros juntos', () => {
    const query = {
      limite: '50',
      cursor: 'eyJ2IjoxfQ',
      desde: '2026-11-01',
      hasta: '2026-11-15',
      tipo: 'ENVIO',
    };
    expect(esquemaQueryMovimientos.parse(query)).toEqual({ ...query, limite: 50 });
  });

  it('RNF-01 rechaza un parámetro desconocido', () => {
    expect(esquemaQueryMovimientos.safeParse({ pagina: '2' }).success).toBe(false);
  });

  describe('limite', () => {
    it.each([
      ['1', 1],
      ['100', 100],
    ])('R-5.2 acepta "%s" y lo convierte en número', (limite, esperado) => {
      expect(esquemaQueryMovimientos.parse({ limite }).limite).toBe(esperado);
    });

    it.each(['1e2', '0', '101', '', '020', '-1', '1.5', ' 10'])('R-5.2 rechaza "%s"', (limite) => {
      expect(campos({ limite })).toEqual(['limite']);
    });

    it('R-5.2 RNF-01 rechaza el parámetro repetido', () => {
      expect(campos({ limite: ['10', '20'] })).toEqual(['limite']);
    });
  });

  describe('cursor', () => {
    it('R-5.7 acepta 512 caracteres', () => {
      expect(esquemaQueryMovimientos.safeParse({ cursor: 'a'.repeat(512) }).success).toBe(true);
    });

    it.each([
      ['vacío', ''],
      ['de 513 caracteres', 'a'.repeat(513)],
    ])('R-5.7 rechaza un cursor %s como error de validación', (_, cursor) => {
      expect(campos({ cursor })).toEqual(['cursor']);
    });
  });

  describe('desde y hasta', () => {
    it('R-5.5 acepta desde igual a hasta', () => {
      const query = { desde: '2026-11-15', hasta: '2026-11-15' };
      expect(esquemaQueryMovimientos.safeParse(query).success).toBe(true);
    });

    it('R-5.5 acepta solo desde o solo hasta', () => {
      expect(esquemaQueryMovimientos.safeParse({ desde: '2026-11-01' }).success).toBe(true);
      expect(esquemaQueryMovimientos.safeParse({ hasta: '2026-11-01' }).success).toBe(true);
    });

    it('R-5.5 acepta el 29 de febrero de un año bisiesto', () => {
      expect(esquemaQueryMovimientos.safeParse({ desde: '2028-02-29' }).success).toBe(true);
    });

    it.each([
      '2026-02-30',
      '2026-02-29',
      '2026-13-01',
      '2026-11-1',
      '15/11/2026',
      '2026-11-15T00:00:00Z',
    ])('R-5.5 rechaza la fecha %s', (desde) => {
      expect(campos({ desde })).toEqual(['desde']);
    });

    it('R-5.5 desde posterior a hasta da el error en hasta', () => {
      expect(campos({ desde: '2026-11-16', hasta: '2026-11-15' })).toEqual(['hasta']);
    });
  });

  describe('tipo', () => {
    it.each(['DEPOSITO', 'ENVIO', 'RECEPCION', 'TRASPASO_SALIDA', 'TRASPASO_ENTRADA'])(
      'R-5.6 acepta %s',
      (tipo) => {
        expect(esquemaQueryMovimientos.parse({ tipo }).tipo).toBe(tipo);
      },
    );

    it.each(['FONDEO_SALIDA', 'envio', ''])('R-5.6 DD-13 rechaza %s', (tipo) => {
      expect(campos({ tipo })).toEqual(['tipo']);
    });

    it('R-5.6 RNF-01 rechaza el parámetro repetido', () => {
      expect(campos({ tipo: ['ENVIO', 'RECEPCION'] })).toEqual(['tipo']);
    });
  });
});

describe('esquemaQueryEstadoCuenta', () => {
  it.each(['2026-10', '2026-01', '2026-12'])('R-B1.1 acepta el mes %s', (mes) => {
    expect(esquemaQueryEstadoCuenta.parse({ mes })).toEqual({ mes });
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', '', ' 2026-10'])(
    'R-B1.5 rechaza el mes "%s"',
    (mes) => {
      const r = esquemaQueryEstadoCuenta.safeParse({ mes });
      expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(['mes']);
    },
  );

  it('R-B1.5 el mes es obligatorio', () => {
    expect(esquemaQueryEstadoCuenta.safeParse({}).success).toBe(false);
  });

  it('R-B1.5 RNF-01 rechaza un parámetro desconocido o repetido', () => {
    expect(esquemaQueryEstadoCuenta.safeParse({ mes: '2026-10', formato: 'csv' }).success).toBe(
      false,
    );
    expect(esquemaQueryEstadoCuenta.safeParse({ mes: ['2026-10', '2026-11'] }).success).toBe(false);
  });
});
