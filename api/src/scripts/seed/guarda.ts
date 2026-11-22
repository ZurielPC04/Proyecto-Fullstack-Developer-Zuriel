// design.md §3.7, guarda: el seed vacía tablas, así que se niega antes de tocar nada si el
// entorno es de producción o si alguna URL apunta a la base de las pruebas (§14.2).
import { cargarConfiguracion, type Config } from '../../config/index.js';

const BASE_DE_PRUEBAS = 'billetera_test';

export type EntornoSeed =
  { ok: true; config: Config; urlDueno: string } | { ok: false; motivos: string[] };

function esPostgres(url: string | undefined): url is string {
  const protocolo = url === undefined ? undefined : URL.parse(url)?.protocol;
  return protocolo === 'postgres:' || protocolo === 'postgresql:';
}

/** Nombre de la base de una URL de PostgreSQL (`/billetera_test` → `billetera_test`). */
const nombreDeBase = (url: string) => decodeURIComponent(URL.parse(url)?.pathname.slice(1) ?? '');

export function revisarEntornoSeed(env: Record<string, string | undefined>): EntornoSeed {
  // Antes que la configuración: en producción no se corre, sea válida o no.
  if (env['NODE_ENV'] === 'production') return { ok: false, motivos: ['NODE_ENV=production'] };

  const resultado = cargarConfiguracion(env);
  const urlDueno = env['DATABASE_URL_MIGRACIONES'];
  // Igual que §2.4 y migrar.ts: solo los nombres, nunca los valores.
  const invalidas = resultado.ok ? [] : [...resultado.variablesInvalidas];
  if (!esPostgres(urlDueno)) invalidas.push('DATABASE_URL_MIGRACIONES');
  if (!resultado.ok || !esPostgres(urlDueno)) {
    return { ok: false, motivos: [`variables inválidas: ${invalidas.sort().join(', ')}`] };
  }

  const motivos = (
    [
      ['DATABASE_URL', resultado.config.DATABASE_URL],
      ['DATABASE_URL_MIGRACIONES', urlDueno],
    ] as const
  )
    .filter(([, url]) => nombreDeBase(url) === BASE_DE_PRUEBAS)
    .map(([variable]) => `${variable} apunta a ${BASE_DE_PRUEBAS}`);
  if (motivos.length > 0) return { ok: false, motivos };

  return { ok: true, config: resultado.config, urlDueno };
}
