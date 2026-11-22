import { defineConfig, mergeConfig } from 'vitest/config';
import vite from './vite.config.ts';

// DD-04 y DD-43: Vitest con jsdom, Testing Library y vitest-axe.
export default mergeConfig(
  vite,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['test/**/*.test.{ts,tsx}'],
      setupFiles: ['test/setup.ts'],
    },
  }),
);
