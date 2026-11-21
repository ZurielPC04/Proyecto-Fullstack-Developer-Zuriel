import { describe, expect, it } from 'vitest';
import { exigirBaseDePruebas } from '../apoyo/guarda-base-pruebas.js';

const CLAVE = 'clave-que-no-debe-salir';

describe('exigirBaseDePruebas', () => {
  it.each([
    `postgresql://billetera_owner:${CLAVE}@127.0.0.1:5433/billetera_test`,
    `postgres://billetera_app:${CLAVE}@localhost:5432/billetera_test?sslmode=disable`,
  ])('RNF-23: acepta una URL cuya base es exactamente billetera_test (%#)', (url) => {
    expect(() => exigirBaseDePruebas(url)).not.toThrow();
  });

  it.each([
    ['la base de desarrollo', `postgresql://billetera_owner:${CLAVE}@127.0.0.1:5433/billetera`],
    ['un nombre parecido', `postgresql://billetera_owner:${CLAVE}@127.0.0.1:5433/billetera_test2`],
    ['mayúsculas', `postgresql://billetera_owner:${CLAVE}@127.0.0.1:5433/Billetera_Test`],
    ['otra ruta', `postgresql://billetera_owner:${CLAVE}@127.0.0.1:5433/billetera_test/x`],
    ['sin base', `postgresql://billetera_owner:${CLAVE}@127.0.0.1:5433`],
    ['un texto que no es URL', 'billetera_test'],
    ['vacío', ''],
  ])('RNF-23: se niega con %s y su mensaje no trae la contraseña', (_caso, url) => {
    let error: unknown;
    try {
      exigirBaseDePruebas(url);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('billetera_test');
    expect((error as Error).message).not.toContain(CLAVE);
  });
});
