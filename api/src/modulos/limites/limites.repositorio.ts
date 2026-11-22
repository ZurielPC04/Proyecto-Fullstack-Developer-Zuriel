import { ZONA_HORARIA } from '@billetera/shared';
import type { EntityManager } from 'typeorm';

/**
 * design.md §6.4: envíos a tercero aplicados del usuario en el día local de `ahora`, la ventana
 * `[00:00, 24:00)` en America/Mexico_City. Sirve a crear, confirmar y `GET /limites`. El rango
 * sobre `aplicada_en` usa el índice parcial `WHERE estado = 'APLICADA' AND tipo = 'TERCERO'`.
 * Sumar `1 day` a la hora local antes de volver a UTC da la medianoche correcta (D-15, R-6.5).
 */
export async function consumidoDelDia(
  tx: EntityManager,
  usuarioId: string,
  ahora: string,
): Promise<number> {
  const filas = (await tx.query(
    `SELECT coalesce(sum(monto_centavos), 0)::bigint AS consumido
       FROM transferencia
      WHERE usuario_id = $1
        AND estado = 'APLICADA' AND tipo = 'TERCERO'
        AND aplicada_en >=  date_trunc('day', $2::timestamptz AT TIME ZONE $3) AT TIME ZONE $3
        AND aplicada_en <  (date_trunc('day', $2::timestamptz AT TIME ZONE $3) + interval '1 day')
                             AT TIME ZONE $3`,
    [usuarioId, ahora, ZONA_HORARIA],
  )) as { consumido: number }[];
  return filas[0]?.consumido ?? 0;
}

/** El día local de `ahora` (`AAAA-MM-DD`) y el inicio del siguiente, como timestamptz (§6.4). */
export async function ventanaDelDia(
  tx: EntityManager,
  ahora: string,
): Promise<{ dia: string; reiniciaEn: string }> {
  const filas = (await tx.query(
    `SELECT to_char(date_trunc('day', $1::timestamptz AT TIME ZONE $2), 'YYYY-MM-DD') AS dia,
            (date_trunc('day', $1::timestamptz AT TIME ZONE $2) + interval '1 day')
              AT TIME ZONE $2 AS reinicia_en`,
    [ahora, ZONA_HORARIA],
  )) as { dia: string; reinicia_en: string }[];
  const fila = filas[0];
  if (!fila) throw new Error('La ventana del día no devolvió filas');
  return { dia: fila.dia, reiniciaEn: fila.reinicia_en };
}
