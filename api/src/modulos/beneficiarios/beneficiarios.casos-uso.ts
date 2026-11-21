import type { ConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { ClabeNoEncontrada, NoEncontrado } from '../../plataforma/http/errores.js';
import { enmascararClabe } from '../../plataforma/logging/enmascarar.js';
import { registrarEvento } from '../auditoria/auditoria.casos-uso.js';
import {
  buscarBeneficiarioDeUsuario,
  buscarCuentaDeUsuarioPorClabe,
  insertarBeneficiario,
  listarBeneficiariosDeUsuario,
  type BeneficiarioPropio,
} from './beneficiarios.repositorio.js';

export type { BeneficiarioPropio };

export interface SolicitudBeneficiario {
  /** Ya normalizados por el esquema de shared (DD-16); la CLABE ya pasó R-3.3 y R-3.4. */
  nombre: string;
  alias: string;
  clabe: string;
}

/** HU-3: alta y consulta de beneficiarios, siempre del `usuarioId` autenticado. */
export function crearCasosUsoBeneficiarios({ conTransaccion }: { conTransaccion: ConTransaccion }) {
  return {
    /**
     * R-3.2, paso 3: la CLABE debe ser de una cuenta de usuario (R-3.5). Se guarda `cuenta_id`
     * (D-19) y se audita en la misma transacción (DD-40). La respuesta solo lleva lo que
     * capturó el usuario y `esCuentaPropia` (R-3.6, DD-26).
     */
    crear(usuarioId: string, solicitud: SolicitudBeneficiario): Promise<BeneficiarioPropio> {
      return conTransaccion(async (tx) => {
        const cuenta = await buscarCuentaDeUsuarioPorClabe(tx, solicitud.clabe);
        if (!cuenta) throw new ClabeNoEncontrada();
        const id = await insertarBeneficiario(tx, { usuarioId, cuentaId: cuenta.id, ...solicitud });
        await registrarEvento(tx, {
          tipo: 'beneficiario-creado',
          usuarioId,
          datos: { beneficiarioId: id, clabe: enmascararClabe(solicitud.clabe) },
        });
        return { id, ...solicitud, esCuentaPropia: cuenta.usuarioId === usuarioId };
      });
    },

    /** R-3.11. */
    listar(usuarioId: string): Promise<BeneficiarioPropio[]> {
      return conTransaccion((tx) => listarBeneficiariosDeUsuario(tx, usuarioId));
    },

    /** R-3.11 y D-10: ajeno o inexistente lanzan el mismo `NoEncontrado`. */
    async obtener(usuarioId: string, beneficiarioId: string): Promise<BeneficiarioPropio> {
      const beneficiario = await conTransaccion((tx) =>
        buscarBeneficiarioDeUsuario(tx, usuarioId, beneficiarioId),
      );
      if (!beneficiario) throw new NoEncontrado();
      return beneficiario;
    },
  };
}

export type CasosUsoBeneficiarios = ReturnType<typeof crearCasosUsoBeneficiarios>;
