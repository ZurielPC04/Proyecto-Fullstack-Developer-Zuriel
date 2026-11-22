import '../src/app/zod-es';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as matchersAxe from 'vitest-axe/matchers';

// DD-43: `expect(await axe(contenedor)).toHaveNoViolations()`.
expect.extend(matchersAxe);

// Vitest 5: los matchers propios se declaran en Matchers<R, T>, con la firma exacta de Vitest.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma debe repetir los parámetros de Vitest
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toHaveNoViolations(): R;
  }
}

afterEach(() => {
  cleanup();
});

// jsdom no implementa canvas: axe lo intenta para el contraste y jsdom avisa en cada prueba.
// Devolver null es lo mismo que hace jsdom, sin el aviso; el contraste AA lo fijan los tokens.
HTMLCanvasElement.prototype.getContext = () => null;
