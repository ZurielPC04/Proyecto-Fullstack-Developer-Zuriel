// El catálogo de shared y el enum TipoProblema de openapi.yaml deben ser el mismo
// conjunto (DD-23, DD-27). `expectTypeOf` lo verifica el compilador en `npm run typecheck`.
import { describe, expectTypeOf, it } from 'vitest';
import type { TipoProblema } from '../src/api/openapi.js';
import { TIPOS_PROBLEMA } from '../src/problemas.js';

describe('TIPOS_PROBLEMA', () => {
  it('RNF-18 DD-23 DD-27 coincide con el TipoProblema generado de openapi.yaml', () => {
    expectTypeOf<(typeof TIPOS_PROBLEMA)[number]>().toEqualTypeOf<TipoProblema>();
  });
});
