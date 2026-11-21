import type { EntityManager } from 'typeorm';

/**
 * §3.2 `usuario`. Un correo repetido lanza `23505` en `uq_usuario_correo`, que el manejador
 * traduce a `409` (§7.3): no hay SELECT previo, porque tendría una carrera con el INSERT.
 */
export async function insertarUsuario(
  tx: EntityManager,
  correo: string,
  hashContrasena: string,
): Promise<string> {
  const filas = (await tx.query(
    'INSERT INTO usuario (correo, hash_contrasena) VALUES ($1, $2) RETURNING id',
    [correo, hashContrasena],
  )) as { id: string }[];
  const id = filas[0]?.id;
  if (id === undefined) throw new Error('El INSERT del usuario no devolvió id');
  return id;
}
