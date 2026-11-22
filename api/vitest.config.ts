import { configDefaults, defineConfig } from 'vitest/config';

// Unitarias: corren sin base de datos (design.md §14.2). La integración tiene su propia
// configuración (vitest.integracion.config.ts), que también corre la concurrencia (T-API-21).
export default defineConfig({
  // Decoradores legacy de TypeORM también en test/, que no está en el include de tsconfig.json.
  oxc: { decorator: { legacy: true } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/integracion/**', 'test/concurrencia/**'],
  },
});
