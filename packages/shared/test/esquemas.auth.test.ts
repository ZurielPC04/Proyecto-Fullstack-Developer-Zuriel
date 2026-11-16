import { describe, expect, it } from 'vitest';
import { esquemaLogin, esquemaRefresh, esquemaRegistro } from '../src/esquemas/auth.js';
import { CONTRASENAS_COMUNES } from '../src/esquemas/contrasenas-comunes.js';

// Code points explícitos: Prettier convierte los escapes \u en caracteres y las dos é se ven iguales.
const ACENTO = String.fromCodePoint(0x0301);
const E_PRECOMPUESTA = String.fromCodePoint(0x00e9);

const CONTRASENA = 'caballo bateria grapa';

function rutas(resultado: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return resultado.error?.issues.map((i) => i.path.join('.')) ?? [];
}

describe('lista de contraseñas comunes', () => {
  it('DD-28 tiene exactamente 1,000 entradas', () => {
    expect(CONTRASENAS_COMUNES).toHaveLength(1000);
  });

  it('DD-28 todas tienen 12 o más code points', () => {
    const cortas = CONTRASENAS_COMUNES.filter((c) => [...c].length < 12);
    expect(cortas).toEqual([]);
  });

  it('DD-28 todas son distintas', () => {
    expect(new Set(CONTRASENAS_COMUNES).size).toBe(CONTRASENAS_COMUNES.length);
  });

  it('DD-28 todas están ya en NFC y minúsculas', () => {
    const sinNormalizar = CONTRASENAS_COMUNES.filter((c) => c !== c.normalize('NFC').toLowerCase());
    expect(sinNormalizar).toEqual([]);
  });
});

describe('esquemaRegistro', () => {
  const valido = { correo: 'ana@x.mx', contrasena: CONTRASENA };

  it('R-1.5 acepta un registro válido', () => {
    expect(esquemaRegistro.parse(valido)).toEqual(valido);
  });

  it('RNF-01 rechaza un campo desconocido', () => {
    const r = esquemaRegistro.safeParse({ ...valido, nombre: 'Ana' });
    expect(r.success).toBe(false);
  });

  describe('correo', () => {
    it('R-1.5 DD-16 recorta y pasa a minúsculas', () => {
      const r = esquemaRegistro.parse({ ...valido, correo: '  Ana.Martinez@X.MX ' });
      expect(r.correo).toBe('ana.martinez@x.mx');
    });

    it('R-1.5 rechaza un correo sin formato de email', () => {
      const r = esquemaRegistro.safeParse({ ...valido, correo: 'ana.x.mx' });
      expect(rutas(r)).toContain('correo');
    });

    it('R-1.5 DD-16 rechaza un correo de menos de 3 caracteres', () => {
      const r = esquemaRegistro.safeParse({ ...valido, correo: 'a@' });
      expect(rutas(r)).toContain('correo');
    });

    // 64 + 1 + 189 = 254 caracteres; con una "d" más son 255.
    const dominio = (d: number) => `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(d)}.mx`;

    it('R-1.5 DD-16 acepta un correo de 254 caracteres', () => {
      const correo = `${'a'.repeat(64)}@${dominio(58)}`;
      expect(correo).toHaveLength(254);
      expect(esquemaRegistro.safeParse({ ...valido, correo }).success).toBe(true);
    });

    it('R-1.5 DD-16 rechaza un correo de 255 caracteres', () => {
      const correo = `${'a'.repeat(64)}@${dominio(59)}`;
      expect(correo).toHaveLength(255);
      expect(rutas(esquemaRegistro.safeParse({ ...valido, correo }))).toContain('correo');
    });
  });

  describe('contrasena', () => {
    it('R-1.5 DD-28 acepta 12 caracteres y rechaza 11', () => {
      expect(
        esquemaRegistro.safeParse({ ...valido, contrasena: 'x'.repeat(11) + 'y' }).success,
      ).toBe(true);
      const r = esquemaRegistro.safeParse({ ...valido, contrasena: 'x'.repeat(10) + 'y' });
      expect(rutas(r)).toEqual(['contrasena']);
    });

    it('R-1.5 DD-28 acepta 128 caracteres y rechaza 129', () => {
      expect(
        esquemaRegistro.safeParse({ ...valido, contrasena: 'x'.repeat(127) + 'y' }).success,
      ).toBe(true);
      const r = esquemaRegistro.safeParse({ ...valido, contrasena: 'x'.repeat(128) + 'y' });
      expect(rutas(r)).toEqual(['contrasena']);
    });

    it('R-1.5 DD-28 mide la longitud después de NFC', () => {
      // 128 é compuestas son 256 code points antes de NFC y 128 después.
      const compuesta = `e${ACENTO}`.repeat(128);
      const r = esquemaRegistro.parse({ ...valido, contrasena: compuesta });
      expect(r.contrasena).toBe(E_PRECOMPUESTA.repeat(128));
    });

    it('R-1.5 DD-28 é compuesta y precompuesta dan la misma salida', () => {
      const compuesta = esquemaRegistro.parse({ ...valido, contrasena: `cafe${ACENTO} con leche` });
      const precompuesta = esquemaRegistro.parse({
        ...valido,
        contrasena: `caf${E_PRECOMPUESTA} con leche`,
      });
      expect(compuesta.contrasena).toBe(precompuesta.contrasena);
    });

    it('R-1.5 DD-28 no recorta los espacios', () => {
      const r = esquemaRegistro.parse({ ...valido, contrasena: `  ${CONTRASENA}  ` });
      expect(r.contrasena).toBe(`  ${CONTRASENA}  `);
    });

    describe('igual al correo o a su parte local', () => {
      const correo = 'anamartinez2026@x.mx';

      it('R-1.5 DD-28 rechaza la contraseña igual al correo, sin distinguir mayúsculas', () => {
        const r = esquemaRegistro.safeParse({ correo, contrasena: 'AnaMartinez2026@X.mx' });
        expect(rutas(r)).toEqual(['contrasena']);
      });

      it('R-1.5 DD-28 rechaza la contraseña igual a la parte local, sin distinguir mayúsculas', () => {
        const r = esquemaRegistro.safeParse({ correo, contrasena: 'ANAMARTINEZ2026' });
        expect(rutas(r)).toEqual(['contrasena']);
      });

      it('R-1.5 DD-28 acepta una contraseña que solo se parece a la parte local', () => {
        expect(esquemaRegistro.safeParse({ correo, contrasena: 'anamartinez2026!' }).success).toBe(
          true,
        );
      });
    });

    it('R-1.5 DD-28 rechaza una contraseña de la lista escrita en mayúsculas', () => {
      const comun = CONTRASENAS_COMUNES[0]!.toUpperCase();
      const r = esquemaRegistro.safeParse({ ...valido, contrasena: comun });
      expect(rutas(r)).toEqual(['contrasena']);
    });
  });
});

