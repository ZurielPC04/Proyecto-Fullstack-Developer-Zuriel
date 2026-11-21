import type { EntityManager } from 'typeorm';

// design.md §3.2 `sesion` y §5.3. Todo con SQL parametrizado; el instante `ahora` lo da el
// Reloj (§5.3), y las comparaciones y restas de tiempo se hacen en la base, nunca con Date.

/** Fila nueva y el `Max-Age` de su cookie: segundos enteros, hacia arriba, hasta `expira_en`. */
export interface SesionEmitida {
  expiraEn: string;
  maxAgeS: number;
}

export interface NuevaSesion {
  usuarioId: string;
  familiaId: string;
  refreshHash: string;
  ahora: string;
  /** Si falta, la familia nace: ahora + 7 días (D-05). Si viene, la hereda (DD-30). */
  expiraEn?: string;
}

export async function insertarSesion(tx: EntityManager, s: NuevaSesion): Promise<SesionEmitida> {
  const filas = (await tx.query(
    `INSERT INTO sesion (usuario_id, familia_id, refresh_hash, creado_en, expira_en)
     VALUES ($1, $2, $3, $4::timestamptz, coalesce($5::timestamptz, $4::timestamptz + interval '7 days'))
     RETURNING expira_en, ceil(extract(epoch FROM expira_en - creado_en))::int AS max_age`,
    [s.usuarioId, s.familiaId, s.refreshHash, s.ahora, s.expiraEn ?? null],
  )) as { expira_en: string; max_age: number }[];
  const fila = filas[0];
  if (!fila) throw new Error('El INSERT de la sesión no devolvió fila');
  return { expiraEn: fila.expira_en, maxAgeS: fila.max_age };
}

export interface SesionBloqueada {
  id: string;
  usuarioId: string;
  familiaId: string;
  expiraEn: string;
  usada: boolean;
  revocada: boolean;
}

/** §5.3 paso 1: `SELECT … FOR UPDATE` por el hash; solo filas de `sesion` (fuera de D-12). */
export async function bloquearSesionPorHash(
  tx: EntityManager,
  refreshHash: string,
): Promise<SesionBloqueada | undefined> {
  const filas = (await tx.query(
    `SELECT id, usuario_id, familia_id, expira_en,
            usada_en IS NOT NULL AS usada, revocada_en IS NOT NULL AS revocada
       FROM sesion WHERE refresh_hash = $1 FOR UPDATE`,
    [refreshHash],
  )) as {
    id: string;
    usuario_id: string;
    familia_id: string;
    expira_en: string;
    usada: boolean;
    revocada: boolean;
  }[];
  const f = filas[0];
  return f
    ? {
        id: f.id,
        usuarioId: f.usuario_id,
        familiaId: f.familia_id,
        expiraEn: f.expira_en,
        usada: f.usada,
        revocada: f.revocada,
      }
    : undefined;
}

/** `expira_en <= ahora`, comparado en la base con microsegundos. */
export async function estaVencida(
  tx: EntityManager,
  expiraEn: string,
  ahora: string,
): Promise<boolean> {
  const filas = (await tx.query('SELECT $1::timestamptz <= $2::timestamptz AS vencida', [
    expiraEn,
    ahora,
  ])) as { vencida: boolean }[];
  return filas[0]?.vencida ?? true;
}

export async function marcarUsada(tx: EntityManager, id: string, ahora: string): Promise<void> {
  await tx.query('UPDATE sesion SET usada_en = $2 WHERE id = $1', [id, ahora]);
}

/** Revoca las sesiones aún vivas de la familia y devuelve cuántas revocó. */
export async function revocarFamilia(
  tx: EntityManager,
  familiaId: string,
  ahora: string,
): Promise<number> {
  const filas = (await tx.query(
    `WITH revocadas AS (
       UPDATE sesion SET revocada_en = $2 WHERE familia_id = $1 AND revocada_en IS NULL RETURNING 1
     ) SELECT count(*)::int AS n FROM revocadas`,
    [familiaId, ahora],
  )) as { n: number }[];
  return filas[0]?.n ?? 0;
}
