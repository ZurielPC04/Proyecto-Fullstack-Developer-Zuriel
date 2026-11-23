// Motor de la transferencia móvil (design.md §13.3 "Motor de reintentos", §6.2, §12.7, D-17,
// DD-45). Store externo como la sesión: las pantallas lo leen con `useSyncExternalStore`.
import type { Comprobante, PendienteConfirmacion, SolicitudTransferencia } from '@billetera/shared';
import { mensajeDeProblema } from '@billetera/shared';
import type { Cliente } from '../api/cliente';
import { type Almacen, LLAVE_INTENTO } from '../auth/almacen';
import type { Sesion } from '../auth/sesion';
import type { Conexion } from './conexion';
import type { Intento } from './intento';

/** D-17: esperas antes de cada reintento. El primer envío sale de inmediato. */
export const ESPERAS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

export type EstadoMotor =
  | { tipo: 'inactivo' }
  | { tipo: 'verificando' }
  | { tipo: 'desconocido' }
  | { tipo: 'comprobante'; comprobante: Comprobante }
  | { tipo: 'rechazo'; mensaje: string }
  | {
      tipo: 'codigo';
      transferenciaId: string;
      montoCentavos: number;
      codigoExpiraEn: string;
      codigoSimulado?: string;
    };

type Peticion = {
  metodo: 'get' | 'post';
  ruta: Parameters<Cliente['cruda']>[1];
  path?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
};

/** Cómo terminó una serie de reintentos. */
type FinSerie =
  { tipo: 'respuesta'; respuesta: Response } | { tipo: 'sin-sesion' } | { tipo: 'agotado' };

export type DependenciasMotor = {
  cliente: Cliente;
  sesion: Sesion;
  almacen: Almacen;
  conexion: Conexion;
  /** R-4.27: `Crypto.randomUUID()` de expo-crypto. */
  generarLlave: () => string;
};

export type Motor = ReturnType<typeof crearMotor>;

const INACTIVO: EstadoMotor = { tipo: 'inactivo' };

async function tipoDeProblema(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { type?: unknown };
    return typeof cuerpo.type === 'string' ? cuerpo.type : 'internal-error';
  } catch {
    return 'internal-error';
  }
}

