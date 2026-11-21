import type { Router } from 'express';
import type { DependenciasApp } from '../../app.js';
import { crearConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { crearAutenticar } from '../../plataforma/http/autenticar.js';
import { crearCasosUsoBeneficiarios } from './beneficiarios.casos-uso.js';
import { crearControladorBeneficiarios } from './beneficiarios.controlador.js';
import { rutasBeneficiarios } from './beneficiarios.rutas.js';

/** DD-08: composición del módulo beneficiarios (casos de uso → controlador → rutas). */
export function crearModuloBeneficiarios(dependencias: DependenciasApp): Router {
  const { config, dataSource, logger } = dependencias;
  const casos = crearCasosUsoBeneficiarios({
    conTransaccion: crearConTransaccion({ dataSource, logger }),
  });
  return rutasBeneficiarios(crearControladorBeneficiarios(casos), crearAutenticar(config));
}
