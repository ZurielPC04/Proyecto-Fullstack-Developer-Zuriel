import { Router } from 'express';
import { Reintentable } from './errores.js';

/** design.md §10.3: 200 si la base contesta; 503 retryable si no, sin importar la causa. */
export function rutasSalud(verificarBase: () => Promise<void>): Router {
  return Router().get('/health', async (_req, res) => {
    try {
      await verificarBase();
    } catch (causa) {
      throw new Reintentable({ cause: causa });
    }
    res.json({ estado: 'ok' });
  });
}
