import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import type { Config } from './config/index.js';
import type { ProveedorOtp } from './plataforma/otp/index.js';
import type { Reloj } from './plataforma/reloj/index.js';
import { rutasDocumentacion } from './plataforma/http/documentacion.js';
import { manejadorErrores, noEncontrado } from './plataforma/http/manejador-errores.js';
import { requestId } from './plataforma/http/request-id.js';
import { rutasSalud } from './plataforma/http/salud.js';
import { logPeticiones } from './plataforma/logging/log-peticiones.js';

/** Dependencias de la raíz de composición (DD-08); las pruebas pasan sus dobles. */
export interface DependenciasApp {
  config: Config;
  logger: Logger;
  /** §10.3: resuelve si la base contesta (SELECT 1 con timeout corto). */
  verificarBase: () => Promise<void>;
  /** Para `conTransaccion` y los repositorios de los módulos (§2.3). */
  dataSource: DataSource;
  reloj: Reloj;
  proveedorOtp: ProveedorOtp;
}

/**
 * Arma la app con los middlewares de §2.2. `modulos` son los routers de negocio: los reales
 * salen de `crearModulos` y las pruebas inyectan los suyos (DD-08).
 */
export function crearApp(dependencias: DependenciasApp, modulos: Router[]): Express {
  const { config, logger } = dependencias;
  const app = express();
  // §11: número de saltos de proxy confiables para req.ip.
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(requestId()); // 1
  app.use(logPeticiones(logger)); // 2
  // Fuera de producción se quita upgrade-insecure-requests: en http://localhost haría que el
  // navegador pidiera los recursos de Swagger UI por https y no cargaran. En producción, intacta.
  const csp: Record<string, null> =
    config.NODE_ENV === 'production' ? {} : { upgradeInsecureRequests: null };
  app.use(helmet({ contentSecurityPolicy: { directives: csp } })); // 3
  // Con un arreglo, cors solo responde Access-Control-Allow-Origin si el origen coincide.
  app.use(cors({ origin: [config.WEB_ORIGIN], credentials: true })); // 4
  // RNF-01: cuerpos acotados; mal formado o demasiado grande → 400 validation-error (DD-35).
  app.use(express.json({ limit: '16kb', strict: true })); // 5
  app.use(cookieParser()); // 6
  app.use('/api', rutasSalud(dependencias.verificarBase)); // 7
  // DD-27: la documentación no existe en producción.
  if (config.NODE_ENV !== 'production') app.use('/api', rutasDocumentacion()); // 7
  for (const modulo of modulos) app.use('/api', modulo); // 10
  app.use(noEncontrado()); // 12
  app.use(manejadorErrores(logger)); // 13
  return app;
}
