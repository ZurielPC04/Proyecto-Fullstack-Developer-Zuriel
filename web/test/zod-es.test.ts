import { esquemaLogin, esquemaRegistro } from '@billetera/shared';
import { describe, expect, it } from 'vitest';

// design.md §13.2 "Formularios": el locale español de Zod aplica a los esquemas de shared.
describe('mensajes de Zod en español', () => {
  it('RNF-18 un mensaje por defecto de Zod sale en español en un esquema de shared', () => {
    const resultado = esquemaLogin.safeParse({
      correo: 'ana@demo.mx',
      contrasena: 'x',
      cliente: 'tv',
    });

    expect(resultado.error?.issues[0]?.message).toBe(
      'Opción inválida: se esperaba una de "web"|"movil"',
    );
  });

  it('RNF-18 los mensajes propios de la política de contraseñas se conservan', () => {
    const resultado = esquemaRegistro.safeParse({ correo: 'ana@demo.mx', contrasena: 'corta' });

    expect(resultado.error?.issues[0]?.message).toBe('Debe tener al menos 12 caracteres.');
  });
});
