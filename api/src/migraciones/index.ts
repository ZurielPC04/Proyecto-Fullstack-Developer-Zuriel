import type { MigrationInterface } from 'typeorm';
import { Base1000000000001 } from './0001-base.js';
import { Beneficiario1000000000002 } from './0002-beneficiario.js';
import { TransferenciaAsiento1000000000003 } from './0003-transferencia-asiento.js';
import { Sesion1000000000004 } from './0004-sesion.js';
import { Auditoria1000000000005 } from './0005-auditoria.js';
import { Permisos1000000000006 } from './0006-permisos.js';

/**
 * design.md §3.5 y DD-05: lista explícita de migraciones, en orden, nunca un glob.
 */
export const migraciones: (new () => MigrationInterface)[] = [
  Base1000000000001,
  Beneficiario1000000000002,
  TransferenciaAsiento1000000000003,
  Sesion1000000000004,
  Auditoria1000000000005,
  Permisos1000000000006,
];
