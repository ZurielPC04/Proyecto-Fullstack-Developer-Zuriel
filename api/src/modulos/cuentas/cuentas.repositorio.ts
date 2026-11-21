import type { EntityManager } from 'typeorm';

export interface CuentaPropia {
  id: string;
  nombre: 'Principal' | 'Ahorro';
  clabe: string;
  /** D-18: entero; el parser de int8 lanza si no es seguro (§2.3). */
  saldoCentavos: number;
}

interface FilaCuenta {
  id: string;
  nombre: 'Principal' | 'Ahorro';
  clabe: string;
  saldo_centavos: number;
}

const aCuentaPropia = (fila: FilaCuenta): CuentaPropia => ({
  id: fila.id,
  nombre: fila.nombre,
  clabe: fila.clabe,
  saldoCentavos: fila.saldo_centavos,
});

/**
 * R-2.1 y R-2.3: siempre filtra por el dueño, y `tipo = 'USUARIO'` deja fuera a Fondeo aunque
 * el filtro cambiara. Principal y después Ahorro (§4.2).
 */
export async function listarCuentasDeUsuario(
  tx: EntityManager,
  usuarioId: string,
): Promise<CuentaPropia[]> {
  const filas = (await tx.query(
    `SELECT id, nombre, clabe, saldo_centavos FROM cuenta
      WHERE usuario_id = $1 AND tipo = 'USUARIO'
      ORDER BY CASE nombre WHEN 'Principal' THEN 0 ELSE 1 END`,
    [usuarioId],
  )) as FilaCuenta[];
  return filas.map(aCuentaPropia);
}

/** R-2.4 y D-10: `undefined` si no existe o no es del usuario; el caso de uso no los distingue. */
export async function buscarCuentaDeUsuario(
  tx: EntityManager,
  usuarioId: string,
  cuentaId: string,
): Promise<CuentaPropia | undefined> {
  const filas = (await tx.query(
    `SELECT id, nombre, clabe, saldo_centavos FROM cuenta
      WHERE id = $1 AND usuario_id = $2 AND tipo = 'USUARIO'`,
    [cuentaId, usuarioId],
  )) as FilaCuenta[];
  const fila = filas[0];
  return fila ? aCuentaPropia(fila) : undefined;
}

export interface NuevaCuenta {
  usuarioId: string;
  nombre: 'Principal' | 'Ahorro';
  clabe: string;
}

/**
 * DD-19: `ON CONFLICT (clabe) DO NOTHING` para que una CLABE repetida no lance `23505`, que
 * abortaría la transacción del registro. Devuelve el id, o `undefined` si la CLABE ya existía.
 * Solo nombra las columnas que billetera_app puede insertar (§3.4); el saldo nace en 0.
 */
export async function insertarCuentaSiClabeLibre(
  tx: EntityManager,
  cuenta: NuevaCuenta,
): Promise<string | undefined> {
  const filas = (await tx.query(
    `INSERT INTO cuenta (usuario_id, tipo, nombre, clabe) VALUES ($1, 'USUARIO', $2, $3)
     ON CONFLICT (clabe) DO NOTHING RETURNING id`,
    [cuenta.usuarioId, cuenta.nombre, cuenta.clabe],
  )) as { id: string }[];
  return filas[0]?.id;
}
