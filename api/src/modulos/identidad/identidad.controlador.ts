import { instanteIso } from '@billetera/shared';
import type { CookieOptions, Request, Response } from 'express';
import { NoAutenticado, ValidacionFallida } from '../../plataforma/http/errores.js';
import type { DatosValidados } from '../../plataforma/http/validar.js';
import type { CasosUsoIdentidad, SesionAbierta } from './identidad.casos-uso.js';
import type { esquemasLogin, esquemasRefresh, esquemasRegistro } from './identidad.rutas.js';

/** §5.3 y R-1.13: la cookie del refresh de la web. */
const COOKIE_REFRESH = 'billetera_refresh';
const ATRIBUTOS_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth',
};

type Canal = { tipo: 'cookie'; refresh: string } | { tipo: 'cuerpo'; refresh: string };

/**
 * DD-24: el refresh llega por cookie o por cuerpo, nunca por los dos. Con cookie exige
 * `X-Requested-With: fetch` (R-1.16). `undefined` si no llegó por ningún canal.
 */
function canalDelRefresh(req: Request, refreshDelCuerpo: string | undefined): Canal | undefined {
  const deCookie: unknown = (req.cookies as Record<string, unknown> | undefined)?.[COOKIE_REFRESH];
  const cookie = typeof deCookie === 'string' && deCookie !== '' ? deCookie : undefined;
  if (cookie !== undefined && refreshDelCuerpo !== undefined) {
    throw new ValidacionFallida([
      {
        campo: 'body.refreshToken',
        mensaje: 'Manda el refresh por cookie o por cuerpo, no por los dos.',
      },
    ]);
  }
  if (cookie !== undefined) {
    if (req.get('x-requested-with') !== 'fetch') {
      throw new ValidacionFallida([
        { campo: 'headers.x-requested-with', mensaje: 'Con cookie, el header debe valer "fetch".' },
      ]);
    }
    return { tipo: 'cookie', refresh: cookie };
  }
  return refreshDelCuerpo === undefined ? undefined : { tipo: 'cuerpo', refresh: refreshDelCuerpo };
}

/** El refresh vuelve por el mismo canal que se pidió: cookie para la web, cuerpo para móvil. */
function responderSesion(res: Response, sesion: SesionAbierta, canal: 'cookie' | 'cuerpo'): void {
  const base = {
    accessToken: sesion.accessToken,
    accessExpiraEn: sesion.accessExpiraEn,
    refreshExpiraEn: instanteIso(sesion.refreshExpiraEn),
  };
  if (canal === 'cookie') {
    res.cookie(COOKIE_REFRESH, sesion.refreshToken, {
      ...ATRIBUTOS_COOKIE,
      maxAge: sesion.refreshMaxAgeS * 1000,
    });
    res.json(base);
    return;
  }
  res.json({ ...base, refreshToken: sesion.refreshToken });
}

/** §2.1: petición validada → comando; resultado → código HTTP y cuerpo. */
export function crearControladorIdentidad(casos: CasosUsoIdentidad) {
  return {
    async registrar(req: Request, res: Response): Promise<void> {
      const { body } = req.validado as DatosValidados<typeof esquemasRegistro>;
      const usuario = await casos.registrar(body);
      res.status(201).json(usuario);
    },

    async iniciarSesion(req: Request, res: Response): Promise<void> {
      const { body } = req.validado as DatosValidados<typeof esquemasLogin>;
      const sesion = await casos.iniciarSesion(body);
      // DD-24: web → solo cookie; móvil → solo cuerpo.
      responderSesion(res, sesion, body.cliente === 'web' ? 'cookie' : 'cuerpo');
    },

    async refrescar(req: Request, res: Response): Promise<void> {
      const { body } = req.validado as DatosValidados<typeof esquemasRefresh>;
      const canal = canalDelRefresh(req, body?.refreshToken);
      if (!canal) {
        throw new ValidacionFallida([
          { campo: 'body.refreshToken', mensaje: 'Falta el refresh token.' },
        ]);
      }
      const resultado = await casos.refrescar(canal.refresh);
      if (!resultado.ok) throw new NoAutenticado();
      responderSesion(res, resultado.sesion, canal.tipo);
    },

    async cerrarSesion(req: Request, res: Response): Promise<void> {
      const { body } = req.validado as DatosValidados<typeof esquemasRefresh>;
      const canal = canalDelRefresh(req, body?.refreshToken);
      await casos.cerrarSesion(canal?.refresh);
      // DD-24: siempre borra la cookie y responde 204, aunque el refresh ya no sirva.
      res.cookie(COOKIE_REFRESH, '', { ...ATRIBUTOS_COOKIE, maxAge: 0 });
      res.status(204).end();
    },
  };
}

export type ControladorIdentidad = ReturnType<typeof crearControladorIdentidad>;
