import type { Router } from 'express';
import type { DependenciasApp } from '../../app.js';
import { crearConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { contrasenasArgon2, type Contrasenas } from '../../plataforma/seguridad/contrasenas.js';
import { crearTokens } from '../../plataforma/seguridad/tokens.js';
import { generarClabeAleatoria, type GenerarClabe } from '../cuentas/cuentas.casos-uso.js';
import { crearTransferencias } from '../transferencias/transferencias.casos-uso.js';
import { crearCasosUsoIdentidad } from './identidad.casos-uso.js';
import { crearControladorIdentidad } from './identidad.controlador.js';
import { rutasIdentidad } from './identidad.rutas.js';

/** Puntos donde las pruebas inyectan sus dobles (DD-08). */
export interface OpcionesIdentidad {
  contrasenas?: Contrasenas;
  generarClabe?: GenerarClabe;
}

/** DD-08: composición del módulo identidad (casos de uso → controlador → rutas). */
export function crearModuloIdentidad(
  dependencias: DependenciasApp,
  opciones: OpcionesIdentidad = {},
): Router {
  const { config, dataSource, logger, reloj } = dependencias;
  const casos = crearCasosUsoIdentidad({
    conTransaccion: crearConTransaccion({ dataSource, logger }),
    contrasenas: opciones.contrasenas ?? contrasenasArgon2,
    transferencias: crearTransferencias({ reloj }),
    generarClabe: opciones.generarClabe ?? generarClabeAleatoria,
    tokens: crearTokens(config.JWT_SECRETO),
    reloj,
    logger,
    fondeoBienvenidaCentavos: config.FONDEO_BIENVENIDA_CENTAVOS,
  });
  return rutasIdentidad(crearControladorIdentidad(casos));
}
