import { createHash } from 'node:crypto';
import { instanteIso } from '@billetera/shared';
import { z } from 'zod';

/** R-5.6: los cinco tipos de usuario; `FONDEO_SALIDA` vive en Fondeo y nunca se consulta. */
export type TipoMovimiento =
  'DEPOSITO' | 'ENVIO' | 'RECEPCION' | 'TRASPASO_SALIDA' | 'TRASPASO_ENTRADA';

/** Una fila de la consulta de §8.1, tal como la entrega pg (timestamptz como texto, DD-07). */
export interface FilaMovimiento {
  /** `bigint`: el parser de int8 lo entrega como entero seguro (§2.3). */
  id: number;
  tipo_movimiento: TipoMovimiento;
  monto_centavos: number;
  creado_en: string;
  transferencia_id: string;
  concepto: string;
  referencia: string | null;
  beneficiario_alias: string | null;
  contraparte_nombre: string;
  contraparte_clabe: string;
}

/** Esquema `Movimiento` de openapi.yaml. */
export interface Movimiento {
  id: string;
  transferenciaId: string;
  tipo: TipoMovimiento;
  montoCentavos: number;
  fecha: string;
  concepto: string;
  referencia: string | null;
  contraparte: { etiqueta: string; clabeTerminacion: string | null };
}

const terminacion = (clabe: string) => clabe.slice(-4);

/**
 * §8.1, tabla de la contraparte (DD-37): nunca el nombre del titular ni el alias que le puso
 * otro usuario. Una recepción no dice quién envía.
 */
export function contraparte(fila: FilaMovimiento): Movimiento['contraparte'] {
  switch (fila.tipo_movimiento) {
    case 'DEPOSITO':
      return { etiqueta: 'Depósito', clabeTerminacion: null };
    case 'ENVIO':
      if (fila.beneficiario_alias === null) {
        // §6.1: todo TERCERO sale de un beneficiario; sin él, la fila viola el modelo.
        throw new Error(`El envío ${fila.id} no tiene beneficiario`);
      }
      return {
        etiqueta: fila.beneficiario_alias,
        clabeTerminacion: terminacion(fila.contraparte_clabe),
      };
    case 'RECEPCION':
      return {
        etiqueta: 'Transferencia recibida',
        clabeTerminacion: terminacion(fila.contraparte_clabe),
      };
    case 'TRASPASO_SALIDA':
    case 'TRASPASO_ENTRADA':
      return {
        etiqueta: fila.contraparte_nombre,
        clabeTerminacion: terminacion(fila.contraparte_clabe),
      };
  }
}

/** R-5.1: la fila en la forma del contrato, con la fecha en ISO de 6 decimales (DD-22). */
export function aMovimiento(fila: FilaMovimiento): Movimiento {
  return {
    id: String(fila.id),
    transferenciaId: fila.transferencia_id,
    tipo: fila.tipo_movimiento,
    montoCentavos: fila.monto_centavos,
    fecha: instanteIso(fila.creado_en),
    concepto: fila.concepto,
    referencia: fila.referencia,
    contraparte: contraparte(fila),
  };
}

export interface FiltrosHistorial {
  cuentaId: string;
  tipo?: TipoMovimiento | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
}

/**
 * §8.3: primeros 16 hex de SHA-256 de los filtros, con la cuenta. `limite` no entra: el
 * tamaño de página puede cambiar a mitad del recorrido.
 */
export function filtrosHash(f: FiltrosHistorial): string {
  const datos = JSON.stringify([
    'v1',
    f.cuentaId,
    f.tipo ?? null,
    f.desde ?? null,
    f.hasta ?? null,
  ]);
  return createHash('sha256').update(datos).digest('hex').slice(0, 16);
}

export interface PosicionCursor {
  /** Texto de timestamptz de pg con microsegundos; nunca pasa por Date (D-11). */
  creadoEn: string;
  id: string;
}

/** §8.3: `c` con la forma del texto de timestamptz en UTC que entrega pg (DD-07). */
const esquemaCursor = z
  .object({
    v: z.literal(1),
    c: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?\+00$/),
    i: z.string().regex(/^[1-9][0-9]{0,18}$/),
    f: z.string().regex(/^[0-9a-f]{16}$/),
  })
  .strict();

/** §8.3: base64url del JSON `{ v, c, i, f }`. */
export function codificarCursor(posicion: PosicionCursor, hash: string): string {
  const json = JSON.stringify({ v: 1, c: posicion.creadoEn, i: posicion.id, f: hash });
  return Buffer.from(json, 'utf8').toString('base64url');
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * §8.3, decodificación estricta: base64url, JSON, esquema y `f` igual al hash de la petición.
 * `undefined` ante cualquier fallo (→ `400 invalid-cursor`, R-5.7).
 */
export function decodificarCursor(cursor: string, hash: string): PosicionCursor | undefined {
  if (!BASE64URL.test(cursor)) return undefined;
  let datos: unknown;
  try {
    datos = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  const resultado = esquemaCursor.safeParse(datos);
  if (!resultado.success || resultado.data.f !== hash) return undefined;
  return { creadoEn: resultado.data.c, id: resultado.data.i };
}
