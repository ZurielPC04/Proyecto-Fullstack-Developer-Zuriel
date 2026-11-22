// design.md §3.7, fase 2 y DD-20: volumen por SQL masivo, como billetera_owner, en una sola
// transacción y con todos los triggers activos. Los saldos los mueve aplicar_asiento y la suma
// cero se verifica al confirmar. No genera eventos de auditoría (§10.2).
import type pg from 'pg';
import { clabeDeUsuario } from '../../modulos/cuentas/cuentas.dominio.js';

export const CORREO_CARGA = 'carga@demo.mx';
const SINTETICOS = 200;
/** Semilla fija (§3.7, H4): todo sale de md5(SEMILLA ‖ texto), nunca de random(). */
const SEMILLA = 'billetera-seed-v1:';
/** Formato argon2id para el CHECK de `usuario`; no corresponde a ninguna contraseña. */
const HASH_INUTILIZABLE =
  '$argon2id$v=19$m=19456,t=2,p=1$c2VlZC1zaW50ZXRpY28$c2luLWNvbnRyYXNlbmEtdmFsaWRh';

/** Usuario k: 0 es carga@demo.mx, 1 a 200 los sintéticos. */
const correoDe = (k: number) =>
  k === 0 ? CORREO_CARGA : `sintetico-${String(k).padStart(3, '0')}@sintetico.mx`;

/** Números de cuenta de 11 dígitos lejos de los demo (00000000001 a 00000000004). */
const numeroDe = (k: number, ahorro: boolean) => String(10_000_000_000 + k * 2 + (ahorro ? 1 : 0));

// Funciones temporales de la sesión: un entero de 32 bits y un uuid deterministas por texto.
const FUNCIONES = `
  CREATE FUNCTION pg_temp.h(t text) RETURNS bigint LANGUAGE sql IMMUTABLE AS
    $$ SELECT ('x' || substr(md5('${SEMILLA}' || t), 1, 8))::bit(32)::bigint $$;
  CREATE FUNCTION pg_temp.u(t text) RETURNS uuid LANGUAGE sql IMMUTABLE AS
    $$ SELECT md5('${SEMILLA}' || t)::uuid $$;
  CREATE FUNCTION pg_temp.cta(k int, nombre text) RETURNS uuid LANGUAGE sql IMMUTABLE AS
    $$ SELECT pg_temp.u('cuenta:' || k || ':' || nombre) $$;
  CREATE FUNCTION pg_temp.ben(de int, a int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
    $$ SELECT pg_temp.u('beneficiario:' || de || ':' || a) $$;
  -- Instante en los últimos 180 días, con microsegundos (§3.7).
  CREATE FUNCTION pg_temp.instante(base timestamptz, t text) RETURNS timestamptz LANGUAGE sql STABLE AS
    $$ SELECT base - interval '180 days'
              + (pg_temp.h('s:' || t) % 15552000) * interval '1 second'
              + (pg_temp.h('us:' || t) % 1000000) * interval '1 microsecond' $$;
`;

/**
 * Plan de las ~60,000 transferencias (§3.7). k = 0 es carga; los sintéticos van de 1 a 200.
 * La Principal de carga (la cuenta caliente) participa en A, B, C y D: 34,000 transferencias
 * con ENVIO, RECEPCION, TRASPASO_SALIDA y TRASPASO_ENTRADA; DEPOSITO sale de su fondeo.
 */
