import type { EntityManager } from 'typeorm';
import type { FilaMovimiento, TipoMovimiento } from './movimientos.dominio.js';

/** Filtros ya validados (§8.1 paso 2) y cursor ya decodificado (§8.3). */
export interface FiltrosConsulta {
  cuentaId: string;
  limite: number;
  /** ZONA_HORARIA de shared; viaja como parámetro (§8.4). */
  zona: string;
  tipo?: TipoMovimiento;
  desde?: string;
  hasta?: string;
  cursor?: { creadoEn: string; id: string };
}

export interface Consulta {
  sql: string;
  parametros: unknown[];
}

// DD-37: el texto SQL solo se forma con estos fragmentos constantes. Ningún valor de la
// petición entra al texto: todos van como $n, numerados según los fragmentos incluidos.
const SELECT = `SELECT a.id, a.tipo_movimiento, a.monto_centavos, a.creado_en,
       t.id AS transferencia_id, t.concepto, t.referencia,
       b.alias   AS beneficiario_alias,
       co.nombre AS contraparte_nombre,
       co.clabe  AS contraparte_clabe
  FROM asiento a
  JOIN transferencia t ON t.id = a.transferencia_id
  JOIN cuenta co       ON co.id = CASE WHEN a.monto_centavos < 0
                                       THEN t.cuenta_destino_id
                                       ELSE t.cuenta_origen_id END
  LEFT JOIN beneficiario b ON b.id = t.beneficiario_id AND a.monto_centavos < 0
 WHERE a.cuenta_id = `;

/**
 * §8.1 a §8.4: la consulta del historial con `LIMIT limite + 1` (D-11), sin `OFFSET` (RNF-13).
 * Pura, para que la prueba de DD-37 recorra todas las combinaciones de filtros.
 */
export function construirConsultaMovimientos(f: FiltrosConsulta): Consulta {
  const parametros: unknown[] = [];
  const p = (valor: unknown) => `$${parametros.push(valor)}`;

  let sql = SELECT + p(f.cuentaId);
  if (f.tipo !== undefined) sql += `\n   AND a.tipo_movimiento = ${p(f.tipo)}`;
  // §8.4: días de calendario locales → [desde 00:00, hasta + 1 día 00:00) con la zona con nombre.
  // La zona se agrega una sola vez, solo si hay algún filtro de fecha.
  let pZona: string | undefined;
  const zonaParam = () => (pZona ??= p(f.zona));
  if (f.desde !== undefined) {
    const desde = p(f.desde);
    sql += `\n   AND a.creado_en >= (${desde}::date)::timestamp AT TIME ZONE ${zonaParam()}`;
  }
  if (f.hasta !== undefined) {
    const hasta = p(f.hasta);
    sql += `\n   AND a.creado_en < ((${hasta}::date) + 1)::timestamp AT TIME ZONE ${zonaParam()}`;
  }
  if (f.cursor) {
    // §8.2: la tupla es condición del índice (creado_en DESC, id DESC).
    const c = p(f.cursor.creadoEn);
    const i = p(f.cursor.id);
    sql += `\n   AND (a.creado_en, a.id) < (${c}::timestamptz, ${i}::bigint)`;
  }
  sql += `\n ORDER BY a.creado_en DESC, a.id DESC\n LIMIT ${p(f.limite + 1)}`;
  return { sql, parametros };
}

/** Hasta `limite + 1` filas de la cuenta, en el orden de D-11. */
export async function consultarMovimientos(
  tx: EntityManager,
  filtros: FiltrosConsulta,
): Promise<FilaMovimiento[]> {
  const { sql, parametros } = construirConsultaMovimientos(filtros);
  return (await tx.query(sql, parametros)) as FilaMovimiento[];
}
