import type { Router } from 'express';
import type { DependenciasApp } from '../../app.js';
import { crearConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { crearAutenticar } from '../../plataforma/http/autenticar.js';
import { crearConsultasMovimientos } from './movimientos.casos-uso.js';
import { crearControladorMovimientos } from './movimientos.controlador.js';
import { rutasMovimientos } from './movimientos.rutas.js';

/** DD-08: composición del módulo movimientos (consultas → controlador → rutas). */
export function crearModuloMovimientos(dependencias: DependenciasApp): Router {
  const { config, dataSource, logger } = dependencias;
  const consultas = crearConsultasMovimientos({
    conTransaccion: crearConTransaccion({ dataSource, logger }),
  });
  return rutasMovimientos(crearControladorMovimientos(consultas), crearAutenticar(config));
}