export function crearMotor({
  cliente,
  sesion,
  almacen,
  conexion,
  generarLlave,
}: DependenciasMotor) {
  let estado: EstadoMotor = INACTIVO;
  let intento: Intento | null = null;
  /** Lo que "Verificar de nuevo" repite: la misma petición, con la misma llave (R-4.30). */
  let repetir: (() => Promise<void>) | null = null;
  const suscriptores = new Set<() => void>();

  function fijar(nuevo: EstadoMotor): void {
    estado = nuevo;
    for (const avisar of suscriptores) avisar();
  }

  async function guardar(nuevo: Intento): Promise<void> {
    await almacen.setItemAsync(LLAVE_INTENTO, JSON.stringify(nuevo));
    intento = nuevo;
  }

  async function borrar(): Promise<void> {
    intento = null;
    repetir = null;
    await almacen.deleteItemAsync(LLAVE_INTENTO);
  }

  /** Espera `ms`, o menos si NetInfo avisa que volvió la conexión (D-17). */
  function esperar(ms: number): Promise<void> {
    return new Promise((resolver) => {
      let quitar: (() => void) | null = null;
      let terminado = false;
      const fin = () => {
        if (terminado) return;
        terminado = true;
        clearTimeout(temporizador);
        quitar?.();
        resolver();
      };
      const temporizador = setTimeout(fin, ms);
      quitar = conexion.suscribir(fin);
      if (terminado) quitar();
    });
  }

  /**
   * §13.3: un turno es un envío. La red, el timeout de 15 s y cualquier `5xx` consumen el turno
   * y esperan 1, 2, 4, 8 y 16 s. Un `401` espera la promesa única de refresh y repite sin
   * consumir turno, una sola vez por turno (R-4.29); si el refresh no deja sesión, la serie
   * termina sin tocar el intento.
   */
  async function serie(peticion: Peticion): Promise<FinSerie> {
    for (let turno = 0; ; turno++) {
      let refrescado = false;
      for (;;) {
        let respuesta: Response | null = null;
        let accessUsado: string | null = null;
        try {
          ({ respuesta, accessUsado } = await cliente.cruda(peticion.metodo, peticion.ruta, {
            path: peticion.path,
            body: peticion.body,
            headers: peticion.headers,
          }));
        } catch {
          // Red o timeout: el resultado es incierto y se reintenta con la misma llave.
        }
        if (respuesta?.status === 401 && !refrescado) {
          refrescado = true;
          let hayAccess: boolean | null = null;
          try {
            hayAccess = await sesion.refrescar(accessUsado);
          } catch {
            // El refresh no respondió: cuenta como fallo del turno.
          }
          if (hayAccess === true) continue;
          if (hayAccess === false) return { tipo: 'sin-sesion' };
        } else if (respuesta !== null && respuesta.status < 500 && respuesta.status !== 401) {
          return { tipo: 'respuesta', respuesta };
        }
        break;
      }
      const espera = ESPERAS_MS[turno];
      if (espera === undefined) return { tipo: 'agotado' };
      await esperar(espera);
    }
  }

  /** Corre una petición del intento y la repite con "Verificar de nuevo" si se agota. */
  async function correr(accion: () => Promise<void>): Promise<void> {
    repetir = accion;
    fijar({ tipo: 'verificando' });
    try {
      await accion();
    } catch {
      // Una respuesta ilegible tampoco cierra el intento: el estado sigue siendo incierto.
      fijar({ tipo: 'desconocido' });
    }
  }

  /** Resultado común: agotado, sin sesión o un rechazo definitivo (§13.3). */
  async function terminarSinExito(fin: FinSerie): Promise<boolean> {
    if (fin.tipo === 'agotado') {
      fijar({ tipo: 'desconocido' });
      return true;
    }
    if (fin.tipo === 'sin-sesion') {
      // DD-45: se conserva el intento; la raíz muestra el login y al volver se reanuda.
      intento = null;
      repetir = null;
      fijar(INACTIVO);
      return true;
    }
    return false;
  }

  /** R-4.12 y §13.3: `422` u otro `4xx` es definitivo: borra el intento y muestra el motivo. */
  async function rechazar(respuesta: Response): Promise<void> {
    const mensaje = mensajeDeProblema(await tipoDeProblema(respuesta));
    await borrar();
    fijar({ tipo: 'rechazo', mensaje });
  }

  async function crear(): Promise<void> {
    const actual = intento;
    if (actual === null) return;
    const fin = await serie({
      metodo: 'post',
      ruta: '/transferencias',
      body: actual.cuerpo,
      headers: { 'Idempotency-Key': actual.llave },
    });
    if (await terminarSinExito(fin)) return;
    if (fin.tipo !== 'respuesta') return;
    const { respuesta } = fin;
    if (respuesta.status === 201) {
      const comprobante = (await respuesta.json()) as Comprobante;
      await borrar();
      fijar({ tipo: 'comprobante', comprobante });
      return;
    }
    if (respuesta.status === 202) {
      const pendiente = (await respuesta.json()) as PendienteConfirmacion;
      await mostrarCaptura(actual, pendiente);
      return;
    }
    await rechazar(respuesta);
  }

  /** §6.2: la fase `confirmacion` se guarda antes de mostrar la captura del código. */
  async function mostrarCaptura(actual: Intento, pendiente: PendienteConfirmacion): Promise<void> {
    const codigoSimulado =
      pendiente.codigoSimulado ??
      (actual.fase === 'confirmacion' ? actual.codigoSimulado : undefined);
    await guardar({
      usuarioId: actual.usuarioId,
      llave: actual.llave,
      cuerpo: actual.cuerpo,
      fase: 'confirmacion',
      transferenciaId: pendiente.transferenciaId,
      codigoExpiraEn: pendiente.codigoExpiraEn,
      ...(codigoSimulado === undefined ? {} : { codigoSimulado }),
    });
    repetir = null;
    fijar({
      tipo: 'codigo',
      transferenciaId: pendiente.transferenciaId,
      montoCentavos: pendiente.montoCentavos,
      codigoExpiraEn: pendiente.codigoExpiraEn,
      ...(codigoSimulado === undefined ? {} : { codigoSimulado }),
    });
  }

  return {
    obtenerEstado(): EstadoMotor {
      return estado;
    },

    suscribir(avisar: () => void): () => void {
      suscriptores.add(avisar);
      return () => {
        suscriptores.delete(avisar);
      };
    },

    /**
     * R-4.27: congela el cuerpo, genera la llave y guarda el intento **antes** del primer envío,
     * para que la llave sobreviva si la app muere con la petición en vuelo (§12.7). Si no se
     * puede guardar, lanza y no envía nada.
     */
    async iniciar(cuerpo: SolicitudTransferencia): Promise<void> {
      if (estado.tipo !== 'inactivo') throw new Error('Hay un intento sin resolver (R-4.30)');
      const usuarioId = sesion.usuarioActual();
      if (usuarioId === null) throw new Error('No se sabe de quién es el intento (R-1.12)');
      await guardar({ usuarioId, llave: generarLlave(), cuerpo, fase: 'creacion' });
      void correr(crear);
    },

    /** R-4.30: "Verificar de nuevo" reinicia la serie con la misma llave. */
    verificarDeNuevo(): void {
      if (estado.tipo !== 'desconocido' || repetir === null) return;
      void correr(repetir);
    },

    /** Después del comprobante o del rechazo, vuelve al saldo. El intento ya se borró. */
    cerrar(): void {
      if (estado.tipo !== 'comprobante' && estado.tipo !== 'rechazo') return;
      fijar(INACTIVO);
    },
  };
}
