// design.md §8.5 y DD-37: `npm run db:explicar`. ANALYZE como dueño y después
// EXPLAIN (ANALYZE, BUFFERS) de la consulta real del historial (construirConsultaMovimientos)
// sobre la cuenta caliente del seed, con el rol de la API (billetera_app).
import { ZONA_HORARIA } from '@billetera/shared';
import pg from 'pg';
import {
  construirConsultaMovimientos,
  type FiltrosConsulta,
} from '../modulos/movimientos/movimientos.repositorio.js';
import { registrarParsers } from '../plataforma/db/parsers.js';
import { crearLogger } from '../plataforma/logging/logger.js';
import { CORREO_CARGA } from './seed/volumen.js';
import { revisarEntornoSeed } from './seed/guarda.js';

const logger = crearLogger();
// La misma guarda del seed: nunca en producción ni contra billetera_test.
const entorno = revisarEntornoSeed(process.env);

interface Variante {
  numero: number;
  nombre: string;
  filtros: FiltrosConsulta;
  /** Variante 5: referencia sin recorrido de índice. */
  sinIndexScan?: boolean;
}

async function conectar(url: string): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url, options: '-c TimeZone=UTC' });
  await cliente.connect();
  return cliente;
}

async function explicar(app: pg.Client, variante: Variante): Promise<string> {
  const { sql, parametros } = construirConsultaMovimientos(variante.filtros);
  await app.query('BEGIN');
  try {
    if (variante.sinIndexScan) await app.query('SET LOCAL enable_indexscan = off');
    const { rows } = await app.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN (ANALYZE, BUFFERS) ${sql}`,
      parametros,
    );
    return rows.map((r) => r['QUERY PLAN']).join('\n');
  } finally {
    await app.query('ROLLBACK');
  }
}

if (!entorno.ok) {
  logger.error({ motivos: entorno.motivos }, 'db:explicar se niega a correr');
  process.exitCode = 1;
} else {
  registrarParsers();
  const dueno = await conectar(entorno.urlDueno);
  const app = await conectar(entorno.config.DATABASE_URL);
  try {
    await dueno.query('ANALYZE');
    const { rows: caliente } = await dueno.query<{ id: string; movimientos: number }>(
      `SELECT c.id, (SELECT count(*) FROM asiento a WHERE a.cuenta_id = c.id)::bigint AS movimientos
         FROM cuenta c JOIN usuario u ON u.id = c.usuario_id
        WHERE u.correo = $1 AND c.nombre = 'Principal'`,
      [CORREO_CARGA],
    );
    const cuenta = caliente[0];
    if (!cuenta) throw new Error('No existe la cuenta caliente: corre npm run db:seed');

    // Variante 2: el cursor que tendría el cliente después de unos 25,000 movimientos. Solo el
    // script usa OFFSET, para fabricar el cursor; la consulta medida no lo usa (RNF-13).
    const { rows: profundo } = await dueno.query<{ creado_en: string; id: number }>(
      `SELECT creado_en, id FROM asiento WHERE cuenta_id = $1
        ORDER BY creado_en DESC, id DESC OFFSET 24999 LIMIT 1`,
      [cuenta.id],
    );
    const fila = profundo[0];
    if (!fila) throw new Error('La cuenta caliente tiene menos de 25,000 movimientos');

    // Variante 4: el mes calendario anterior al actual, en hora local (§8.4).
    const { rows: mes } = await dueno.query<{ desde: string; hasta: string }>(
      `SELECT to_char(date_trunc('month', now() AT TIME ZONE $1) - interval '1 month', 'YYYY-MM-DD') AS desde,
              to_char(date_trunc('month', now() AT TIME ZONE $1) - interval '1 day', 'YYYY-MM-DD') AS hasta`,
      [ZONA_HORARIA],
    );
    const { desde = '', hasta = '' } = mes[0] ?? {};

    const base = { cuentaId: cuenta.id, limite: 20, zona: ZONA_HORARIA };
    const variantes: Variante[] = [
      { numero: 1, nombre: 'Primera página, sin filtros, limite = 20', filtros: base },
      {
        numero: 2,
        nombre: 'Página profunda, cursor a 25,000 movimientos del inicio',
        filtros: { ...base, cursor: { creadoEn: fila.creado_en, id: String(fila.id) } },
      },
      {
        numero: 3,
        nombre: 'Filtro tipo = ENVIO, primera página',
        filtros: { ...base, tipo: 'ENVIO' },
      },
      {
        numero: 4,
        nombre: `Rango de un mes: desde ${desde} hasta ${hasta}`,
        filtros: { ...base, desde, hasta },
      },
      {
        numero: 5,
        nombre: 'Referencia: la variante 1 con SET enable_indexscan = off',
        filtros: base,
        sinIndexScan: true,
      },
    ];

    const salida = [`Cuenta caliente: ${cuenta.movimientos} movimientos`];
    for (const variante of variantes) {
      salida.push('', `### Variante ${variante.numero}: ${variante.nombre}`, '');
      salida.push(await explicar(app, variante));
    }
    process.stdout.write(`${salida.join('\n')}\n`);
  } catch (error) {
    logger.error({ err: error }, 'db:explicar falló');
    process.exitCode = 1;
  } finally {
    await dueno.end();
    await app.end();
  }
}