describe('esquemaLogin', () => {
  const valido = { correo: 'ana@x.mx', contrasena: 'x', cliente: 'web' as const };

  it('DD-24 acepta web y movil', () => {
    expect(esquemaLogin.parse(valido)).toEqual(valido);
    expect(esquemaLogin.parse({ ...valido, cliente: 'movil' }).cliente).toBe('movil');
  });

  it('RNF-01 DD-24 rechaza otro cliente', () => {
    expect(rutas(esquemaLogin.safeParse({ ...valido, cliente: 'ios' }))).toEqual(['cliente']);
  });

  it('RNF-01 rechaza un campo desconocido', () => {
    expect(esquemaLogin.safeParse({ ...valido, recordar: true }).success).toBe(false);
  });

  it('R-1.5 normaliza el correo igual que el registro', () => {
    expect(esquemaLogin.parse({ ...valido, correo: ' ANA@X.MX ' }).correo).toBe('ana@x.mx');
    expect(rutas(esquemaLogin.safeParse({ ...valido, correo: 'ana' }))).toEqual(['correo']);
  });

  it('R-1.5 DD-28 no aplica la política: acepta 1 carácter y una contraseña de la lista', () => {
    expect(esquemaLogin.safeParse({ ...valido, contrasena: 'a' }).success).toBe(true);
    const comun = CONTRASENAS_COMUNES[0]!;
    expect(esquemaLogin.safeParse({ ...valido, contrasena: comun }).success).toBe(true);
    expect(
      esquemaLogin.safeParse({ ...valido, correo: 'qwerty@x.mx', contrasena: 'QWERTY' }).success,
    ).toBe(true);
  });

  it('R-1.5 DD-28 rechaza la contraseña vacía y la de 129, acepta 128', () => {
    expect(rutas(esquemaLogin.safeParse({ ...valido, contrasena: '' }))).toEqual(['contrasena']);
    expect(esquemaLogin.safeParse({ ...valido, contrasena: 'x'.repeat(128) }).success).toBe(true);
    expect(rutas(esquemaLogin.safeParse({ ...valido, contrasena: 'x'.repeat(129) }))).toEqual([
      'contrasena',
    ]);
  });

  it('R-1.5 DD-28 normaliza a NFC sin recortar', () => {
    const r = esquemaLogin.parse({ ...valido, contrasena: ` cafe${ACENTO} ` });
    expect(r.contrasena).toBe(` caf${E_PRECOMPUESTA} `);
  });
});

describe('esquemaRefresh', () => {
  const token = 'A'.repeat(21) + '-_' + 'z9'.repeat(10);

  it('DD-24 acepta el cuerpo vacío (refresh por cookie)', () => {
    expect(esquemaRefresh.parse({})).toEqual({});
  });

  it('DD-24 acepta un refreshToken de 43 caracteres base64url', () => {
    expect(token).toHaveLength(43);
    expect(esquemaRefresh.parse({ refreshToken: token })).toEqual({ refreshToken: token });
  });

  it.each([
    ['42 caracteres', token.slice(1)],
    ['44 caracteres', token + 'A'],
    ['un carácter fuera de base64url', token.slice(1) + '+'],
    ['relleno =', token.slice(1) + '='],
  ])('RNF-01 DD-24 rechaza un refreshToken con %s', (_, refreshToken) => {
    expect(rutas(esquemaRefresh.safeParse({ refreshToken }))).toEqual(['refreshToken']);
  });

  it('RNF-01 rechaza un campo desconocido', () => {
    expect(esquemaRefresh.safeParse({ refreshToken: token, cliente: 'movil' }).success).toBe(false);
  });
});
