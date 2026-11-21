import type { Express } from 'express';
import type { Logger } from 'pino';
import { crearApp } from './app.js';
import { cargarConfiguracion, type Config } from './config/index.js';

export interface DependenciasArranque {
  env: Record<string, string | undefined>;
  logger: Logger;
  /** Recibe `process` en main.ts; las pruebas pasan un objeto propio. */
  proceso: { exitCode?: number | string | null | undefined };
  conectarBase: (config: Config) => Promise<void>;
  escuchar: (app: Express, puerto: number) => Promise<unknown>;
}

/** design.md §2.4: configuración → base de datos → listen. */
export async function arrancar(dependencias: DependenciasArranque): Promise<void> {
  const { env, logger, proceso, conectarBase, escuchar } = dependencias;

  const resultado = cargarConfiguracion(env);
  if (!resultado.ok) {
    // RNF-15: solo los nombres, nunca los valores; y antes de abrir el puerto.
    logger.error({ variablesInvalidas: resultado.variablesInvalidas }, 'configuración inválida');
    proceso.exitCode = 1;
    return;
  }

  const { config } = resultado;
  logger.level = config.LOG_LEVEL;
  await conectarBase(config);
  await escuchar(crearApp({ config, logger }), config.PORT);
}
