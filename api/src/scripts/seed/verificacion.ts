// design.md §3.7: verificación final del seed. Si algo falla, el seed termina con error.
import type pg from 'pg';

export interface ReporteSeed {
  asientos: number;
  /** Movimientos de la cuenta caliente; `null` si no existe (fase 1 sola). */
  movimientosCuentaCaliente: number | null;
  /** Cuentas con `saldo <> SUM(asientos)` (RNF-07, D-01). */
  cuentasDescuadradas: string[];
  /** `SUM(saldo)` de todas las cuentas; debe ser 0 (RNF-07, D-02). */
  sumaSaldos: number;
}

export interface Umbrales {
  asientosMinimos: number;
  /** `null` cuando no se exige cuenta caliente. */
  cuentaCalienteMinima: number | null;
}

/** Lista de fallas; vacía si el seed cuadra y alcanza los umbrales. */
export function evaluarVerificacion(reporte: ReporteSeed, umbrales: Umbrales): string[] {
  const fallas: string[] = [];
  const { cuentasDescuadradas: descuadradas } = reporte;
  if (descuadradas.length > 0) {
    fallas.push(
      `saldo distinto de SUM(asientos) en ${descuadradas.length} cuenta(s): ${descuadradas.join(', ')}`,
    );
  }
  if (reporte.sumaSaldos !== 0) fallas.push(`SUM(saldo) = ${reporte.sumaSaldos}, no 0`);
  if (reporte.asientos < umbrales.asientosMinimos) {
    fallas.push(`asientos = ${reporte.asientos}, se esperaban ${umbrales.asientosMinimos} o más`);
  }
  if (umbrales.cuentaCalienteMinima !== null) {
    if (reporte.movimientosCuentaCaliente === null) {
      fallas.push('no existe la cuenta caliente');
    } else if (reporte.movimientosCuentaCaliente < umbrales.cuentaCalienteMinima) {
      fallas.push(
        `cuenta caliente con ${reporte.movimientosCuentaCaliente} movimientos, se esperaban ${umbrales.cuentaCalienteMinima} o más`,
      );
    }
  }
  return fallas;
}

/** Lee el reporte como dueño. `cuentaCalienteId` es la Principal de `carga@demo.mx`, si existe. */
export async function leerReporte(
  cliente: pg.Client,
  cuentaCalienteId: string | null,
): Promise<ReporteSeed> {
  const descuadradas = await cliente.query<{ id: string }>(`
    SELECT c.id FROM cuenta c LEFT JOIN asiento a ON a.cuenta_id = c.id
     GROUP BY c.id
    HAVING c.saldo_centavos <> coalesce(sum(a.monto_centavos), 0)::bigint
     ORDER BY c.id`);
  const totales = await cliente.query<{ asientos: number; suma: number }>(`
    SELECT (SELECT count(*) FROM asiento)::bigint AS asientos,
           (SELECT coalesce(sum(saldo_centavos), 0) FROM cuenta)::bigint AS suma`);
  let caliente: number | null = null;
  if (cuentaCalienteId !== null) {
    const filas = await cliente.query<{ n: number }>(
      'SELECT count(*)::bigint AS n FROM asiento WHERE cuenta_id = $1',
      [cuentaCalienteId],
    );
    caliente = filas.rows[0]?.n ?? 0;
  }
  return {
    asientos: totales.rows[0]?.asientos ?? 0,
    movimientosCuentaCaliente: caliente,
    cuentasDescuadradas: descuadradas.rows.map((r) => r.id),
    sumaSaldos: totales.rows[0]?.suma ?? 0,
  };
}
