import type { EntityManager } from 'typeorm';
import { Cuenta } from '../cuentas/cuenta.entidad.js';
import { Usuario } from '../identidad/usuario.entidad.js';

/** design.md §3.6: la única cuenta de sistema. */
export const FONDEO_ID = '00000000-0000-0000-0000-000000000001';

/** `usuario_id` de una cuenta; no cambia nunca (`cuenta_protegida`), así que se lee sin bloqueo. */
export async function duenoDeCuenta(tx: EntityManager, cuentaId: string): Promise<string | null> {
  const cuenta = await tx
    .getRepository(Cuenta)
    .createQueryBuilder('c')
    .select(['c.id', 'c.usuarioId'])
    .where('c.id = :cuentaId', { cuentaId })
    .getOne();
  if (!cuenta) throw new Error('La cuenta destino del fondeo no existe');
  return cuenta.usuarioId;
}

/** D-12, primer nivel: el usuario. */
export async function bloquearUsuario(tx: EntityManager, usuarioId: string): Promise<void> {
  await tx
    .getRepository(Usuario)
    .createQueryBuilder('u')
    .select('u.id')
    .where('u.id = :usuarioId', { usuarioId })
    .setLock('pessimistic_write')
    .getOne();
}

/** D-12, último nivel: las cuentas por `id` ascendente (§2.3). */
export async function bloquearCuentas(tx: EntityManager, ids: string[]): Promise<void> {
  await tx
    .getRepository(Cuenta)
    .createQueryBuilder('c')
    .select('c.id')
    .where('c.id IN (:...ids)', { ids })
    .orderBy('c.id', 'ASC')
    .setLock('pessimistic_write')
    .getMany();
}

export interface DatosFondeo {
  cuentaDestinoId: string;
  montoCentavos: number;
  concepto: string;
  /** Reloj.ahora(tx), leído después de los bloqueos (DD-36). */
  ahora: string;
}

/**
 * D-02 y DD-12: transferencia FONDEO aplicada, sin usuario, llave, hash ni referencia, y sus
 * dos asientos. El trigger `aplicar_asiento` mueve los saldos y la suma cero se verifica
 * al confirmar (D-14).
 */
export async function insertarFondeo(tx: EntityManager, datos: DatosFondeo): Promise<string> {
  const filas = (await tx.query(
    `INSERT INTO transferencia (tipo, cuenta_origen_id, cuenta_destino_id, monto_centavos, concepto,
                                estado, creado_en, aplicada_en)
     VALUES ('FONDEO', $1, $2, $3, $4, 'APLICADA', $5, $5) RETURNING id`,
    [FONDEO_ID, datos.cuentaDestinoId, datos.montoCentavos, datos.concepto, datos.ahora],
  )) as { id: string }[];
  const id = filas[0]?.id;
  if (id === undefined) throw new Error('El INSERT del fondeo no devolvió id');
  await tx.query(
    `INSERT INTO asiento (transferencia_id, cuenta_id, monto_centavos, tipo_movimiento, creado_en)
     VALUES ($1, $2, $3, 'FONDEO_SALIDA', $6), ($1, $4, $5, 'DEPOSITO', $6)`,
    [id, FONDEO_ID, -datos.montoCentavos, datos.cuentaDestinoId, datos.montoCentavos, datos.ahora],
  );
  return id;
}
