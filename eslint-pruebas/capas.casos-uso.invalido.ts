// Importaciones prohibidas a propósito (DD-08, design.md §2.1). Lo revisa
// `npm run lint:verificar-reglas` como si fuera `api/src/modulos/cuentas/cuentas.casos-uso.ts`.
// Un caso de uso no importa `express` ni conoce rutas ni controladores.
import type { Request } from 'express'; // espera: no-restricted-imports
import { rutasCuentas } from './cuentas.rutas.js'; // espera: no-restricted-imports
import { controladorCuentas } from './cuentas.controlador.js'; // espera: no-restricted-imports

import { buscarCuentas } from './cuentas.repositorio.js'; // válido
import { clasificar } from './cuentas.dominio.js'; // válido
import type { EntityManager } from 'typeorm'; // válido

export type Usados = [Request, EntityManager];
export const usados = [rutasCuentas, controladorCuentas, buscarCuentas, clasificar];
