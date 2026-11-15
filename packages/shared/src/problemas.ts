// Catálogo de problemas (DD-23, design.md §7.2 y §13.1): textos en español que
// muestran web y móvil. Los clientes deciden por `type`, nunca por `detail`.

/** design.md §7.2: igual al enum `TipoProblema` de openapi.yaml. */
export const TIPOS_PROBLEMA = [
  'validation-error',
  'unauthorized',
  'credenciales-invalidas',
  'not-found',
  'correo-ya-registrado',
  'beneficiario-duplicado',
  'clabe-not-found',
  'misma-cuenta',
  'idempotency-key-reused',
  'invalid-cursor',
  'saldo-insuficiente',
  'limite-diario-excedido',
  'codigo-incorrecto',
  'codigo-agotado',
  'codigo-expirado',
  'too-many-requests',
  'retryable',
  'internal-error',
] as const;

export type TipoProblema = (typeof TIPOS_PROBLEMA)[number];

// `Record<TipoProblema, string>` hace que el compilador exija un texto por cada `type`.
const MENSAJES: Record<TipoProblema, string> = {
  'validation-error': 'Revisa los datos marcados.',
  'invalid-cursor': 'El historial cambió. Vuelve a cargarlo.',
  unauthorized: 'Tu sesión terminó. Inicia sesión de nuevo.',
  'credenciales-invalidas': 'Correo o contraseña incorrectos.',
  'not-found': 'No encontramos lo que buscas.',
  'correo-ya-registrado': 'Ese correo ya está registrado. Inicia sesión o usa otro correo.',
  'beneficiario-duplicado': 'Ya tienes un beneficiario con esa CLABE o ese alias.',
  'clabe-not-found': 'La CLABE no corresponde a ninguna cuenta de la plataforma.',
  'misma-cuenta': 'La cuenta de origen y la de destino deben ser distintas.',
  'idempotency-key-reused': 'No pudimos procesar este envío. Inicia uno nuevo.',
  'saldo-insuficiente': 'La cuenta origen no tiene saldo suficiente para esta transferencia.',
  'limite-diario-excedido':
    'La transferencia supera tu límite diario. Tu límite se renueva a medianoche.',
  'codigo-incorrecto': 'El código es incorrecto. Inténtalo de nuevo.',
  'codigo-agotado': 'Agotaste los intentos del código. La transferencia fue rechazada.',
  'codigo-expirado': 'El código expiró. La transferencia fue rechazada.',
  'too-many-requests': 'Demasiados intentos. Espera un momento y vuelve a intentarlo.',
  retryable: 'El servicio está ocupado. Inténtalo de nuevo en unos segundos.',
  'internal-error': 'Ocurrió un error inesperado. Inténtalo más tarde.',
};

const CATALOGO: ReadonlySet<string> = new Set(TIPOS_PROBLEMA);

function esTipoProblema(type: string): type is TipoProblema {
  return CATALOGO.has(type);
}

/**
 * R-4.12: texto para el usuario de un `type` de problem. Recibe cualquier texto porque
 * el `type` llega de la red; uno fuera del catálogo muestra el de `internal-error` (§13.1).
 */
export function mensajeDeProblema(type: string): string {
  return MENSAJES[esTipoProblema(type) ? type : 'internal-error'];
}
