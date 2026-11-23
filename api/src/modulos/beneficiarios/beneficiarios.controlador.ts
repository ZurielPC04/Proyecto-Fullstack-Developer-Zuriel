import type { Request, Response } from 'express';
import type { DatosValidados } from '../../plataforma/http/validar.js';
import type { BeneficiarioPropio, CasosUsoBeneficiarios } from './beneficiarios.casos-uso.js';
import type {
  esquemasAltaBeneficiario,
  esquemasObtenerBeneficiario,
} from './beneficiarios.rutas.js';

/** `autenticar` va antes en la ruta: sin `usuarioId` es un error de composición. */
function usuarioDe(req: Request): string {
  if (req.usuarioId === undefined) {
    throw new Error('La ruta de beneficiarios va después de autenticar');
  }
  return req.usuarioId;
}

/** Contrato `Beneficiario`: solo estas cinco claves; nada del titular de la cuenta (R-3.6). */
const aBeneficiario = ({ id, nombre, alias, clabe, esCuentaPropia }: BeneficiarioPropio) => ({
  id,
  nombre,
  alias,
  clabe,
  esCuentaPropia,
});

/** §2.1: petición validada → caso de uso; resultado → código HTTP y cuerpo. */
export function crearControladorBeneficiarios(casos: CasosUsoBeneficiarios) {
  return {
    async crear(req: Request, res: Response): Promise<void> {
      const { body } = req.validado as DatosValidados<typeof esquemasAltaBeneficiario>;
      const beneficiario = await casos.crear(usuarioDe(req), body);
      res.status(201).json(aBeneficiario(beneficiario));
    },

    async listar(req: Request, res: Response): Promise<void> {
      const beneficiarios = await casos.listar(usuarioDe(req));
      res.json({ items: beneficiarios.map(aBeneficiario) });
    },

    async obtener(req: Request, res: Response): Promise<void> {
      const { params } = req.validado as DatosValidados<typeof esquemasObtenerBeneficiario>;
      res.json(aBeneficiario(await casos.obtener(usuarioDe(req), params.beneficiarioId)));
    },
  };
}

export type ControladorBeneficiarios = ReturnType<typeof crearControladorBeneficiarios>;
