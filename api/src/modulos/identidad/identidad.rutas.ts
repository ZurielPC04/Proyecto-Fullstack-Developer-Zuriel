import { esquemaLogin, esquemaRefresh, esquemaRegistro } from '@billetera/shared';
import { Router } from 'express';
import { limiteRegistro, limitesLogin } from '../../plataforma/http/limites.js';
import { validar } from '../../plataforma/http/validar.js';
import type { ControladorIdentidad } from './identidad.controlador.js';

export const esquemasRegistro = { body: esquemaRegistro };
export const esquemasLogin = { body: esquemaLogin };
/** DD-24: el cuerpo es opcional; en la web el refresh viaja en la cookie. */
export const esquemasRefresh = { body: esquemaRefresh.optional() };

/**
 * Middleware 8 de §2.2: `/api/auth/*`. Los limitadores se crean aquí (§2.1, §11), así que
 * cada app tiene su propio almacén; van antes de `validar` y un 429 no llega al caso de uso.
 */
export function rutasIdentidad(controlador: ControladorIdentidad): Router {
  const router = Router();
  router.post('/auth/registro', limiteRegistro(), validar(esquemasRegistro), (req, res) =>
    controlador.registrar(req, res),
  );
  router.post('/auth/login', ...limitesLogin(), validar(esquemasLogin), (req, res) =>
    controlador.iniciarSesion(req, res),
  );
  router.post('/auth/refresh', validar(esquemasRefresh), (req, res) =>
    controlador.refrescar(req, res),
  );
  router.post('/auth/logout', validar(esquemasRefresh), (req, res) =>
    controlador.cerrarSesion(req, res),
  );
  return router;
}
