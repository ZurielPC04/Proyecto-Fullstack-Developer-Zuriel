import { Router, type RequestHandler } from 'express';
import type { ControladorLimites } from './limites.controlador.js';

/** Middlewares 9 y 10 de §2.2, con `autenticar` en la ruta (no `router.use`). */
export function rutasLimites(controlador: ControladorLimites, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/limites', autenticar, (req, res) => controlador.obtener(req, res));
  return router;
}
