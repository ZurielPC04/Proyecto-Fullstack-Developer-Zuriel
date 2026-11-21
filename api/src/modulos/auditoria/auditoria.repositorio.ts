import type { EntityManager } from 'typeorm';

export interface FilaEvento {
  tipo: string;
  usuarioId: string | null;
  requestId: string | null;
  datos: Record<string, unknown>;
}

/**
 * §3.2 `evento_auditoria`. Sin RETURNING: billetera_app solo tiene INSERT sobre la tabla
 * (§3.4, RNF-11). `ocurrido_en` lo pone la base con clock_timestamp() (DD-15).
 */
export async function insertarEvento(tx: EntityManager, evento: FilaEvento): Promise<void> {
  await tx.query(
    'INSERT INTO evento_auditoria (tipo, usuario_id, request_id, datos) VALUES ($1, $2, $3, $4)',
    [evento.tipo, evento.usuarioId, evento.requestId, evento.datos],
  );
}
