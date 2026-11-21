// Conexiones de las pruebas de integración (design.md §14.2). Las URLs las fija
// vitest.integracion.config.ts; no pasan por el esquema de configuración de la API.
import type { DataSource } from 'typeorm';
import { crearDataSource } from '../../../src/plataforma/db/data-source.js';

function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor)
    throw new Error(`Falta ${nombre}: corre las pruebas con npm run test:integracion -w api`);
  return valor;
}

/** Rol billetera_app, como la API en producción. */
export const urlApp = () => variable('PRUEBAS_DATABASE_URL');
/** Rol billetera_owner, como migrar.ts. */
export const urlDueno = () => variable('PRUEBAS_DATABASE_URL_MIGRACIONES');

export async function abrirDataSource(url = urlApp(), poolMax = 5): Promise<DataSource> {
  const dataSource = crearDataSource({ url, poolMax });
  await dataSource.initialize();
  return dataSource;
}
