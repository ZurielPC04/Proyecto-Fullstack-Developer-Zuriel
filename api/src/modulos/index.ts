import type { Router } from 'express';
import type { DependenciasApp } from '../app.js';
import { crearModuloBeneficiarios } from './beneficiarios/index.js';
import { crearModuloCuentas } from './cuentas/index.js';
import { crearModuloIdentidad } from './identidad/index.js';

/**
 * DD-08: la composición de los routers de negocio vive aquí, en un solo lugar.
 * Cada tarea de módulo agrega el suyo (identidad, cuentas, beneficiarios…).
 */
export function crearModulos(dependencias: DependenciasApp): Router[] {
  return [
    crearModuloIdentidad(dependencias),
    crearModuloCuentas(dependencias),
    crearModuloBeneficiarios(dependencias),
  ];
}
