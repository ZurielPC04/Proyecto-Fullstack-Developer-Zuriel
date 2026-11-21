import type { Request, Response } from 'express';
import type { DatosValidados } from '../../plataforma/http/validar.js';
import type { ConsultasCuentas, CuentaPropia } from './cuentas.casos-uso.js';
import type { esquemasObtenerCuenta } from './cuentas.rutas.js';

/** `autenticar` va antes en la ruta: sin `usuarioId` es un error de composición. */
function usuarioDe(req: Request): string {
  if (req.usuarioId === undefined) throw new Error('La ruta de cuentas va después de autenticar');
  return req.usuarioId;
}

/** Contrato `Cuenta`: solo estas cuatro claves, con el saldo en centavos enteros (D-18). */
const aCuenta = ({ id, nombre, clabe, saldoCentavos }: CuentaPropia) => ({
  id,
  nombre,
  clabe,
  saldoCentavos,
});

/** §2.1: petición validada → consulta; resultado → código HTTP y cuerpo. */
export function crearControladorCuentas(consultas: ConsultasCuentas) {
  return {
    async listar(req: Request, res: Response): Promise<void> {
      const cuentas = await consultas.listar(usuarioDe(req));
      res.json({ items: cuentas.map(aCuenta) });
    },

    async obtener(req: Request, res: Response): Promise<void> {
      const { params } = req.validado as DatosValidados<typeof esquemasObtenerCuenta>;
      res.json(aCuenta(await consultas.obtener(usuarioDe(req), params.cuentaId)));
    },
  };
}

export type ControladorCuentas = ReturnType<typeof crearControladorCuentas>;
