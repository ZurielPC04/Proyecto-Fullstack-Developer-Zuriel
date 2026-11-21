// App real contra billetera_test (design.md §14.2): DataSource del rol billetera_app, logger
// capturado en memoria y los módulos reales armados con crearModulos, salvo que la prueba
// pase sus propios routers (DD-08).
import type { Router } from 'express';
import type { DataSource } from 'typeorm';
import { crearApp, type DependenciasApp } from '../../../src/app.js';
import type { Config } from '../../../src/config/index.js';
import { crearModulos } from '../../../src/modulos/index.js';
import { crearLogger } from '../../../src/plataforma/logging/logger.js';
import { ProveedorOtpSimulado } from '../../../src/plataforma/otp/index.js';
import { RelojBaseDatos, type Reloj } from '../../../src/plataforma/reloj/index.js';
import { configDePrueba } from '../../apoyo/app.js';

export interface OpcionesAppReal {
  config?: Partial<Config>;
  reloj?: Reloj;
  /** Si se pasa, reemplaza a crearModulos: recibe las dependencias ya armadas. */
  modulos?: (dependencias: DependenciasApp) => Router[];
}

export function appReal(dataSource: DataSource, opciones: OpcionesAppReal = {}) {
  const lineas: string[] = [];
  const dependencias: DependenciasApp = {
    config: configDePrueba(opciones.config),
    logger: crearLogger({ nivel: 'info', destino: { write: (l: string) => void lineas.push(l) } }),
    verificarBase: async () => {},
    dataSource,
    reloj: opciones.reloj ?? new RelojBaseDatos(),
    proveedorOtp: new ProveedorOtpSimulado(),
  };
  const modulos = (opciones.modulos ?? crearModulos)(dependencias);
  return { app: crearApp(dependencias, modulos), dependencias, salidaLog: () => lineas.join('') };
}
