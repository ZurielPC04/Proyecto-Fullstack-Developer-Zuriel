import type { Router } from 'express';
import type { DependenciasApp } from '../../app.js';
import { crearConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { crearAutenticar } from '../../plataforma/http/autenticar.js';
import { crearCasosUsoTransferencias } from './transferencias.casos-uso.js';
import { crearControladorTransferencias } from './transferencias.controlador.js';
import { rutasTransferencias } from './transferencias.rutas.js';

/** DD-08: composición del módulo transferencias (casos de uso → controlador → rutas). */
export function crearModuloTransferencias(dependencias: DependenciasApp): Router {
  const { config, dataSource, logger, reloj } = dependencias;
  const casos = crearCasosUsoTransferencias({
    conTransaccion: crearConTransaccion({ dataSource, logger }),
    reloj,
  });
  return rutasTransferencias(crearControladorTransferencias(casos), crearAutenticar(config));
}
