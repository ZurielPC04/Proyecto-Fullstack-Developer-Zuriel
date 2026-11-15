// Código prohibido a propósito (DD-42). Lo revisa `npm run lint:verificar-reglas`;
// `npm run lint` y la compilación lo ignoran. Cada línea marcada con `espera:`
// debe reportar esa regla; las marcadas con `válido` no deben reportar ninguna.
declare const texto: string;
let monto = Number(texto);

export const a = parseFloat(texto); // espera: no-restricted-globals
export const b = Number.parseFloat(texto); // espera: no-restricted-properties
export const c = Math.round(monto); // espera: no-restricted-properties
export const d = Math.floor(monto); // espera: no-restricted-properties
export const e = Math.ceil(monto); // espera: no-restricted-properties
export const f = monto / 100; // espera: no-restricted-syntax
monto /= 100; // espera: no-restricted-syntax
export const g = monto.toFixed(2); // espera: no-restricted-syntax

export const h = monto / 2; // válido
export const i = monto % 100; // válido
export const j = Math.abs(monto); // válido
export const k = Number(texto); // válido
