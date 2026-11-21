import type { ConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import type { Contrasenas } from '../../plataforma/seguridad/contrasenas.js';
import { registrarEvento } from '../auditoria/auditoria.casos-uso.js';
import { crearCuentasDeUsuario, type GenerarClabe } from '../cuentas/cuentas.casos-uso.js';
import type { Transferencias } from '../transferencias/transferencias.casos-uso.js';
import { insertarUsuario } from './identidad.repositorio.js';

export interface DependenciasIdentidad {
  conTransaccion: ConTransaccion;
  contrasenas: Contrasenas;
  transferencias: Transferencias;
  generarClabe: GenerarClabe;
  /** D-20: 0 desactiva el fondeo de bienvenida. */
  fondeoBienvenidaCentavos: number;
}

export interface SolicitudRegistro {
  /** Ya normalizado por el esquema de shared (trim y minúsculas). */
  correo: string;
  contrasena: string;
}

export interface UsuarioRegistrado {
  id: string;
  correo: string;
}

export function crearCasosUsoIdentidad(dependencias: DependenciasIdentidad) {
  const { conTransaccion, contrasenas, transferencias, generarClabe, fondeoBienvenidaCentavos } =
    dependencias;

  return {
    /**
     * R-1.1 a R-1.3, §12.1: usuario, cuentas, fondeo de bienvenida y eventos en una sola
     * transacción. El hash se calcula antes, para no retener una conexión durante argon2.
     * No abre sesión (DD-24).
     */
    async registrar({ correo, contrasena }: SolicitudRegistro): Promise<UsuarioRegistrado> {
      const hash = await contrasenas.hash(contrasena);
      return conTransaccion(async (tx) => {
        // El INSERT deja bloqueado al usuario: el fondeo respeta el orden de D-12 (§12.1).
        const id = await insertarUsuario(tx, correo, hash);
        const { principalId, ahorroId } = await crearCuentasDeUsuario(tx, id, generarClabe);
        if (fondeoBienvenidaCentavos > 0) {
          await transferencias.fondear(
            tx,
            principalId,
            fondeoBienvenidaCentavos,
            'Depósito de bienvenida',
          );
        }
        await registrarEvento(tx, {
          tipo: 'usuario-registrado',
          usuarioId: id,
          datos: { cuentas: [principalId, ahorroId] },
        });
        return { id, correo };
      });
    },
  };
}

export type CasosUsoIdentidad = ReturnType<typeof crearCasosUsoIdentidad>;
