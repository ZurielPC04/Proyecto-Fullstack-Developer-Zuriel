import { mensajeDeProblema, type TipoProblema } from '@billetera/shared';
import type { Response } from 'express';

/** design.md §7.2: código HTTP y `title` fijos por `type`. `detail` sale de shared (§7.1). */
const CATALOGO: Record<TipoProblema, { status: number; title: string }> = {
  'validation-error': { status: 400, title: 'Datos inválidos' },
  'invalid-cursor': { status: 400, title: 'Cursor inválido' },
  unauthorized: { status: 401, title: 'No autenticado' },
  'credenciales-invalidas': { status: 401, title: 'Credenciales inválidas' },
  'not-found': { status: 404, title: 'No encontrado' },
  'correo-ya-registrado': { status: 409, title: 'Correo ya registrado' },
  'beneficiario-duplicado': { status: 409, title: 'Beneficiario duplicado' },
  'clabe-not-found': { status: 422, title: 'CLABE no encontrada' },
  'misma-cuenta': { status: 422, title: 'Misma cuenta' },
  'idempotency-key-reused': { status: 422, title: 'Llave de idempotencia reutilizada' },
  'saldo-insuficiente': { status: 422, title: 'Saldo insuficiente' },
  'limite-diario-excedido': { status: 422, title: 'Límite diario excedido' },
  'codigo-incorrecto': { status: 422, title: 'Código incorrecto' },
  'codigo-agotado': { status: 422, title: 'Código agotado' },
  'codigo-expirado': { status: 422, title: 'Código expirado' },
  'too-many-requests': { status: 429, title: 'Demasiadas peticiones' },
  retryable: { status: 503, title: 'Servicio ocupado' },
  'internal-error': { status: 500, title: 'Error interno' },
};

export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

/** DD-23: las únicas extensiones permitidas. */
export interface ExtensionesProblema {
  errores?: ErrorCampo[];
  motivo?: string;
  transferenciaId?: string;
  intentosRestantes?: number;
}

export interface Problema extends ExtensionesProblema {
  type: TipoProblema;
  title: string;
  status: number;
  detail: string;
}

export function crearProblema(type: TipoProblema, extensiones: ExtensionesProblema = {}): Problema {
  const { status, title } = CATALOGO[type];
  return { type, title, status, detail: mensajeDeProblema(type), ...extensiones };
}

export function responderProblema(res: Response, problema: Problema): void {
  // §7.2: retryable siempre con Retry-After: 1 (DD-10).
  if (problema.type === 'retryable') res.set('Retry-After', '1');
  res.status(problema.status).type('application/problem+json').json(problema);
}
