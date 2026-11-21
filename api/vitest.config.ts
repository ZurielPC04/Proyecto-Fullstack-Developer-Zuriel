import { configDefaults, defineConfig } from 'vitest/config';

// Unitarias: corren sin base de datos (design.md §14.2). La integración tiene su propia
// configuración (vitest.integracion.config.ts) y la concurrencia llegará con T-API-21.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/integracion/**', 'test/concurrencia/**'],
  },
});
