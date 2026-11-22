import { configDefaults, defineConfig } from 'vitest/config';

// design.md §14.2: integración contra billetera_test. Las URLs son variables propias de las
// pruebas, no del esquema de configuración de la API (§2.4). Por defecto, la base local de
// docker/postgres/init.sql; en CI se fijan con las del service container (§14.5).
const PRUEBAS_DATABASE_URL =
  process.env['PRUEBAS_DATABASE_URL'] ??
  'postgresql://billetera_app:billetera_app_dev@127.0.0.1:5433/billetera_test';
const PRUEBAS_DATABASE_URL_MIGRACIONES =
  process.env['PRUEBAS_DATABASE_URL_MIGRACIONES'] ??
  'postgresql://billetera_owner:billetera_owner_dev@127.0.0.1:5433/billetera_test';

// El globalSetup corre en este proceso: las URLs también tienen que estar aquí.
process.env['PRUEBAS_DATABASE_URL'] = PRUEBAS_DATABASE_URL;
process.env['PRUEBAS_DATABASE_URL_MIGRACIONES'] = PRUEBAS_DATABASE_URL_MIGRACIONES;

// Los casos que rompen invariantes a propósito solo corren como subproceso (T-API-09).
const FIXTURES = 'test/integracion/fixtures/**';
const modoFixture = process.env['PRUEBAS_FIXTURE'] === '1';

export default defineConfig({
  // Decoradores legacy de TypeORM también en test/, que no está en el include de tsconfig.json.
  oxc: { decorator: { legacy: true } },
  test: {
    environment: 'node',
    // §14.2: la concurrencia (T-API-21) usa la misma base, globalSetup e invariantes.
    include: modoFixture
      ? [`${FIXTURES}/*.test.ts`]
      : ['test/integracion/**/*.test.ts', 'test/concurrencia/**/*.test.ts'],
    exclude: modoFixture ? [...configDefaults.exclude] : [...configDefaults.exclude, FIXTURES],
    globalSetup: ['test/integracion/apoyo/global-setup.ts'],
    setupFiles: ['test/integracion/apoyo/por-archivo.ts'],
    // Procesos (el valor por defecto): si un worker aborta por código nativo, muere solo ese
    // proceso y Vitest informa en qué archivo ocurrió. Con hilos, el aborto se lleva el
    // proceso principal y el reporte; tampoco dio más estabilidad (RNF-23).
    pool: 'forks',
    // Los archivos comparten la base y los advisory locks: en serie.
    fileParallelism: false,
    // lock_timeout (5 s) y statement_timeout (10 s) se prueban de verdad.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: { PRUEBAS_DATABASE_URL, PRUEBAS_DATABASE_URL_MIGRACIONES },
  },
});
