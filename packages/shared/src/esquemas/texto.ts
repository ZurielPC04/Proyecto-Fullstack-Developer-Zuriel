import { z } from 'zod';

// DD-16: todo texto se recorta y se normaliza a NFC antes de validar.
export function normalizarTexto(texto: string): string {
  return texto.trim().normalize('NFC');
}

const SIN_CONTROLES = /^\P{Cc}*$/u;

// Texto de DD-16: recortado, en NFC, sin caracteres de control y con la longitud
// medida en code points después de normalizar (Zod 4 cuenta code points).
export function textoCorto(min: number, max: number) {
  return z
    .string()
    .overwrite(normalizarTexto)
    .min(min, `Debe tener al menos ${min} caracteres.`)
    .max(max, `Debe tener como máximo ${max} caracteres.`)
    .regex(SIN_CONTROLES, 'No admite caracteres de control.');
}

// §6.7: 8-4-4-4-12 hexadecimal sin exigir versión ni variante, igual que format: uuid (DD-27).
// §6.2: sale en minúsculas, para que el hash de idempotencia no dependa del cliente.
export function uuid() {
  return z.guid('UUID inválido.').toLowerCase();
}
