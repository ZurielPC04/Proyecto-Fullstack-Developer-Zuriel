// Intento guardado (design.md §13.3 "Intento guardado", §6.2 "Reanudación en los clientes", D-17).
// Vive en `billetera.intento` de expo-secure-store; nunca en AsyncStorage (RNF-20, DD-42).
import type { SolicitudTransferencia } from '@billetera/shared';

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
