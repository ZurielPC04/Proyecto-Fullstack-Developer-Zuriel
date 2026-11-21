import { defineConfig } from 'vitest/config';

// design.md §14.2: integración contra billetera_test. Las URLs son variables propias de las
// pruebas, no del esquema de configuración de la API (§2.4). Por defecto, la base local de
// docker/postgres/init.sql; en CI se fijan con las del service container (§14.5).
const PRUEBAS_DATABASE_URL =
  process.env['PRUEBAS_DATABASE_URL'] ??
  'postgresql://billetera_app:billetera_app_dev@127.0.0.1:5433/billetera_test';
const PRUEBAS_DATABASE_URL_MIGRACIONES =
  process.env['PRUEBAS_DATABASE_URL_MIGRACIONES'] ??
  'postgresql://billetera_owner:billetera_owner_dev@127.0.0.1:5433/billetera_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integracion/**/*.test.ts'],
    // Los archivos comparten la base y los advisory locks: en serie.
    fileParallelism: false,
    // lock_timeout (5 s) y statement_timeout (10 s) se prueban de verdad.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: { PRUEBAS_DATABASE_URL, PRUEBAS_DATABASE_URL_MIGRACIONES },
  },
});
