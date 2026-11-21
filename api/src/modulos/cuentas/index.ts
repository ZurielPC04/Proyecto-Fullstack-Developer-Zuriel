import type { Router } from 'express';
import type { DependenciasApp } from '../../app.js';
import { crearConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { crearAutenticar } from '../../plataforma/http/autenticar.js';
import { crearConsultasCuentas } from './cuentas.casos-uso.js';
import { crearControladorCuentas } from './cuentas.controlador.js';
import { rutasCuentas } from './cuentas.rutas.js';

/** DD-08: composición del módulo cuentas (consultas → controlador → rutas). */
export function crearModuloCuentas(dependencias: DependenciasApp): Router {
  const { config, dataSource, logger } = dependencias;
  const consultas = crearConsultasCuentas({
    conTransaccion: crearConTransaccion({ dataSource, logger }),
  });
  return rutasCuentas(crearControladorCuentas(consultas), crearAutenticar(config));
}
