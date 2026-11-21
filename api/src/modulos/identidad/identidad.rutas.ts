import { esquemaRegistro } from '@billetera/shared';
import { Router } from 'express';
import { validar } from '../../plataforma/http/validar.js';
import type { ControladorIdentidad } from './identidad.controlador.js';

export const esquemasRegistro = { body: esquemaRegistro };

/** Middleware 8 de §2.2: `/api/auth/*`. El rate limit llega con T-API-14. */
export function rutasIdentidad(controlador: ControladorIdentidad): Router {
  const router = Router();
  router.post('/auth/registro', validar(esquemasRegistro), (req, res) =>
    controlador.registrar(req, res),
  );
  return router;
}
