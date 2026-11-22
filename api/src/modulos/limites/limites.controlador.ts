import { instanteIso } from '@billetera/shared';
import type { Request, Response } from 'express';
import type { ConsultasLimites } from './limites.casos-uso.js';

/** `autenticar` va antes en la ruta: sin `usuarioId` es un error de composición. */
function usuarioDe(req: Request): string {
  if (req.usuarioId === undefined) throw new Error('La ruta de límites va después de autenticar');
  return req.usuarioId;
}

/** §2.1: contrato `Limites`, con `reiniciaEn` en el formato de DD-22. */
export function crearControladorLimites(consultas: ConsultasLimites) {
  return {
    async obtener(req: Request, res: Response): Promise<void> {
      const l = await consultas.obtener(usuarioDe(req));
      res.json({
        limiteCentavos: l.limiteCentavos,
        consumidoCentavos: l.consumidoCentavos,
        disponibleCentavos: l.disponibleCentavos,
        dia: l.dia,
        reiniciaEn: instanteIso(l.reiniciaEn),
      });
    },
  };
}

export type ControladorLimites = ReturnType<typeof crearControladorLimites>;
