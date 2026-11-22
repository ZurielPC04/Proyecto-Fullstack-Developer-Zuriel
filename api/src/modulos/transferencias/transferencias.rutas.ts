import {
  esquemaConfirmacion,
  esquemaIdempotencyKey,
  esquemaTransferencia,
  uuid,
} from '@billetera/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validar } from '../../plataforma/http/validar.js';
import type { ControladorTransferencias } from './transferencias.controlador.js';

/** R-4.8, R-4.9 y R-4.13: cuerpo y `Idempotency-Key` se validan antes de tocar la base (§6.2). */
export const esquemasCrearTransferencia = {
  headers: z.object({ 'idempotency-key': esquemaIdempotencyKey }),
  body: esquemaTransferencia,
};
export const esquemasObtenerTransferencia = {
  params: z.object({ transferenciaId: uuid() }),
};
/** §6.7: el código son 6 dígitos; otro formato es un 400 y no consume intentos. */
export const esquemasConfirmarTransferencia = {
  params: z.object({ transferenciaId: uuid() }),
  body: esquemaConfirmacion,
};

/** Middlewares 9 y 10 de §2.2, con `autenticar` en cada ruta (no `router.use`). */
export function rutasTransferencias(
  controlador: ControladorTransferencias,
  autenticar: RequestHandler,
): Router {
  const router = Router();
  router.post('/transferencias', autenticar, validar(esquemasCrearTransferencia), (req, res) =>
    controlador.crear(req, res),
  );
  router.get(
    '/transferencias/:transferenciaId',
    autenticar,
    validar(esquemasObtenerTransferencia),
    (req, res) => controlador.obtener(req, res),
  );
  router.post(
    '/transferencias/:transferenciaId/confirmar',
    autenticar,
    validar(esquemasConfirmarTransferencia),
    (req, res) => controlador.confirmar(req, res),
  );
  return router;
}
