import type { EntityManager } from 'typeorm';
import { contextoPeticion } from '../../plataforma/logging/contexto.js';
import { insertarEvento } from './auditoria.repositorio.js';

/** Catálogo de design.md §10.2 (DD-40); el CHECK de la migración 5 lo repite. */
export type TipoEvento =
  | 'usuario-registrado'
  | 'sesion-iniciada'
  | 'login-fallido'
  | 'sesion-cerrada'
  | 'refresh-reuse-detected'
  | 'beneficiario-creado'
  | 'fondeo-aplicado'
  | 'transferencia-pendiente'
  | 'transferencia-aplicada'
  | 'transferencia-rechazada'
  | 'codigo-incorrecto';

export interface Evento {
  tipo: TipoEvento;
  usuarioId: string | null;
  /** Ya enmascarados (§10.1); nunca secretos ni códigos. */
  datos: Record<string, unknown>;
}

/**
 * DD-40: se inserta con la transacción `tx` de la operación que audita; si falla, la
 * operación entera se revierte. El request ID sale del contexto de la petición (§10.1).
 */
export async function registrarEvento(tx: EntityManager, evento: Evento): Promise<void> {
  await insertarEvento(tx, {
    tipo: evento.tipo,
    usuarioId: evento.usuarioId,
    requestId: contextoPeticion.getStore()?.reqId ?? null,
    datos: evento.datos,
  });
}
