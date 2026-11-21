import type { Request, Response } from 'express';
import type { DatosValidados } from '../../plataforma/http/validar.js';
import type { CasosUsoIdentidad } from './identidad.casos-uso.js';
import type { esquemasRegistro } from './identidad.rutas.js';

/** §2.1: petición validada → comando; resultado → código HTTP y cuerpo. */
export function crearControladorIdentidad(casos: CasosUsoIdentidad) {
  return {
    async registrar(req: Request, res: Response): Promise<void> {
      const { body } = req.validado as DatosValidados<typeof esquemasRegistro>;
      const usuario = await casos.registrar(body);
      res.status(201).json(usuario);
    },
  };
}

export type ControladorIdentidad = ReturnType<typeof crearControladorIdentidad>;
