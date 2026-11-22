import type { Express } from 'express';
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import { crearApp } from './app.js';
import { cargarConfiguracion, type Config } from './config/index.js';
import { crearModulos } from './modulos/index.js';
import { elegirProveedorOtp } from './plataforma/otp/index.js';
import { RelojBaseDatos } from './plataforma/reloj/index.js';

/** Lo que deja `conectarBase` una vez que la base contestó. */
export interface RecursosBase {
  dataSource: DataSource;
  /** §10.3: la usa GET /api/health. */
  verificarBase: () => Promise<void>;
}

export interface DependenciasArranque {
  env: Record<string, string | undefined>;
  logger: Logger;
  /** Recibe `process` en main.ts; las pruebas pasan un objeto propio. */
  proceso: { exitCode?: number | string | null | undefined };
  /** Crea e inicializa el DataSource con la configuración ya validada. */
  conectarBase: (config: Config) => Promise<RecursosBase>;
  escuchar: (app: Express, puerto: number) => Promise<unknown>;
}

/** design.md §2.4: configuración → base de datos → módulos listos → listen. */
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
  const { dataSource, verificarBase } = await conectarBase(config);
  // DD-08: la composición vive aquí y en crearModulos, en un solo lugar.
  const dependenciasApp = {
    config,
    logger,
    verificarBase,
    dataSource,
    reloj: new RelojBaseDatos(),
    proveedorOtp: elegirProveedorOtp(config),
  };
  // R-1.7: los módulos quedan listos (hash ficticio calculado) antes de listen.
  const modulos = await crearModulos(dependenciasApp);
  await escuchar(crearApp(dependenciasApp, modulos), config.PORT);
}
