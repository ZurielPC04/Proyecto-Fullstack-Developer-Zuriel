// Sesión de la app móvil (design.md §13.3 "Sesión", D-05, D-06, DD-24, DD-45).
// - El refresh vive en el almacén seguro (`billetera.refresh`); el access, solo en memoria.
// - Una sola promesa de refresh en vuelo; las peticiones con 401 la esperan (R-1.17).
// - El refresh nuevo se escribe en el almacén antes de usar el access nuevo (DD-45).
import type { Tokens } from '@billetera/shared';
import { type Almacen, LLAVE_INTENTO, LLAVE_REFRESH } from './almacen';
import { CABECERAS_JSON, enviar, errorDeRespuesta, urlApi } from '../api/http';

/** `restaurando` mientras se intenta recuperar la sesión guardada al abrir la app. */
export type EstadoSesion = 'restaurando' | 'sin-sesion' | 'con-sesion';

export type DependenciasSesion = {
  apiUrl: string;
  almacen: Almacen;
  fetchFn?: typeof fetch;
};

export type Sesion = ReturnType<typeof crearSesion>;

export function crearSesion({ apiUrl, almacen, fetchFn = fetch }: DependenciasSesion) {
  let access: string | null = null;
  let estado: EstadoSesion = 'restaurando';
  let refrescoEnVuelo: Promise<boolean> | null = null;
  const suscriptores = new Set<() => void>();

  function fijar(nuevoAccess: string | null, nuevoEstado: EstadoSesion): void {
    access = nuevoAccess;
    if (nuevoEstado === estado) return;
    estado = nuevoEstado;
    for (const avisar of suscriptores) avisar();
  }

  /** DD-45: primero el refresh en el almacén, después el access en memoria. */
  async function guardarTokens(tokens: Tokens): Promise<void> {
    if (!tokens.refreshToken) throw new Error('La API no devolvió el refresh (DD-24)');
    await almacen.setItemAsync(LLAVE_REFRESH, tokens.refreshToken);
    fijar(tokens.accessToken, 'con-sesion');
  }

  function postJson(ruta: string, cuerpo: unknown): Promise<Response> {
    return enviar(fetchFn, urlApi(apiUrl, ruta), {
      method: 'POST',
      headers: CABECERAS_JSON,
      body: JSON.stringify(cuerpo),
    });
  }

  /**
   * Rota el refresh. Un 400 o 401 significa que el refresh ya no sirve: se borra y se pide
   * login, pero se conserva el intento para reanudarlo al volver a entrar (DD-45). Un error de
   * red o un 5xx se lanza sin tocar la sesión.
   */
  async function rotar(): Promise<boolean> {
    const refresh = await almacen.getItemAsync(LLAVE_REFRESH);
    if (refresh === null) {
      fijar(null, 'sin-sesion');
      return false;
    }
    const respuesta = await postJson('/auth/refresh', { refreshToken: refresh });
    if (respuesta.status === 400 || respuesta.status === 401) {
      await almacen.deleteItemAsync(LLAVE_REFRESH);
      fijar(null, 'sin-sesion');
      return false;
    }
    if (!respuesta.ok) throw await errorDeRespuesta(respuesta);
    await guardarTokens((await respuesta.json()) as Tokens);
    return true;
  }

  return {
    obtenerAccess(): string | null {
      return access;
    },

    obtenerEstado(): EstadoSesion {
      return estado;
    },

    /** Para `useSyncExternalStore`: avisa cada vez que cambia el estado. */
    suscribir(avisar: () => void): () => void {
      suscriptores.add(avisar);
      return () => {
        suscriptores.delete(avisar);
      };
    },

    /**
     * R-1.17: una sola rotación en vuelo; quien llega mientras tanto espera la misma promesa.
     * `accessFallido` es el access con el que falló la petición: si ya hay otro, alguien más
     * rotó y no se vuelve a rotar. Devuelve true si hay un access válido al salir.
     */
    refrescar(accessFallido: string | null = null): Promise<boolean> {
      if (access !== null && access !== accessFallido) return Promise.resolve(true);
      refrescoEnVuelo ??= rotar().finally(() => {
        refrescoEnVuelo = null;
      });
      return refrescoEnVuelo;
    },

    /** Al abrir la app: con un refresh guardado obtiene un access; si no, pide login. */
    async restaurar(): Promise<void> {
      if (estado !== 'restaurando') return;
      try {
        await this.refrescar();
      } catch {
        // Sin red o 5xx: se pide login. El refresh guardado no se borra.
        fijar(null, 'sin-sesion');
      }
    },

    /** DD-24: login con `cliente: "movil"`; el refresh llega en el cuerpo. */
    async iniciarSesion(correo: string, contrasena: string): Promise<void> {
      const respuesta = await postJson('/auth/login', { correo, contrasena, cliente: 'movil' });
      if (!respuesta.ok) throw await errorDeRespuesta(respuesta);
      await guardarTokens((await respuesta.json()) as Tokens);
    },

    /**
     * R-1.12: revoca la familia en la API y borra el refresh y el intento del almacén. El
     * cliente se limpia aunque la API no responda.
     */
    async cerrarSesion(): Promise<void> {
      const refresh = await almacen.getItemAsync(LLAVE_REFRESH);
      if (refresh !== null) {
        try {
          await postJson('/auth/logout', { refreshToken: refresh });
        } catch {
          // Sin red: la familia vence sola (DD-30); el cliente se limpia igual.
        }
      }
      await almacen.deleteItemAsync(LLAVE_REFRESH);
      await almacen.deleteItemAsync(LLAVE_INTENTO);
      fijar(null, 'sin-sesion');
    },
  };
}
