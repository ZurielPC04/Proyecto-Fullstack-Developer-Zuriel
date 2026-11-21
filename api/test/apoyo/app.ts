// Arma la app real con dobles de sus dependencias (DD-08), sin base de datos ni puertos.
import type { Router } from 'express';
import type { DataSource } from 'typeorm';
import { crearApp } from '../../src/app.js';
import type { Config } from '../../src/config/index.js';
import { crearLogger } from '../../src/plataforma/logging/logger.js';
import { ProveedorOtpSimulado } from '../../src/plataforma/otp/index.js';
import { RelojFijo } from '../../src/plataforma/reloj/index.js';

export const WEB_ORIGIN = 'http://localhost:5173';

export function configDePrueba(cambios: Partial<Config> = {}): Config {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://billetera_app:clave@localhost:5433/billetera_test',
    DB_POOL_MAX: 10,
    JWT_SECRETO: 'j'.repeat(32),
    OTP_HMAC_SECRETO: 'o'.repeat(32),
    LIMITE_DIARIO_CENTAVOS: 5_000_000,
    UMBRAL_CODIGO_CENTAVOS: 1_000_000,
    FONDEO_BIENVENIDA_CENTAVOS: 0,
    OTP_SIMULADO: true,
    DEMO_LATENCIA_MS: 0,
    WEB_ORIGIN,
    LOG_LEVEL: 'info',
    TRUST_PROXY: 0,
    ...cambios,
  };
}

export interface OpcionesAppDePrueba {
  config?: Partial<Config>;
  verificarBase?: () => Promise<void>;
  modulos?: Router[];
}

/** Devuelve la app y la salida cruda del logger, para buscar fugas en el texto. */
export function appDePrueba({ config, verificarBase, modulos = [] }: OpcionesAppDePrueba = {}) {
  const lineas: string[] = [];
  const logger = crearLogger({
    nivel: 'info',
    destino: { write: (l: string) => void lineas.push(l) },
  });
  const app = crearApp(
    {
      config: configDePrueba(config),
      logger,
      verificarBase: verificarBase ?? (async () => {}),
      // Sin base: ningún router de estas pruebas usa el DataSource.
      dataSource: {} as DataSource,
      reloj: new RelojFijo('2026-11-14 16:05:09.123456+00'),
      proveedorOtp: new ProveedorOtpSimulado(),
    },
    modulos,
  );
  return {
    app,
    salidaLog: () => lineas.join(''),
    registros: () => lineas.map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}
