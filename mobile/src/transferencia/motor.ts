// Motor de la transferencia móvil (design.md §13.3 "Motor de reintentos", §6.2, §12.7, D-17,
// DD-32, DD-45). Store externo como la sesión: las pantallas lo leen con `useSyncExternalStore`.
import type {
  Comprobante,
  MotivoRechazo,
  PendienteConfirmacion,
  SolicitudTransferencia,
  Transferencia,
} from '@billetera/shared';
import { mensajeDeProblema } from '@billetera/shared';
import type { Cliente } from '../api/cliente';
import { type Almacen, LLAVE_INTENTO } from '../auth/almacen';
import type { Sesion } from '../auth/sesion';
import type { Conexion } from './conexion';
import { type Intento, type IntentoConfirmacion, interpretarIntento } from './intento';

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
      /** DD-25: del primer `202` o del intento guardado. */
      codigoSimulado?: string;
      /** El motivo del último `422 codigo-incorrecto`, con los intentos restantes. */
      error?: string;
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
  | { tipo: 'respuesta'; respuesta: Response; primerEnvio: boolean }
  | { tipo: 'sin-sesion' }
  | { tipo: 'agotado' };

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

type ProblemaLeido = { type: string; intentosRestantes?: number };

async function leerProblema(respuesta: Response): Promise<ProblemaLeido> {
  try {
    const cuerpo = (await respuesta.json()) as { type?: unknown; intentosRestantes?: unknown };
    return {
      type: typeof cuerpo.type === 'string' ? cuerpo.type : 'internal-error',
      ...(typeof cuerpo.intentosRestantes === 'number'
        ? { intentosRestantes: cuerpo.intentosRestantes }
        : {}),
    };
  } catch {
    return { type: 'internal-error' };
  }
}

/** El `type` del problem de cada motivo es el motivo en kebab-case (design.md §7.2). */
function mensajeDeMotivo(motivo: MotivoRechazo | null): string {
  return mensajeDeProblema(
    motivo === null ? 'internal-error' : motivo.toLowerCase().replaceAll('_', '-'),
  );
}

/** DD-33: el mensaje del código incorrecto con los intentos que quedan. */
function mensajeCodigoIncorrecto(restantes: number | undefined): string {
  const base = mensajeDeProblema('codigo-incorrecto');
  if (restantes === undefined) return base;
  return `${base} Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.`;
}

