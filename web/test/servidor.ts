import { HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/** Servidor simulado (MSW) compartido; cada prueba agrega sus handlers con `servidor.use`. */
export const servidor = setupServer();

/** Problem RFC 7807 con el `type` y el `status` dados (design.md §7). */
export function problema(status: number, type: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { type, title: type, status, detail: type, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export const INSTANTE = '2026-11-22T18:00:00.000000Z';

/** Respuesta `Tokens` de login o refresh de la web: solo el access, nunca el refresh (R-1.13). */
export function tokens(accessToken: string) {
  return HttpResponse.json({ accessToken, accessExpiraEn: INSTANTE });
}
