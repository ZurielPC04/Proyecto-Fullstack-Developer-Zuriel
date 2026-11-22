import { describe, expect, it } from 'vitest';
import { ErrorApi } from '../src/api/errores';
import { crearQueryClient, debeReintentar } from '../src/app/query-client';

const problema = (status: number) =>
  new ErrorApi(status, { type: 'not-found', title: 'x', status, detail: 'x' });

describe('QueryClient (design.md §13.2)', () => {
  it('staleTime de 30 s en las consultas', () => {
    expect(crearQueryClient().getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it('las mutaciones nunca se reintentan solas', () => {
    expect(crearQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('una consulta se reintenta una vez ante un error que no es 4xx', () => {
    expect(debeReintentar(0, problema(503))).toBe(true);
    expect(debeReintentar(0, new TypeError('red'))).toBe(true);
    expect(debeReintentar(1, problema(503))).toBe(false);
  });

  it('una consulta no se reintenta ante un 4xx', () => {
    expect(debeReintentar(0, problema(400))).toBe(false);
    expect(debeReintentar(0, problema(404))).toBe(false);
    expect(debeReintentar(0, problema(499))).toBe(false);
  });
});
