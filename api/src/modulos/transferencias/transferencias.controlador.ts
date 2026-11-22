import type { Request, Response } from 'express';
import { responderProblema } from '../../plataforma/http/problemas.js';
import type { DatosValidados } from '../../plataforma/http/validar.js';
import type { CasosUsoTransferencias } from './transferencias.casos-uso.js';
import { aTransferencia, respuestaDeTransferencia } from './transferencias.respuesta.js';
import type {
  esquemasCrearTransferencia,
  esquemasObtenerTransferencia,
} from './transferencias.rutas.js';

/** `autenticar` va antes en la ruta: sin `usuarioId` es un error de composición. */
function usuarioDe(req: Request): string {
  if (req.usuarioId === undefined) {
    throw new Error('La ruta de transferencias va después de autenticar');
  }
  return req.usuarioId;
}

/** §2.1: petición validada → caso de uso; la fila → HTTP con `respuestaDeTransferencia`. */
export function crearControladorTransferencias(casos: CasosUsoTransferencias) {
  return {
    async crear(req: Request, res: Response): Promise<void> {
      const { body, headers } = req.validado as DatosValidados<typeof esquemasCrearTransferencia>;
      const fila = await casos.crear(usuarioDe(req), headers['idempotency-key'], body);
      const respuesta = respuestaDeTransferencia(fila);
      if (respuesta.status === 422) responderProblema(res, respuesta.cuerpo);
      else res.status(respuesta.status).json(respuesta.cuerpo);
    },

    async obtener(req: Request, res: Response): Promise<void> {
      const { params } = req.validado as DatosValidados<typeof esquemasObtenerTransferencia>;
      res.json(aTransferencia(await casos.obtener(usuarioDe(req), params.transferenciaId)));
    },
  };
}

export type ControladorTransferencias = ReturnType<typeof crearControladorTransferencias>;
