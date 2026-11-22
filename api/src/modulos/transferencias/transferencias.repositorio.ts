import type { EntityManager } from 'typeorm';
import { Cuenta } from '../cuentas/cuenta.entidad.js';
import { Usuario } from '../identidad/usuario.entidad.js';
import type { MotivoRechazo, TipoTransferencia } from './transferencias.dominio.js';
import type { FilaTransferencia } from './transferencias.respuesta.js';

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

/**
 * D-12, último nivel: las cuentas por `id` ascendente (§2.3). Devuelve el saldo de cada una,
 * leído ya con el bloqueo: nada lo cambia hasta el COMMIT (§6.1).
 */
export async function bloquearCuentas(
  tx: EntityManager,
  ids: string[],
): Promise<Map<string, number>> {
  const cuentas = await tx
    .getRepository(Cuenta)
    .createQueryBuilder('c')
    .select(['c.id', 'c.saldoCentavos'])
    .where('c.id IN (:...ids)', { ids })
    .orderBy('c.id', 'ASC')
    .setLock('pessimistic_write')
    .getMany();
  return new Map(cuentas.map((c) => [c.id, c.saldoCentavos]));
}

/** Cuenta propia de usuario (nunca Fondeo, R-4.7); `undefined` si no existe o es ajena (R-4.6). */
export async function cuentaPropia(
  tx: EntityManager,
  usuarioId: string,
  cuentaId: string,
): Promise<{ id: string } | undefined> {
  const filas = (await tx.query(
    "SELECT id FROM cuenta WHERE id = $1 AND usuario_id = $2 AND tipo = 'USUARIO'",
    [cuentaId, usuarioId],
  )) as { id: string }[];
  return filas[0];
}

/** Beneficiario del usuario con la cuenta a la que apunta y su dueño real (D-04). */
export async function beneficiarioPropio(
  tx: EntityManager,
  usuarioId: string,
  beneficiarioId: string,
): Promise<{ cuentaId: string; duenoId: string } | undefined> {
  const filas = (await tx.query(
    `SELECT b.cuenta_id, c.usuario_id FROM beneficiario b JOIN cuenta c ON c.id = b.cuenta_id
      WHERE b.id = $1 AND b.usuario_id = $2`,
    [beneficiarioId, usuarioId],
  )) as { cuenta_id: string; usuario_id: string }[];
  const fila = filas[0];
  return fila ? { cuentaId: fila.cuenta_id, duenoId: fila.usuario_id } : undefined;
}

export interface NuevaTransferencia {
  usuarioId: string;
  tipo: TipoTransferencia;
  cuentaOrigenId: string;
  cuentaDestinoId: string;
  beneficiarioId: string | null;
  montoCentavos: number;
  concepto: string;
  referencia: string;
  estado: 'APLICADA' | 'RECHAZADA' | 'PENDIENTE_CONFIRMACION';
  motivoRechazo: MotivoRechazo | null;
  llave: string;
  hash: string;
  /** Reloj.ahora(tx), leído después de bloquear las cuentas (DD-36). */
  ahora: string;
}

/**
 * §3.2 `transferencia`. Con `APLICADA`, `aplicada_en = ahora`. El `UNIQUE (usuario_id,
 * llave_idempotencia)` lanza `23505` en `uq_transferencia_usuario_llave` (§6.2).
 */
export async function insertarTransferencia(
  tx: EntityManager,
  t: NuevaTransferencia,
): Promise<string> {
  const filas = (await tx.query(
    `INSERT INTO transferencia (usuario_id, tipo, cuenta_origen_id, cuenta_destino_id, beneficiario_id,
                                monto_centavos, concepto, referencia, estado, motivo_rechazo,
                                llave_idempotencia, hash_peticion, creado_en, aplicada_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             CASE WHEN $9 = 'APLICADA' THEN $13::timestamptz END)
     RETURNING id`,
    [
      t.usuarioId,
      t.tipo,
      t.cuentaOrigenId,
      t.cuentaDestinoId,
      t.beneficiarioId,
      t.montoCentavos,
      t.concepto,
      t.referencia,
      t.estado,
      t.motivoRechazo,
      t.llave,
      t.hash,
      t.ahora,
    ],
  )) as { id: string }[];
  const id = filas[0]?.id;
  if (id === undefined) throw new Error('El INSERT de la transferencia no devolvió id');
  return id;
}

/**
 * D-01 y DD-17: los dos asientos de una transferencia aplicada, con `creado_en = aplicada_en`.
 * El trigger mueve los saldos de las cuentas ya bloqueadas.
 */