const PLAN = `
  CREATE TEMP TABLE vol_plan ON COMMIT DROP AS
  WITH segmentos AS (
    -- A: carga envía a un sintético (ENVIO en la cuenta caliente).
    SELECT 'A' AS seg, n, 'TERCERO' AS tipo, 0 AS de, 'Principal' AS de_cta,
           (pg_temp.h('A:' || n) % ${SINTETICOS} + 1)::int AS a, 'Principal' AS a_cta
      FROM generate_series(1, 12000) n
    UNION ALL -- B: un sintético envía a carga (RECEPCION).
    SELECT 'B', n, 'TERCERO', (pg_temp.h('B:' || n) % ${SINTETICOS} + 1)::int, 'Principal', 0, 'Principal'
      FROM generate_series(1, 12000) n
    UNION ALL -- C: carga, de Principal a Ahorro.
    SELECT 'C', n, 'TRASPASO', 0, 'Principal', 0, 'Ahorro' FROM generate_series(1, 5000) n
    UNION ALL -- D: carga, de Ahorro a Principal.
    SELECT 'D', n, 'TRASPASO', 0, 'Ahorro', 0, 'Principal' FROM generate_series(1, 5000) n
    UNION ALL -- E: entre sintéticos, hacia uno de sus 5 siguientes.
    SELECT 'E', n, 'TERCERO', k, 'Principal',
           ((k - 1 + 1 + (pg_temp.h('Eo:' || n) % 5)::int) % ${SINTETICOS}) + 1, 'Principal'
      FROM (SELECT n, (pg_temp.h('E:' || n) % ${SINTETICOS} + 1)::int AS k
              FROM generate_series(1, 18000) n) e
    UNION ALL -- F: traspasos de sintéticos, en las dos direcciones.
    SELECT 'F', n, 'TRASPASO', k,
           CASE WHEN n % 2 = 0 THEN 'Principal' ELSE 'Ahorro' END, k,
           CASE WHEN n % 2 = 0 THEN 'Ahorro' ELSE 'Principal' END
      FROM (SELECT n, (pg_temp.h('F:' || n) % ${SINTETICOS} + 1)::int AS k
              FROM generate_series(1, 8000) n) f
  )
  SELECT row_number() OVER (ORDER BY seg, n) AS orden,
         pg_temp.u('transferencia:' || seg || ':' || n) AS id,
         tipo,
         pg_temp.u('usuario:' || de) AS usuario_id,
         pg_temp.cta(de, de_cta) AS origen,
         pg_temp.cta(a, a_cta) AS destino,
         CASE WHEN tipo = 'TERCERO' THEN pg_temp.ben(de, a) END AS beneficiario_id,
         (100 + pg_temp.h('m:' || seg || ':' || n) % 49901)::bigint AS monto,
         CASE WHEN tipo = 'TERCERO' THEN 'Pago sintético' ELSE 'Traspaso sintético' END AS concepto,
         (pg_temp.h('r:' || seg || ':' || n) % 10000000)::text AS referencia,
         pg_temp.u('llave:' || seg || ':' || n) AS llave,
         md5('hash-a:' || seg || ':' || n) || md5('hash-b:' || seg || ':' || n) AS hash,
         pg_temp.instante($1::timestamptz, seg || ':' || n) AS instante
    FROM segmentos
`;

export interface ResultadoVolumen {
  cuentaCalienteId: string;
}