/** §6.2: el comprobante de una transferencia aplicada, armado con la respuesta del `GET`. */
export function comprobanteDeTransferencia(t: Transferencia): Comprobante {
  return {
    transferenciaId: t.id,
    estado: 'APLICADA',
    tipo: t.tipo,
    montoCentavos: t.montoCentavos,
    concepto: t.concepto,
    referencia: t.referencia,
    origen: t.origen,
    destino: t.destino,
    creadaEn: t.creadaEn,
    aplicadaEn: t.aplicadaEn ?? t.creadaEn,
  };
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
  /**
   * DD-32: solo la respuesta al primer envío de un intento recién creado puede llevar directo a
   * la captura del código. Cualquier otro `202` (reintento o reanudación) se contrasta con el GET.
   */
  let primerEnvio = false;
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
        const fuePrimero = primerEnvio;
        primerEnvio = false;
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
          return { tipo: 'respuesta', respuesta, primerEnvio: fuePrimero };
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

  /** Resultado común: agotado o sin sesión (§13.3). */
  function terminarSinExito(fin: FinSerie): fin is Exclude<FinSerie, { tipo: 'respuesta' }> {
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
  async function rechazar(problema: ProblemaLeido): Promise<void> {
    await borrar();
    fijar({ tipo: 'rechazo', mensaje: mensajeDeProblema(problema.type) });
  }

  async function aplicada(comprobante: Comprobante): Promise<void> {
    await borrar();
    fijar({ tipo: 'comprobante', comprobante });
  }

  /** `POST /transferencias` con la llave del intento (R-4.28, D-03). Nunca en fase `confirmacion`. */
  async function crear(): Promise<void> {
    const actual = intento;
    if (actual === null || actual.fase !== 'creacion') return;
    const fin = await serie({
      metodo: 'post',
      ruta: '/transferencias',
      body: actual.cuerpo,
      headers: { 'Idempotency-Key': actual.llave },
    });
    if (terminarSinExito(fin)) return;
    const { respuesta } = fin;
    if (respuesta.status === 201) {
      await aplicada((await respuesta.json()) as Comprobante);
      return;
    }
    if (respuesta.status === 202) {
      const pendiente = (await respuesta.json()) as PendienteConfirmacion;
      // §6.2: con cualquier `202` el intento pasa a `confirmacion` antes de mostrar nada.
      const confirmacion = await pasarAConfirmacion(actual, pendiente);
      if (fin.primerEnvio) {
        mostrarCaptura(confirmacion);
        return;
      }
      // DD-32: un `202` de reintento no lleva directo a la captura; primero el estado real.
      await verificarEstado();
      return;
    }
    await rechazar(await leerProblema(respuesta));
  }

  /** §6.2: la fase `confirmacion` se guarda antes de mostrar la captura del código. */
  async function pasarAConfirmacion(
    actual: Intento,
    pendiente: Pick<PendienteConfirmacion, 'transferenciaId' | 'codigoExpiraEn' | 'codigoSimulado'>,
  ): Promise<IntentoConfirmacion> {
    // DD-25: la repetición no trae `codigoSimulado`; se conserva el que se guardó.
    const codigoSimulado =
      pendiente.codigoSimulado ??
      (actual.fase === 'confirmacion' ? actual.codigoSimulado : undefined);
    const confirmacion: IntentoConfirmacion = {
      usuarioId: actual.usuarioId,
      llave: actual.llave,
      cuerpo: actual.cuerpo,
      fase: 'confirmacion',
      transferenciaId: pendiente.transferenciaId,
      codigoExpiraEn: pendiente.codigoExpiraEn,
      ...(codigoSimulado === undefined ? {} : { codigoSimulado }),
    };
    await guardar(confirmacion);
    return confirmacion;
  }

  function mostrarCaptura(confirmacion: IntentoConfirmacion, error?: string): void {
    repetir = null;
    fijar({
      tipo: 'codigo',
      transferenciaId: confirmacion.transferenciaId,
      montoCentavos: confirmacion.cuerpo.montoCentavos,
      codigoExpiraEn: confirmacion.codigoExpiraEn,
      ...(confirmacion.codigoSimulado === undefined
        ? {}
        : { codigoSimulado: confirmacion.codigoSimulado }),
      ...(error === undefined ? {} : { error }),
    });
  }

  /**
   * DD-32: `GET /transferencias/{id}`, que además aplica la expiración perezosa (R-6.12), y
   * muestra el estado real: comprobante, rechazo o la captura con el `codigoExpiraEn` real.
   */
  async function verificarEstado(): Promise<void> {
    const actual = intento;
    if (actual === null || actual.fase !== 'confirmacion') return;
    repetir = verificarEstado;
    const fin = await serie({
      metodo: 'get',
      ruta: '/transferencias/{transferenciaId}',
      path: { transferenciaId: actual.transferenciaId },
    });
    if (terminarSinExito(fin)) return;
    const { respuesta } = fin;
    if (respuesta.status !== 200) {
      await rechazar(await leerProblema(respuesta));
      return;
    }
    const t = (await respuesta.json()) as Transferencia;
    if (t.estado === 'APLICADA') {
      await aplicada(comprobanteDeTransferencia(t));
      return;
    }
    if (t.estado === 'RECHAZADA') {
      await borrar();
      fijar({ tipo: 'rechazo', mensaje: mensajeDeMotivo(t.motivoRechazo) });
      return;
    }
    const confirmacion = await pasarAConfirmacion(actual, {
      transferenciaId: t.id,
      codigoExpiraEn: t.codigoExpiraEn ?? actual.codigoExpiraEn,
    });
    mostrarCaptura(confirmacion);
  }

  /**
   * §6.2: `POST /transferencias/{id}/confirmar` con el código guardado en el intento mientras
   * está en vuelo. Es idempotente por el id (R-6.13), así que se reintenta igual que la creación.
   */
  async function confirmarCodigo(): Promise<void> {
    const actual = intento;
    if (actual === null || actual.fase !== 'confirmacion' || actual.codigo === undefined) return;
    const fin = await serie({
      metodo: 'post',
      ruta: '/transferencias/{transferenciaId}/confirmar',
      path: { transferenciaId: actual.transferenciaId },
      body: { codigo: actual.codigo },
    });
    if (terminarSinExito(fin)) return;
    const { respuesta } = fin;
    if (respuesta.status === 201) {
      await aplicada((await respuesta.json()) as Comprobante);
      return;
    }
    const problema = await leerProblema(respuesta);
    if (respuesta.status === 422 && problema.type === 'codigo-incorrecto') {
      // §6.2: el código capturado se borra al recibir respuesta; el intento sigue pendiente.
      const sinCodigo: IntentoConfirmacion = { ...actual };
      delete sinCodigo.codigo;
      await guardar(sinCodigo);
      mostrarCaptura(sinCodigo, mensajeCodigoIncorrecto(problema.intentosRestantes));
      return;
    }
    // R-6.15: cualquier otro `422` o `4xx` cierra el intento; volver a enviar exige otra llave.
    await rechazar(problema);
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
      primerEnvio = true;
      void correr(crear);
    },

    /**
     * R-4.31: al entrar con sesión, resuelve el intento guardado antes de mostrar el saldo.
     * Según la fase (§6.2): `creacion` reenvía la creación con la misma llave; `confirmacion` con
     * código en vuelo reenvía la confirmación con ese código; sin código, consulta el GET. En
     * fase `confirmacion` nunca se reenvía la creación. Un intento ajeno o ilegible se borra sin
     * enviarlo (§13.3). Devuelve al terminar de decidir; la serie sigue en segundo plano.
     */
    async reanudar(): Promise<void> {
      if (estado.tipo !== 'inactivo') return;
      let crudo: string | null;
      try {
        crudo = await almacen.getItemAsync(LLAVE_INTENTO);
      } catch {
        return;
      }
      if (crudo === null) return;
      const guardado = interpretarIntento(crudo, sesion.usuarioActual());
      if (guardado === null) {
        await almacen.deleteItemAsync(LLAVE_INTENTO);
        return;
      }
      intento = guardado;
      primerEnvio = false;
      if (guardado.fase === 'creacion') void correr(crear);
      else if (guardado.codigo !== undefined) void correr(confirmarCodigo);
      else void correr(verificarEstado);
    },

    /** Captura del código: lo guarda en el intento **antes** de enviar la confirmación (§6.2). */
    async confirmar(codigo: string): Promise<void> {
      const actual = intento;
      if (estado.tipo !== 'codigo' || actual === null || actual.fase !== 'confirmacion') return;
      await guardar({ ...actual, codigo });
      void correr(confirmarCodigo);
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
