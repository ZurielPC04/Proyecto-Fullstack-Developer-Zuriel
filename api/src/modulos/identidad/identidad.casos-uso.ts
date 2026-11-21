import { randomBytes, randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { ConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { CredencialesInvalidas } from '../../plataforma/http/errores.js';
import { enmascararCorreo } from '../../plataforma/logging/enmascarar.js';
import type { Reloj } from '../../plataforma/reloj/index.js';
import type { Contrasenas } from '../../plataforma/seguridad/contrasenas.js';
import { generarRefresh, hashRefresh, type Tokens } from '../../plataforma/seguridad/tokens.js';
import { registrarEvento } from '../auditoria/auditoria.casos-uso.js';
import { crearCuentasDeUsuario, type GenerarClabe } from '../cuentas/cuentas.casos-uso.js';
import type { Transferencias } from '../transferencias/transferencias.casos-uso.js';
import { buscarUsuarioPorCorreo, insertarUsuario } from './identidad.repositorio.js';
import {
  bloquearSesionPorHash,
  estaVencida,
  insertarSesion,
  marcarUsada,
  revocarFamilia,
} from './sesion.repositorio.js';

export interface DependenciasIdentidad {
  conTransaccion: ConTransaccion;
  contrasenas: Contrasenas;
  transferencias: Transferencias;
  generarClabe: GenerarClabe;
  tokens: Tokens;
  reloj: Reloj;
  logger: Logger;
  /** D-20: 0 desactiva el fondeo de bienvenida. */
  fondeoBienvenidaCentavos: number;
}

export interface SolicitudRegistro {
  /** Ya normalizado por el esquema de shared (trim y minúsculas). */
  correo: string;
  contrasena: string;
}

export interface UsuarioRegistrado {
  id: string;
  correo: string;
}

export type Cliente = 'web' | 'movil';

/** Tokens de una sesión abierta o rotada. El controlador decide el canal del refresh. */
export interface SesionAbierta {
  accessToken: string;
  accessExpiraEn: string;
  refreshToken: string;
  /** Texto de timestamptz (DD-07); el controlador lo pasa a ISO (DD-22). */
  refreshExpiraEn: string;
  /** Segundos hasta `refreshExpiraEn`, para el `Max-Age` de la cookie (§5.3). */
  refreshMaxAgeS: number;
}

/** §5.3: el reúso y los demás rechazos son resultado, no excepción, para confirmar antes del 401. */
export type ResultadoRefresh = { ok: true; sesion: SesionAbierta } | { ok: false };

export function crearCasosUsoIdentidad(dependencias: DependenciasIdentidad) {
  const {
    conTransaccion,
    contrasenas,
    transferencias,
    generarClabe,
    tokens,
    reloj,
    logger,
    fondeoBienvenidaCentavos,
  } = dependencias;

  // §5.1 y R-1.7: hash ficticio calculado al arrancar con los mismos parámetros. Un correo
  // inexistente se verifica contra él, para tardar lo mismo que una contraseña incorrecta.
  const hashFicticio = contrasenas.hash(randomBytes(32).toString('base64url'));
  hashFicticio.catch(() => undefined); // si falla, el login lo propaga como 500.

  async function emitir(
    usuarioId: string,
    refreshToken: string,
    sesion: { expiraEn: string; maxAgeS: number },
  ): Promise<SesionAbierta> {
    const access = await tokens.emitirAccess(usuarioId);
    return {
      accessToken: access.token,
      accessExpiraEn: access.expiraEn,
      refreshToken,
      refreshExpiraEn: sesion.expiraEn,
      refreshMaxAgeS: sesion.maxAgeS,
    };
  }

  return {
    /**
     * R-1.1 a R-1.3, §12.1: usuario, cuentas, fondeo de bienvenida y eventos en una sola
     * transacción. El hash se calcula antes, para no retener una conexión durante argon2.
     * No abre sesión (DD-24).
     */
    async registrar({ correo, contrasena }: SolicitudRegistro): Promise<UsuarioRegistrado> {
      const hash = await contrasenas.hash(contrasena);
      return conTransaccion(async (tx) => {
        // El INSERT deja bloqueado al usuario: el fondeo respeta el orden de D-12 (§12.1).
        const id = await insertarUsuario(tx, correo, hash);
        const { principalId, ahorroId } = await crearCuentasDeUsuario(tx, id, generarClabe);
        if (fondeoBienvenidaCentavos > 0) {
          await transferencias.fondear(
            tx,
            principalId,
            fondeoBienvenidaCentavos,
            'Depósito de bienvenida',
          );
        }
        await registrarEvento(tx, {
          tipo: 'usuario-registrado',
          usuarioId: id,
          datos: { cuentas: [principalId, ahorroId] },
        });
        return { id, correo };
      });
    },

    /** R-1.6, R-1.7, §12.2: familia nueva de 7 días; el mismo rechazo exista o no el correo. */
    async iniciarSesion(solicitud: {
      correo: string;
      contrasena: string;
      cliente: Cliente;
    }): Promise<SesionAbierta> {
      const { correo, contrasena, cliente } = solicitud;
      const usuario = await conTransaccion((tx) => buscarUsuarioPorCorreo(tx, correo));
      // Siempre exactamente una verificación argon2, con el hash real o con el ficticio.
      const coincide = await contrasenas.verificar(
        usuario?.hashContrasena ?? (await hashFicticio),
        contrasena,
      );
      if (!usuario || !coincide) {
        // §10.2: sin transacción de negocio, se inserta solo.
        await conTransaccion((tx) =>
          registrarEvento(tx, {
            tipo: 'login-fallido',
            usuarioId: null,
            datos: { correo: enmascararCorreo(correo) },
          }),
        );
        throw new CredencialesInvalidas();
      }

      const refreshToken = generarRefresh();
      const sesion = await conTransaccion(async (tx) => {
        const familiaId = randomUUID();
        const ahora = await reloj.ahora(tx);
        const emitida = await insertarSesion(tx, {
          usuarioId: usuario.id,
          familiaId,
          refreshHash: hashRefresh(refreshToken),
          ahora,
        });
        await registrarEvento(tx, {
          tipo: 'sesion-iniciada',
          usuarioId: usuario.id,
          datos: { familiaId, cliente },
        });
        return emitida;
      });
      return emitir(usuario.id, refreshToken, sesion);
    },

    /** R-1.8 a R-1.10, §5.3: rotación en la misma familia y con el mismo vencimiento (DD-30). */
    async refrescar(refreshToken: string): Promise<ResultadoRefresh> {
      const resultado = await conTransaccion(async (tx) => {
        const actual = await bloquearSesionPorHash(tx, hashRefresh(refreshToken));
        if (!actual || actual.revocada) return { ok: false } as const;
        const ahora = await reloj.ahora(tx);
        if (actual.usada) {
          // R-1.9: reúso. Se revoca la familia, se audita y se confirma antes del 401.
          const sesionesRevocadas = await revocarFamilia(tx, actual.familiaId, ahora);
          await registrarEvento(tx, {
            tipo: 'refresh-reuse-detected',
            usuarioId: actual.usuarioId,
            datos: { familiaId: actual.familiaId, sesionesRevocadas },
          });
          logger.warn(
            { usuarioId: actual.usuarioId, familiaId: actual.familiaId },
            'reúso de refresh: familia revocada',
          );
          return { ok: false } as const;
        }
        if (await estaVencida(tx, actual.expiraEn, ahora)) return { ok: false } as const;

        const nuevo = generarRefresh();
        await marcarUsada(tx, actual.id, ahora);
        const emitida = await insertarSesion(tx, {
          usuarioId: actual.usuarioId,
          familiaId: actual.familiaId,
          refreshHash: hashRefresh(nuevo),
          ahora,
          expiraEn: actual.expiraEn,
        });
        return { ok: true, usuarioId: actual.usuarioId, nuevo, emitida } as const;
      });
      if (!resultado.ok) return { ok: false };
      return {
        ok: true,
        sesion: await emitir(resultado.usuarioId, resultado.nuevo, resultado.emitida),
      };
    },

    /** R-1.12, §5.3: revoca la familia del refresh, usado o no; si no existe, no hace nada. */
    async cerrarSesion(refreshToken: string | undefined): Promise<void> {
      if (refreshToken === undefined) return;
      await conTransaccion(async (tx) => {
        const actual = await bloquearSesionPorHash(tx, hashRefresh(refreshToken));
        if (!actual) return;
        const ahora = await reloj.ahora(tx);
        const revocadas = await revocarFamilia(tx, actual.familiaId, ahora);
        if (revocadas > 0) {
          await registrarEvento(tx, {
            tipo: 'sesion-cerrada',
            usuarioId: actual.usuarioId,
            datos: { familiaId: actual.familiaId },
          });
        }
      });
    },
  };
}

export type CasosUsoIdentidad = ReturnType<typeof crearCasosUsoIdentidad>;
