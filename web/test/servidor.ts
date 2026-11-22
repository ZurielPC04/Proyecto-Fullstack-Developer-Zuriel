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

/**
 * Access con forma de JWT (§5.2) cuyo `sub` es el usuario dado. La firma es falsa: la web solo
 * lee el `sub` para saber de quién es el intento guardado (R-1.12); la API es la que verifica.
 */
export function accessDe(usuarioId: string): string {
  const base64url = (json: object) =>
    btoa(JSON.stringify(json)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: usuarioId })}.firma`;
}

/** Respuesta `Tokens` de login o refresh de la web: solo el access, nunca el refresh (R-1.13). */
export function tokens(accessToken: string) {
  return HttpResponse.json({ accessToken, accessExpiraEn: INSTANTE });
}
