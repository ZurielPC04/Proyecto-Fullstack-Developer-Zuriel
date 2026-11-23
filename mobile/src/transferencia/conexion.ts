// Aviso de "volvió la conexión" para el motor de reintentos (design.md §13.3, D-17).
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export type Conexion = {
  /** Llama a `alVolver` solo cuando la conexión pasa de caída a disponible. */
  suscribir(alVolver: () => void): () => void;
};

function conectado(estado: NetInfoState): boolean {
  return estado.isConnected === true && estado.isInternetReachable !== false;
}

/**
 * NetInfo avisa una vez al suscribirse con el estado actual: ese primer aviso solo fija el punto
 * de partida. Después, solo un cambio de desconectado a conectado dispara `alVolver`.
 */
export const conexionNetInfo: Conexion = {
  suscribir(alVolver) {
    let anterior: boolean | null = null;
    return NetInfo.addEventListener((estado) => {
      const ahora = conectado(estado);
      if (anterior === false && ahora) alVolver();
      anterior = ahora;
    });
  },
};
