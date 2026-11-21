import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

// design.md §5.2 (DD-29).
const ALGORITMO = 'HS256';
const EMISOR = 'billetera-api';
const AUDIENCIA = 'billetera';
const VIDA_ACCESS_S = 15 * 60;
const TOLERANCIA_S = 5;

export interface AccessEmitido {
  token: string;
  /** ISO 8601 con 6 decimales (DD-22). */
  expiraEn: string;
}

export interface Tokens {
  emitirAccess(usuarioId: string): Promise<AccessEmitido>;
  /** Devuelve el `sub`; lanza ante cualquier fallo (firma, algoritmo, claims, vencimiento). */
  verificarAccess(token: string): Promise<string>;
}

export function crearTokens(secreto: string): Tokens {
  const clave = new TextEncoder().encode(secreto);
  return {
    async emitirAccess(usuarioId) {
      const iat = Math.trunc(Date.now() / 1000);
      const exp = iat + VIDA_ACCESS_S;
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: ALGORITMO, typ: 'JWT' })
        .setSubject(usuarioId)
        .setIssuer(EMISOR)
        .setAudience(AUDIENCIA)
        .setIssuedAt(iat)
        .setExpirationTime(exp)
        .sign(clave);
      // El access no es una marca de negocio (DD-07): su instante sale de exp, en segundos.
      const expiraEn = new Date(exp * 1000).toISOString().replace(/\.\d{3}Z$/, '.000000Z');
      return { token, expiraEn };
    },
    async verificarAccess(token) {
      // DD-29: la lista de algoritmos impide alg: none y cualquier otro HS*/RS* (§5.2).
      const { payload } = await jwtVerify(token, clave, {
        algorithms: [ALGORITMO],
        issuer: EMISOR,
        audience: AUDIENCIA,
        clockTolerance: TOLERANCIA_S,
        requiredClaims: ['sub', 'exp'],
      });
      if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('sub inválido');
      return payload.sub;
    },
  };
}

/** §5.3: 32 bytes de crypto.randomBytes en base64url sin relleno (43 caracteres). */
export function generarRefresh(): string {
  return randomBytes(32).toString('base64url');
}

/** RNF-02 y D-05: en la base solo se guarda el SHA-256 en hexadecimal. */
export function hashRefresh(refresh: string): string {
  return createHash('sha256').update(refresh).digest('hex');
}
