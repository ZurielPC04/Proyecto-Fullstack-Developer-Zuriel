import { esquemaQueryMovimientos, uuid } from '@billetera/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validar } from '../../plataforma/http/validar.js';
import type { ControladorMovimientos } from './movimientos.controlador.js';

/** §8.1 paso 2: limite, fechas, tipo y la forma del cursor (R-5.2, R-5.5 a R-5.7). */
export const esquemasListarMovimientos = {
  params: z.object({ cuentaId: uuid() }),
  query: esquemaQueryMovimientos,
};

/** Middlewares 9 y 10 de §2.2, con `autenticar` en la ruta (no `router.use`). */
export function rutasMovimientos(
  controlador: ControladorMovimientos,
  autenticar: RequestHandler,
): Router {
  const router = Router();
  router.get(
    '/cuentas/:cuentaId/movimientos',
    autenticar,
    validar(esquemasListarMovimientos),
    (req, res) => controlador.listar(req, res),
  );
  return router;
}
