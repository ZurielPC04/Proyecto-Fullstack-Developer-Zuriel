// Configuración de la app móvil (design.md §1.3, T-MOB-01, RNF-32).

export type Config = { apiUrl: string };

export type ResultadoConfig = { ok: true; config: Config } | { ok: false; error: string };

export type EntornoMovil = { EXPO_PUBLIC_API_URL?: string | undefined };

// Esquema, host (nombre o IP, sin marcadores como `<IP-de-la-LAN>`), puerto y ruta opcionales.
// No se usa `URL`: su soporte en React Native es parcial.
const FORMATO_URL = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^\s]*)?$/;

const FALTA_URL =
  'Falta EXPO_PUBLIC_API_URL. Copia mobile/.env.example a mobile/.env y pon la IP de tu computadora en la red local.';
const URL_INVALIDA =
  'EXPO_PUBLIC_API_URL no es una URL http(s) válida. Ejemplo: http://192.168.1.50:3000/api';

/**
 * Pura: recibe el entorno y nunca supone `localhost`. `localhost` se acepta porque es una URL
 * válida, pero en un teléfono apunta al propio teléfono y la petición falla (prueba manual).
 */
export function validarConfig(env: EntornoMovil): ResultadoConfig {
  const valor = env.EXPO_PUBLIC_API_URL?.trim() ?? '';
  if (valor === '') return { ok: false, error: FALTA_URL };
  if (!FORMATO_URL.test(valor)) return { ok: false, error: URL_INVALIDA };
  return { ok: true, config: { apiUrl: valor.replace(/\/+$/, '') } };
}

/** Expo reemplaza al compilar solo el acceso estático `process.env.EXPO_PUBLIC_*`. */
export function leerConfig(): ResultadoConfig {
  return validarConfig({ EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL });
}
