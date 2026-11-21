import { esquemaBeneficiario, uuid } from '@billetera/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { limiteAltaBeneficiarios } from '../../plataforma/http/limites.js';
import { validar } from '../../plataforma/http/validar.js';
import type { ControladorBeneficiarios } from './beneficiarios.controlador.js';

/** R-3.2 pasos 1 y 2 (18 dígitos y dígito verificador) los valida el esquema de shared. */
export const esquemasAltaBeneficiario = { body: esquemaBeneficiario };
export const esquemasObtenerBeneficiario = { params: z.object({ beneficiarioId: uuid() }) };

/**
 * Middlewares 9 y 10 de §2.2, con `autenticar` en cada ruta (no `router.use`). El limitador
 * del alta (§11) se crea aquí, después de `autenticar` porque cuenta por `usuarioId`, y antes
 * de `validar`: toda petición cuenta y un 429 no llega al caso de uso.
 */
export function rutasBeneficiarios(
  controlador: ControladorBeneficiarios,
  autenticar: RequestHandler,
): Router {
  const router = Router();
  router.get('/beneficiarios', autenticar, (req, res) => controlador.listar(req, res));
  router.post(
    '/beneficiarios',
    autenticar,
    limiteAltaBeneficiarios(),
    validar(esquemasAltaBeneficiario),
    (req, res) => controlador.crear(req, res),
  );
  router.get(
    '/beneficiarios/:beneficiarioId',
    autenticar,
    validar(esquemasObtenerBeneficiario),
    (req, res) => controlador.obtener(req, res),
  );
  return router;
}
