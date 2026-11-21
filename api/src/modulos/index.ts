import type { Router } from 'express';
import type { DependenciasApp } from '../app.js';

/**
 * DD-08: la composición de los routers de negocio vive aquí, en un solo lugar.
 * Cada tarea de módulo agrega el suyo (identidad, cuentas, beneficiarios…).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- la usan los routers que agreguen las tareas de módulo.
export function crearModulos(dependencias: DependenciasApp): Router[] {
  return [];
}
