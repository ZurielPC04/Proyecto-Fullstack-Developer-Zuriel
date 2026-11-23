// Intento guardado (design.md §13.3 "Intento guardado", §6.2 "Reanudación en los clientes", D-17).
// Vive en `billetera.intento` de expo-secure-store; nunca en AsyncStorage (RNF-20, DD-42).
import { esquemaTransferencia, type SolicitudTransferencia } from '@billetera/shared';

type Base = {
  /** R-1.12: el `sub` del access con el que se creó; el intento es solo de ese usuario. */
  usuarioId: string;
  /** R-4.27: `Crypto.randomUUID()`, una sola por intento. */
  llave: string;
  /** R-4.27: los datos congelados al confirmar. */
  cuerpo: SolicitudTransferencia;
};

export type IntentoCreacion = Base & { fase: 'creacion' };

export type IntentoConfirmacion = Base & {
  fase: 'confirmacion';
  transferenciaId: string;
  codigoExpiraEn: string;
  /** DD-25: solo si vino en la primera respuesta `202`. */
  codigoSimulado?: string;
  /** §6.2: el código capturado, solo mientras la confirmación está en vuelo. */
  codigo?: string;
};

export type Intento = IntentoCreacion | IntentoConfirmacion;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor !== '';
}

function opcional(valor: unknown): valor is string | undefined {
  return valor === undefined || texto(valor);
}

/**
 * El intento guardado, solo si es legible y pertenece a `usuarioId` (R-4.31). Un intento de otro
 * usuario, sin `usuarioId`, con un usuario actual desconocido o dañado devuelve null: el motor lo
 * borra sin enviarlo ni mostrarlo (design.md §13.3, H1).
 */
export function interpretarIntento(crudo: string, usuarioId: string | null): Intento | null {
  let datos: Record<string, unknown>;
  try {
    const valor: unknown = JSON.parse(crudo);
    if (valor === null || typeof valor !== 'object') return null;
    datos = valor as Record<string, unknown>;
  } catch {
    return null;
  }
  if (usuarioId === null || datos.usuarioId !== usuarioId) return null;
  if (!texto(datos.llave) || !UUID.test(datos.llave)) return null;
  const cuerpo = esquemaTransferencia.safeParse(datos.cuerpo);
  if (!cuerpo.success) return null;
  const base = { usuarioId, llave: datos.llave, cuerpo: cuerpo.data };

  if (datos.fase === 'creacion') return { ...base, fase: 'creacion' };
  if (datos.fase !== 'confirmacion') return null;
  const { transferenciaId, codigoExpiraEn, codigoSimulado, codigo } = datos;
  if (!texto(transferenciaId) || !UUID.test(transferenciaId) || !texto(codigoExpiraEn)) return null;
  if (!opcional(codigoSimulado) || !opcional(codigo)) return null;
  return {
    ...base,
    fase: 'confirmacion',
    transferenciaId,
    codigoExpiraEn,
    ...(codigoSimulado === undefined ? {} : { codigoSimulado }),
    ...(codigo === undefined ? {} : { codigo }),
  };
}