export async function sembrarVolumen(dueno: pg.Client): Promise<ResultadoVolumen> {
  const ks = Array.from({ length: SINTETICOS + 1 }, (_, k) => k);
  await dueno.query('BEGIN');
  try {
    await dueno.query(FUNCIONES);
    // Base del calendario: el inicio del día, para que dos corridas del mismo día coincidan.
    const { rows } = await dueno.query<{ base: string }>("SELECT date_trunc('day', now()) AS base");
    const base = rows[0]?.base;
    if (base === undefined) throw new Error('No se pudo leer la base del calendario');

    await dueno.query(
      `INSERT INTO usuario (id, correo, hash_contrasena)
       SELECT pg_temp.u('usuario:' || k), correo, $3 FROM unnest($1::int[], $2::text[]) AS x(k, correo)`,
      [ks, ks.map(correoDe), HASH_INUTILIZABLE],
    );
    // CLABEs con dígito verificador (§3.6); los ids, deterministas.
    const cuentas = ks.flatMap((k) =>
      (['Principal', 'Ahorro'] as const).map((nombre) => ({
        k,
        nombre,
        clabe: clabeDeUsuario(numeroDe(k, nombre === 'Ahorro')),
      })),
    );
    await dueno.query(
      `INSERT INTO cuenta (id, usuario_id, tipo, nombre, clabe)
       SELECT pg_temp.cta(k, nombre), pg_temp.u('usuario:' || k), 'USUARIO', nombre, clabe
         FROM unnest($1::int[], $2::text[], $3::text[]) AS x(k, nombre, clabe)`,
      [cuentas.map((c) => c.k), cuentas.map((c) => c.nombre), cuentas.map((c) => c.clabe)],
    );

    // §3.7, H4: carga → cada sintético; cada sintético → carga y → sus 5 siguientes.
    const pares: [number, number][] = [];
    for (let k = 1; k <= SINTETICOS; k++) {
      pares.push([0, k], [k, 0]);
      for (let paso = 1; paso <= 5; paso++) pares.push([k, ((k - 1 + paso) % SINTETICOS) + 1]);
    }
    await dueno.query(
      `INSERT INTO beneficiario (id, usuario_id, cuenta_id, nombre, alias, clabe)
       SELECT pg_temp.ben(de, a), pg_temp.u('usuario:' || de), c.id,
              CASE WHEN a = 0 THEN 'Carga Demo' ELSE 'Usuario sintético ' || lpad(a::text, 3, '0') END,
              CASE WHEN a = 0 THEN 'Carga' ELSE 'Sintético ' || lpad(a::text, 3, '0') END,
              c.clabe
         FROM unnest($1::int[], $2::int[]) AS x(de, a)
         JOIN cuenta c ON c.id = pg_temp.cta(a, 'Principal')`,
      [pares.map((p) => p[0]), pares.map((p) => p[1])],
    );

    // Un fondeo por cuenta, antes de todo el volumen: ningún saldo queda negativo (§3.7).
    await dueno.query(
      `CREATE TEMP TABLE vol_fondeo ON COMMIT DROP AS
       SELECT pg_temp.u('fondeo:' || c.id) AS id, c.id AS cuenta_id,
              CASE WHEN c.usuario_id = pg_temp.u('usuario:0') THEN 10000000000 ELSE 500000000 END::bigint AS monto,
              $1::timestamptz - interval '181 days' AS instante
         FROM cuenta c
        WHERE c.usuario_id IN (SELECT pg_temp.u('usuario:' || k) FROM generate_series(0, ${SINTETICOS}) k)
        ORDER BY c.id`,
      [base],
    );
    await dueno.query(`
      INSERT INTO transferencia (id, tipo, cuenta_origen_id, cuenta_destino_id, monto_centavos,
                                 concepto, estado, creado_en, aplicada_en)
      SELECT id, 'FONDEO', '00000000-0000-0000-0000-000000000001', cuenta_id, monto,
             'Depósito', 'APLICADA', instante, instante
        FROM vol_fondeo ORDER BY cuenta_id`);
    await dueno.query(`
      INSERT INTO asiento (transferencia_id, cuenta_id, monto_centavos, tipo_movimiento, creado_en)
      SELECT id, x.cuenta, x.monto, x.tipo, instante
        FROM vol_fondeo f
       CROSS JOIN LATERAL (VALUES ('00000000-0000-0000-0000-000000000001'::uuid, -f.monto, 'FONDEO_SALIDA', 1),
                                  (f.cuenta_id, f.monto, 'DEPOSITO', 2)) AS x(cuenta, monto, tipo, lado)
       ORDER BY f.cuenta_id, x.lado`);

    await dueno.query(PLAN, [base]);
    await dueno.query(`
      INSERT INTO transferencia (id, usuario_id, tipo, cuenta_origen_id, cuenta_destino_id, beneficiario_id,
                                 monto_centavos, concepto, referencia, estado, llave_idempotencia,
                                 hash_peticion, creado_en, aplicada_en)
      SELECT id, usuario_id, tipo, origen, destino, beneficiario_id, monto, concepto, referencia,
             'APLICADA', llave, hash, instante, instante
        FROM vol_plan ORDER BY orden`);
    // DD-17: los dos asientos de cada transferencia comparten el instante.
    await dueno.query(`
      INSERT INTO asiento (transferencia_id, cuenta_id, monto_centavos, tipo_movimiento, creado_en)
      SELECT p.id, x.cuenta, x.monto, x.tipo, p.instante
        FROM vol_plan p
       CROSS JOIN LATERAL (VALUES
         (p.origen, -p.monto, CASE p.tipo WHEN 'TERCERO' THEN 'ENVIO' ELSE 'TRASPASO_SALIDA' END, 1),
         (p.destino, p.monto, CASE p.tipo WHEN 'TERCERO' THEN 'RECEPCION' ELSE 'TRASPASO_ENTRADA' END, 2)
       ) AS x(cuenta, monto, tipo, lado)
       ORDER BY p.orden, x.lado`);

    // Antes del COMMIT, estadísticas con las filas de esta transacción: los constraint triggers
    // diferidos (D-14) se planean al confirmar, y con las de una tabla recién vaciada
    // (reltuples ≈ 0) el planificador recorre la tabla completa en cada una de sus ~180,000
    // comprobaciones (pasó de ~50 s a más de 20 minutos).
    await dueno.query('ANALYZE usuario, cuenta, beneficiario, transferencia, asiento');
    // Aquí corren los constraint triggers diferidos de suma cero de cada transferencia (D-14).
    await dueno.query('COMMIT');
  } catch (error) {
    await dueno.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
  // §3.7: estadísticas frescas para el EXPLAIN de §8.5.
  await dueno.query('ANALYZE');
  const { rows } = await dueno.query<{ id: string }>(
    "SELECT c.id FROM cuenta c JOIN usuario u ON u.id = c.usuario_id WHERE u.correo = $1 AND c.nombre = 'Principal'",
    [CORREO_CARGA],
  );
  const cuentaCalienteId = rows[0]?.id;
  if (cuentaCalienteId === undefined) throw new Error('No existe la cuenta caliente');
  return { cuentaCalienteId };
}
