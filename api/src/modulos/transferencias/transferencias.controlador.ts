import type { Request, Response } from 'express';
import { crearProblema, responderProblema } from '../../plataforma/http/problemas.js';
import type { DatosValidados } from '../../plataforma/http/validar.js';
import type { CasosUsoTransferencias } from './transferencias.casos-uso.js';
import {
  aTransferencia,
  respuestaDeConfirmacion,
  respuestaDeTransferencia,
  type RespuestaTransferencia,
} from './transferencias.respuesta.js';
import type {
  esquemasConfirmarTransferencia,
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

function enviar(res: Response, respuesta: RespuestaTransferencia): void {
  if (respuesta.status === 422) responderProblema(res, respuesta.cuerpo);
  else res.status(respuesta.status).json(respuesta.cuerpo);
}

/** §2.1: petición validada → caso de uso; la fila → HTTP con `respuestaDeTransferencia`. */
export function crearControladorTransferencias(casos: CasosUsoTransferencias) {
  return {
    async crear(req: Request, res: Response): Promise<void> {
      const { body, headers } = req.validado as DatosValidados<typeof esquemasCrearTransferencia>;
      const { fila, codigoSimulado } = await casos.crear(
        usuarioDe(req),
        headers['idempotency-key'],
        body,
      );
      const respuesta = respuestaDeTransferencia(fila);
      // R-6.17 y DD-25: el código simulado solo va en la primera respuesta 202.
      if (respuesta.status === 202 && codigoSimulado !== undefined) {
        res.status(202).json({ ...respuesta.cuerpo, codigoSimulado });
        return;
      }
      enviar(res, respuesta);
    },

    async confirmar(req: Request, res: Response): Promise<void> {
      const { params, body } = req.validado as DatosValidados<
        typeof esquemasConfirmarTransferencia
      >;
      const resultado = await casos.confirmar(usuarioDe(req), params.transferenciaId, body.codigo);
      if (resultado.tipo === 'codigo-incorrecto') {
        // DD-33: el fallo informa los intentos restantes.
        responderProblema(
          res,
          crearProblema('codigo-incorrecto', {
            transferenciaId: resultado.transferenciaId,
            intentosRestantes: resultado.intentosRestantes,
          }),
        );
        return;
      }
      enviar(res, respuestaDeConfirmacion(resultado.fila));
    },

    async obtener(req: Request, res: Response): Promise<void> {
      const { params } = req.validado as DatosValidados<typeof esquemasObtenerTransferencia>;
      res.json(aTransferencia(await casos.obtener(usuarioDe(req), params.transferenciaId)));
    },
  };
}

export type ControladorTransferencias = ReturnType<typeof crearControladorTransferencias>;
