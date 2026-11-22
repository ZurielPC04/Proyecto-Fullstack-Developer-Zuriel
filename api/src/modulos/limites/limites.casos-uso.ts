import type { ConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import type { Reloj } from '../../plataforma/reloj/index.js';
import { consumidoDelDia, ventanaDelDia } from './limites.repositorio.js';

export interface LimitesDelDia {
  limiteCentavos: number;
  consumidoCentavos: number;
  disponibleCentavos: number;
  /** `AAAA-MM-DD` en America/Mexico_City. */
  dia: string;
  /** Texto de timestamptz del inicio del día siguiente (DD-07). */
  reiniciaEn: string;
}

export interface DependenciasLimites {
  conTransaccion: ConTransaccion;
  reloj: Reloj;
  limiteCentavos: number;
}

/** R-6.7: todo se calcula en la API, para que web y móvil no lo recalculen. */
export function crearConsultasLimites({
  conTransaccion,
  reloj,
  limiteCentavos,
}: DependenciasLimites) {
  return {
    obtener(usuarioId: string): Promise<LimitesDelDia> {
      return conTransaccion(async (tx) => {
        const ahora = await reloj.ahora(tx);
        const consumido = await consumidoDelDia(tx, usuarioId, ahora);
        const { dia, reiniciaEn } = await ventanaDelDia(tx, ahora);
        return {
          limiteCentavos,
          consumidoCentavos: consumido,
          // §6.4: max(0, límite − consumido); entero menos entero, sin redondeo (D-18).
          disponibleCentavos: Math.max(0, limiteCentavos - consumido),
          dia,
          reiniciaEn,
        };
      });
    },
  };
}

export type ConsultasLimites = ReturnType<typeof crearConsultasLimites>;
