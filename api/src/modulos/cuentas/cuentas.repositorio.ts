import type { EntityManager } from 'typeorm';

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
