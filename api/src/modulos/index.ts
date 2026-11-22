import type { Router } from 'express';
import type { DependenciasApp } from '../app.js';
import { crearModuloBeneficiarios } from './beneficiarios/index.js';
import { crearModuloCuentas } from './cuentas/index.js';
import { crearModuloIdentidad } from './identidad/index.js';

/**
 * DD-08: la composición de los routers de negocio vive aquí, en un solo lugar.
 * Cada tarea de módulo agrega el suyo (identidad, cuentas, beneficiarios…).
 * Asíncrona: resuelve cuando los módulos están listos para atender (el hash ficticio de
 * identidad, R-1.7); quien la llama la espera antes de abrir el puerto.
 */
export async function crearModulos(dependencias: DependenciasApp): Promise<Router[]> {
  return [
    await crearModuloIdentidad(dependencias),
    crearModuloCuentas(dependencias),
    crearModuloBeneficiarios(dependencias),
  ];
}