export async function insertarAsientos(
  tx: EntityManager,
  a: {
    transferenciaId: string;
    tipo: TipoTransferencia;
    cuentaOrigenId: string;
    cuentaDestinoId: string;
    montoCentavos: number;
    ahora: string;
  },
): Promise<void> {
  const [salida, entrada] =
    a.tipo === 'TERCERO' ? ['ENVIO', 'RECEPCION'] : ['TRASPASO_SALIDA', 'TRASPASO_ENTRADA'];
  await tx.query(
    `INSERT INTO asiento (transferencia_id, cuenta_id, monto_centavos, tipo_movimiento, creado_en)
     VALUES ($1, $2, $3, $4, $8), ($1, $5, $6, $7, $8)`,
    [
      a.transferenciaId,
      a.cuentaOrigenId,
      -a.montoCentavos,
      salida,
      a.cuentaDestinoId,
      a.montoCentavos,
      entrada,
      a.ahora,
    ],
  );
}

interface FilaLeida {
  id: string;
  estado: FilaTransferencia['estado'];
  tipo: TipoTransferencia;
  monto_centavos: number;
  concepto: string;
  referencia: string;
  cuenta_origen_id: string;
  origen_nombre: string;
  origen_clabe: string;
  destino_etiqueta: string;
  destino_nombre: string;
  destino_clabe: string;
  creado_en: string;
  aplicada_en: string | null;
  motivo_rechazo: MotivoRechazo | null;
  codigo_expira_en: string | null;
  codigo_intentos: number | null;
  hash_peticion: string;
}

/**
 * Transferencia del usuario con los datos de su comprobante (§6.6): alias y nombre del
 * beneficiario si lo hubo, o el nombre de la cuenta propia. Datos inmutables (DD-18), así que
 * la reconstrucción da siempre lo mismo (§6.2). `porLlave` la busca por la llave.
 */
async function leer(
  tx: EntityManager,
  condicion: string,
  parametros: unknown[],
  bloquear: boolean,
): Promise<(FilaTransferencia & { hash: string }) | undefined> {
  const filas = (await tx.query(
    `SELECT t.id, t.estado, t.tipo, t.monto_centavos, t.concepto, t.referencia, t.cuenta_origen_id,
            co.nombre AS origen_nombre, co.clabe AS origen_clabe,
            coalesce(b.alias, cd.nombre) AS destino_etiqueta,
            coalesce(b.nombre, cd.nombre) AS destino_nombre, cd.clabe AS destino_clabe,
            t.creado_en, t.aplicada_en, t.motivo_rechazo, t.hash_peticion,
            k.expira_en AS codigo_expira_en, k.intentos AS codigo_intentos
       FROM transferencia t
       JOIN cuenta co ON co.id = t.cuenta_origen_id
       JOIN cuenta cd ON cd.id = t.cuenta_destino_id
       LEFT JOIN beneficiario b ON b.id = t.beneficiario_id
       LEFT JOIN codigo_confirmacion k ON k.transferencia_id = t.id
      WHERE ${condicion} AND t.tipo <> 'FONDEO'
      ${bloquear ? 'FOR UPDATE OF t' : ''}`,
    parametros,
  )) as FilaLeida[];
  const f = filas[0];
  if (!f) return undefined;
  return {
    id: f.id,
    estado: f.estado,
    tipo: f.tipo,
    montoCentavos: f.monto_centavos,
    concepto: f.concepto,
    referencia: f.referencia,
    origen: { cuentaId: f.cuenta_origen_id, nombre: f.origen_nombre, clabe: f.origen_clabe },
    destino: { etiqueta: f.destino_etiqueta, nombre: f.destino_nombre, clabe: f.destino_clabe },
    creadoEn: f.creado_en,
    aplicadaEn: f.aplicada_en,
    motivoRechazo: f.motivo_rechazo,
    codigo:
      f.codigo_expira_en === null
        ? null
        : { expiraEn: f.codigo_expira_en, intentos: f.codigo_intentos ?? 0 },
    hash: f.hash_peticion,
  };
}

/** R-4.10 y D-10: `undefined` si no existe o es ajena. */
export function leerTransferencia(
  tx: EntityManager,
  usuarioId: string,
  transferenciaId: string,
  { bloquear = false } = {},
) {
  return leer(tx, 't.id = $1 AND t.usuario_id = $2', [transferenciaId, usuarioId], bloquear);
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
