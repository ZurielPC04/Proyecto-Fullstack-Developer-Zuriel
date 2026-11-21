import express, { type Express } from 'express';
import type { Logger } from 'pino';
import type { Config } from './config/index.js';

/**
 * Dependencias de la raíz de composición (DD-08). T-API-04 agrega DataSource, Reloj y ProveedorOtp.
 */
export interface DependenciasApp {
  config: Config;
  logger: Logger;
}

/** Arma la app de Express. Todavía sin middlewares (T-API-03) ni rutas de negocio. */
export function crearApp({ config }: DependenciasApp): Express {
  const app = express();
  // §11: número de saltos de proxy confiables para req.ip.
  app.set('trust proxy', config.TRUST_PROXY);
  return app;
}
