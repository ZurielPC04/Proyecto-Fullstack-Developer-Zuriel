import type { Router } from 'express';
import type { DependenciasApp } from '../../app.js';
import { crearConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { crearAutenticar } from '../../plataforma/http/autenticar.js';
import { crearConsultasLimites } from './limites.casos-uso.js';
import { crearControladorLimites } from './limites.controlador.js';
import { rutasLimites } from './limites.rutas.js';

/** DD-08: composición del módulo límites (consultas → controlador → rutas). */
export function crearModuloLimites(dependencias: DependenciasApp): Router {
  const { config, dataSource, logger, reloj } = dependencias;
  const consultas = crearConsultasLimites({
    conTransaccion: crearConTransaccion({ dataSource, logger }),
    reloj,
    limiteCentavos: config.LIMITE_DIARIO_CENTAVOS,
  });
  return rutasLimites(crearControladorLimites(consultas), crearAutenticar(config));
}
