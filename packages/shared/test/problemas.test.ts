import { describe, expect, it } from 'vitest';
import { mensajeDeProblema, TIPOS_PROBLEMA } from '../src/problemas.js';

// design.md §13.1: textos aprobados, copiados literalmente (no derivados del código).
const TEXTOS_13_1: Array<[string, string]> = [
  ['validation-error', 'Revisa los datos marcados.'],
  ['invalid-cursor', 'El historial cambió. Vuelve a cargarlo.'],
  ['unauthorized', 'Tu sesión terminó. Inicia sesión de nuevo.'],
  ['credenciales-invalidas', 'Correo o contraseña incorrectos.'],
  ['not-found', 'No encontramos lo que buscas.'],
  ['correo-ya-registrado', 'Ese correo ya está registrado. Inicia sesión o usa otro correo.'],
  ['beneficiario-duplicado', 'Ya tienes un beneficiario con esa CLABE o ese alias.'],
  ['clabe-not-found', 'La CLABE no corresponde a ninguna cuenta de la plataforma.'],
  ['misma-cuenta', 'La cuenta de origen y la de destino deben ser distintas.'],
  ['idempotency-key-reused', 'No pudimos procesar este envío. Inicia uno nuevo.'],
  ['saldo-insuficiente', 'La cuenta origen no tiene saldo suficiente para esta transferencia.'],
  [
    'limite-diario-excedido',
    'La transferencia supera tu límite diario. Tu límite se renueva a medianoche.',
  ],
  ['codigo-incorrecto', 'El código es incorrecto. Inténtalo de nuevo.'],
  ['codigo-agotado', 'Agotaste los intentos del código. La transferencia fue rechazada.'],
  ['codigo-expirado', 'El código expiró. La transferencia fue rechazada.'],
  ['too-many-requests', 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'],
  ['retryable', 'El servicio está ocupado. Inténtalo de nuevo en unos segundos.'],
  ['internal-error', 'Ocurrió un error inesperado. Inténtalo más tarde.'],
];

describe('mensajeDeProblema', () => {
  it('R-4.12 el saldo insuficiente se explica en lenguaje claro', () => {
    expect(mensajeDeProblema('saldo-insuficiente')).toBe(
      'La cuenta origen no tiene saldo suficiente para esta transferencia.',
    );
  });

  it.each(TEXTOS_13_1)('R-4.12 DD-23 "%s" muestra el texto de §13.1', (type, texto) => {
    expect(mensajeDeProblema(type)).toBe(texto);
  });

  it('R-4.12 DD-23 la tabla de §13.1 cubre exactamente el catálogo TIPOS_PROBLEMA', () => {
    expect(TEXTOS_13_1.map(([type]) => type).sort()).toEqual([...TIPOS_PROBLEMA].sort());
  });

  it.each([
    'tipo-nuevo-de-la-api',
    '',
    'SALDO_INSUFICIENTE',
    'toString',
    'constructor',
    '__proto__',
  ])(
    'R-4.12 DD-23 un type fuera del catálogo ("%s") muestra el texto de internal-error',
    (type) => {
      expect(mensajeDeProblema(type)).toBe('Ocurrió un error inesperado. Inténtalo más tarde.');
    },
  );
});
