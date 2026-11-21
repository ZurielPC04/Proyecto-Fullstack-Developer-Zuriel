// setupFiles de la integración (design.md §14.2, DD-46). Por archivo: vacía las tablas de
// datos conservando Fondeo. Después de cada prueba: las tres invariantes, como dueño.
// Vitest corre los hooks en pila: este beforeAll va antes que el del archivo y este
// afterEach, después de los del archivo.
import { afterEach, beforeAll } from 'vitest';
import { truncar, verificarInvariantes } from './limpieza.js';

beforeAll(async () => {
  await truncar();
});

afterEach(async () => {
  await verificarInvariantes();
});
