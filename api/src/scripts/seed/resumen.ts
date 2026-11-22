// design.md §3.7: "el mismo resultado" sin los uuid: correos, CLABEs, saldos, beneficiarios y
// conteos por tabla. Dos corridas del seed deben dar exactamente este mismo objeto.
import type pg from 'pg';

const TABLAS = [
  'usuario',
  'cuenta',
  'beneficiario',
  'transferencia',
  'asiento',
  'codigo_confirmacion',
  'sesion',
  'evento_auditoria',
];

export async function leerResumen(dueno: pg.Client) {
  const conteos: Record<string, number> = {};
  for (const tabla of TABLAS) {
    const { rows } = await dueno.query<{ n: number }>(`SELECT count(*)::bigint AS n FROM ${tabla}`);
    conteos[tabla] = rows[0]?.n ?? -1;
  }
  // Solo los usuarios demo (dominio demo.mx) con detalle; el volumen se resume en los conteos.
  const cuentas = await dueno.query<{
    correo: string;
    nombre: string;
    clabe: string;
    saldo: number;
  }>(`
    SELECT u.correo, c.nombre, c.clabe, c.saldo_centavos AS saldo
      FROM cuenta c JOIN usuario u ON u.id = c.usuario_id
     WHERE u.correo LIKE '%@demo.mx'
     ORDER BY u.correo, c.nombre`);
  const beneficiarios = await dueno.query<{ de: string; alias: string; clabe: string }>(`
    SELECT u.correo AS de, b.alias, b.clabe
      FROM beneficiario b JOIN usuario u ON u.id = b.usuario_id
     WHERE u.correo LIKE '%@demo.mx' AND u.correo <> 'carga@demo.mx'
     ORDER BY u.correo, b.alias`);
  const saldos = await dueno.query<{ suma: number; fondeo: number }>(`
    SELECT (SELECT sum(saldo_centavos) FROM cuenta WHERE tipo = 'USUARIO')::bigint AS suma,
           (SELECT saldo_centavos FROM cuenta WHERE tipo = 'SISTEMA') AS fondeo`);
  return {
    conteos,
    cuentasDemo: cuentas.rows,
    beneficiariosDemo: beneficiarios.rows,
    saldosUsuarios: saldos.rows[0]?.suma ?? 0,
    saldoFondeo: saldos.rows[0]?.fondeo ?? 0,
  };
}
