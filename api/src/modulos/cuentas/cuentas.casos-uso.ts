import { randomInt } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { clabeDeUsuario } from './cuentas.dominio.js';
import { insertarCuentaSiClabeLibre } from './cuentas.repositorio.js';

/** Fuente de CLABEs; las pruebas la sustituyen para forzar colisiones (DD-19). */
export type GenerarClabe = () => string;

/** DD-19: 11 dígitos de `crypto.randomInt`, nunca un consecutivo. */
export const generarClabeAleatoria: GenerarClabe = () => {
  let cuenta = '';
  for (let i = 0; i < 11; i++) cuenta += String(randomInt(0, 10));
  return clabeDeUsuario(cuenta);
};

const INTENTOS_CLABE = 5;

export interface CuentasCreadas {
  principalId: string;
  ahorroId: string;
}

async function crearCuenta(
  tx: EntityManager,
  usuarioId: string,
  nombre: 'Principal' | 'Ahorro',
  generarClabe: GenerarClabe,
): Promise<string> {
  for (let intento = 1; intento <= INTENTOS_CLABE; intento++) {
    const id = await insertarCuentaSiClabeLibre(tx, { usuarioId, nombre, clabe: generarClabe() });
    if (id !== undefined) return id;
  }
  // DD-19: con 10^11 combinaciones no debería pasar; si pasa, 500 y el registro se revierte.
  throw new Error(`No se encontró una CLABE libre en ${INTENTOS_CLABE} intentos`);
}

/** D-20 y R-1.1: Principal y Ahorro en saldo 0, dentro de la transacción del registro. */
export async function crearCuentasDeUsuario(
  tx: EntityManager,
  usuarioId: string,
  generarClabe: GenerarClabe = generarClabeAleatoria,
): Promise<CuentasCreadas> {
  const principalId = await crearCuenta(tx, usuarioId, 'Principal', generarClabe);
  const ahorroId = await crearCuenta(tx, usuarioId, 'Ahorro', generarClabe);
  return { principalId, ahorroId };
}
