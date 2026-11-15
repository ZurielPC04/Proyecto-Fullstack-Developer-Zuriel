/// <reference types="vite/client" />
// Hasta que T-SHR-06 genere los tipos desde openapi.yaml, esta prueba evita que el
// catálogo de shared se desalinee del contrato. Lee el YAML como texto con `?raw`.
import { describe, expect, it } from 'vitest';
import openapi from '../../../specs/openapi.yaml?raw';
import { TIPOS_PROBLEMA } from '../src/problemas.js';

function enumTipoProblema(yaml: string): string[] {
  const bloque = /^ {4}TipoProblema:\n(?: {6}.*\n)*? {6}enum:\n((?: {8}- .*\n)+)/m.exec(yaml);
  if (!bloque?.[1]) throw new Error('No se encontró el enum TipoProblema en openapi.yaml');
  return bloque[1]
    .split('\n')
    .filter(Boolean)
    .map((linea) => linea.replace(/^ {8}- /, '').trim());
}

describe('TIPOS_PROBLEMA', () => {
  it('RNF-18 DD-23 coincide con el enum TipoProblema de openapi.yaml', () => {
    expect([...TIPOS_PROBLEMA]).toEqual(enumTipoProblema(openapi));
  });
});
