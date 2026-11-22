import { describe, expect, it } from 'vitest';
import {
  construirConsultaMovimientos,
  type FiltrosConsulta,
} from '../../src/modulos/movimientos/movimientos.repositorio.js';

// DD-37: valores marcadores que no pueden coincidir con ningún fragmento SQL.
const MARCAS = {
  cuentaId: 'MARCA-CUENTA-7f3a',
  tipo: 'MARCA-TIPO-91c2',
  desde: 'MARCA-DESDE-0b4e',
  hasta: 'MARCA-HASTA-5d18',
  creadoEn: 'MARCA-CREADO-e6a0',
  id: 'MARCA-ID-2c97',
  zona: 'MARCA-ZONA-44f1',
} as const;

const OPCIONALES = ['tipo', 'desde', 'hasta', 'cursor'] as const;

/** Las 16 combinaciones de filtros opcionales. */
function combinaciones(): FiltrosConsulta[] {
  const todas: FiltrosConsulta[] = [];
  for (let mascara = 0; mascara < 2 ** OPCIONALES.length; mascara++) {
    const incluye = (i: number) => (mascara & (1 << i)) !== 0;
    todas.push({
      cuentaId: MARCAS.cuentaId,
      limite: 987_654,
      zona: MARCAS.zona,
      ...(incluye(0) ? { tipo: MARCAS.tipo } : {}),
      ...(incluye(1) ? { desde: MARCAS.desde } : {}),
      ...(incluye(2) ? { hasta: MARCAS.hasta } : {}),
      ...(incluye(3) ? { cursor: { creadoEn: MARCAS.creadoEn, id: MARCAS.id } } : {}),
    } as FiltrosConsulta);
  }
  return todas;
}

/** Los valores de la petición que deben viajar como parámetro en esta combinación. */
function valoresEsperados(f: FiltrosConsulta): unknown[] {
  const valores: unknown[] = [f.cuentaId, f.limite + 1];
  if (f.tipo !== undefined) valores.push(f.tipo);
  if (f.desde !== undefined) valores.push(f.desde);
  if (f.hasta !== undefined) valores.push(f.hasta);
  if (f.desde !== undefined || f.hasta !== undefined) valores.push(f.zona);
  if (f.cursor) valores.push(f.cursor.creadoEn, f.cursor.id);
  return valores;
}

describe('construirConsultaMovimientos (DD-37)', () => {
  it.each(combinaciones().map((f) => [JSON.stringify(Object.keys(f)), f] as const))(
    'RNF-13 R-5.5 R-5.6 DD-37: %s — ningún valor en el texto SQL, todos como parámetro y sin OFFSET',
    (_nombre, filtros) => {
      const { sql, parametros } = construirConsultaMovimientos(filtros);
      for (const marca of [...Object.values(MARCAS), '987654', '987655']) {
        expect(sql).not.toContain(marca);
      }
      expect(sql.toUpperCase()).not.toContain('OFFSET');
      expect(new Set(parametros)).toEqual(new Set(valoresEsperados(filtros)));
      // Cada $n del texto existe en el arreglo y cada parámetro se usa.
      const usados = new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
      expect([...usados].sort((a, b) => a - b)).toEqual(parametros.map((_, i) => i + 1));
    },
  );

  it('D-11 R-5.4: orden creado_en DESC, id DESC con LIMIT limite + 1 y el cursor como tupla', () => {
    const { sql, parametros } = construirConsultaMovimientos({
      cuentaId: MARCAS.cuentaId,
      limite: 20,
      zona: MARCAS.zona,
      cursor: { creadoEn: MARCAS.creadoEn, id: MARCAS.id },
    });
    expect(sql).toMatch(/ORDER BY a\.creado_en DESC, a\.id DESC\s+LIMIT \$\d+/);
    expect(sql).toMatch(/\(a\.creado_en, a\.id\) < \(\$\d+::timestamptz, \$\d+::bigint\)/);
    expect(parametros).toContain(21);
  });
});
