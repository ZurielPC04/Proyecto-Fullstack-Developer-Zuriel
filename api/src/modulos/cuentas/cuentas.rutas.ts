import { uuid } from '@billetera/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validar } from '../../plataforma/http/validar.js';
import type { ControladorCuentas } from './cuentas.controlador.js';

export const esquemasObtenerCuenta = { params: z.object({ cuentaId: uuid() }) };

/**
 * Middlewares 9 y 10 de §2.2. `autenticar` va en cada ruta y no con `router.use`: así una
 * ruta que no es de este módulo sigue llegando a su router o al 404, no a un 401.
 */
export function rutasCuentas(controlador: ControladorCuentas, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/cuentas', autenticar, (req, res) => controlador.listar(req, res));
  router.get('/cuentas/:cuentaId', autenticar, validar(esquemasObtenerCuenta), (req, res) =>
    controlador.obtener(req, res),
  );
  return router;
}
