import type { Router } from 'express';
import type { DependenciasApp } from '../../app.js';
import { crearConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { crearAutenticar } from '../../plataforma/http/autenticar.js';
import { demoLatencia } from '../../plataforma/http/demo-latencia.js';
import { crearCasosUsoTransferencias } from './transferencias.casos-uso.js';
import { crearControladorTransferencias } from './transferencias.controlador.js';
import { rutasTransferencias } from './transferencias.rutas.js';

/** DD-08: composición del módulo transferencias (casos de uso → controlador → rutas). */
export function crearModuloTransferencias(dependencias: DependenciasApp): Router {
  const { config, dataSource, logger, reloj, proveedorOtp } = dependencias;
  const casos = crearCasosUsoTransferencias({
    conTransaccion: crearConTransaccion({ dataSource, logger }),
    reloj,
    logger,
    proveedorOtp,
    limiteCentavos: config.LIMITE_DIARIO_CENTAVOS,
    umbralCentavos: config.UMBRAL_CODIGO_CENTAVOS,
    secretoOtp: config.OTP_HMAC_SECRETO,
  });
  return rutasTransferencias(
    crearControladorTransferencias(casos),
    crearAutenticar(config),
    demoLatencia(config.DEMO_LATENCIA_MS),
  );
}
