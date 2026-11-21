import { describe, expect, it } from 'vitest';
import { crearDataSource } from '../../../src/plataforma/db/data-source.js';
import { urlApp } from '../apoyo/base.js';

// DD-05 y §3.5: migraciones (y entidades, cuando existan) como listas explícitas de clases,
// nunca un glob. TypeORM solo usa `glob` (y su minimatch con avisos de npm audit) cuando
// recibe patrones de texto; esta prueba garantiza que nunca se los pasamos.
// Revisa un DataSource sin inicializar: con un patrón, initialize() ya intentaría cargarlo.
describe('crearDataSource: listas explícitas', () => {
  it.each(['migrations', 'entities', 'subscribers'] as const)(
    'DD-05: options.%s contiene solo clases o funciones, nunca textos ni patrones',
    (opcion) => {
      const lista: unknown = crearDataSource({ url: urlApp(), poolMax: 1 }).options[opcion];
      if (lista === undefined) return;
      expect(typeof lista).not.toBe('string');
      const elementos = Array.isArray(lista) ? lista : Object.values(lista as object);
      for (const elemento of elementos) expect(typeof elemento).toBe('function');
    },
  );
});
