import type { Request, Response } from 'express';
import type { DatosValidados } from '../../plataforma/http/validar.js';
import type { ConsultasMovimientos } from './movimientos.casos-uso.js';
import type { esquemasListarMovimientos } from './movimientos.rutas.js';

/** `autenticar` va antes en la ruta: sin `usuarioId` es un error de composición. */
function usuarioDe(req: Request): string {
  if (req.usuarioId === undefined)
    throw new Error('La ruta de movimientos va después de autenticar');
  return req.usuarioId;
}

/** §2.1: petición validada → consulta; la página ya tiene la forma de `PaginaMovimientos`. */
export function crearControladorMovimientos(consultas: ConsultasMovimientos) {
  return {
    async listar(req: Request, res: Response): Promise<void> {
      const { params, query } = req.validado as DatosValidados<typeof esquemasListarMovimientos>;
      res.json(await consultas.listar(usuarioDe(req), params.cuentaId, query));
    },
  };
}

export type ControladorMovimientos = ReturnType<typeof crearControladorMovimientos>;
