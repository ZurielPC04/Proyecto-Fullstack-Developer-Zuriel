import { z } from 'zod';

// design.md §2.4: enteros solo con dígitos, sin signo, sin ceros a la izquierda; nunca z.coerce.
const DIGITOS = /^(0|[1-9][0-9]*)$/;

function entero(minimo: number, maximo = Number.MAX_SAFE_INTEGER) {
  return z
    .string()
    .regex(DIGITOS)
    .transform(Number)
    .refine(Number.isSafeInteger)
    .pipe(z.number().min(minimo).max(maximo));
}

// §2.4: 32 bytes en UTF-8, no 32 unidades UTF-16 (.length).
const secreto = z.string().refine((valor) => Buffer.byteLength(valor, 'utf8') >= 32);

function urlConProtocolo(protocolos: readonly string[]) {
  return z.string().refine((valor) => {
    const url = URL.parse(valor);
    return url !== null && protocolos.includes(url.protocol);
  });
}

// §2.4: solo el origen, tal como lo compara cors: sin ruta, query, fragmento ni "/" final.
const origenWeb = urlConProtocolo(['http:', 'https:']).refine(
  (valor) => URL.parse(valor)?.origin === valor,
);

const booleano = z.enum(['true', 'false']).transform((valor) => valor === 'true');

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: entero(1, 65535).default(3000),
    DATABASE_URL: urlConProtocolo(['postgres:', 'postgresql:']),
    DB_POOL_MAX: entero(1, 50).default(10),
    JWT_SECRETO: secreto,
    OTP_HMAC_SECRETO: secreto,
    LIMITE_DIARIO_CENTAVOS: entero(1),
    UMBRAL_CODIGO_CENTAVOS: entero(1),
    FONDEO_BIENVENIDA_CENTAVOS: entero(0),
    OTP_SIMULADO: booleano,
    DEMO_LATENCIA_MS: entero(0, 30000).default(0),
    WEB_ORIGIN: origenWeb,
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TRUST_PROXY: entero(0).default(0),
  })
  .superRefine(
    (config, ctx) => {
      // Cada regla cruzada reporta la variable que la rompe (§2.4).
      const invalida = (variable: keyof typeof config) =>
        ctx.addIssue({ code: 'custom', path: [variable], message: 'regla cruzada' });

      if (config.UMBRAL_CODIGO_CENTAVOS >= config.LIMITE_DIARIO_CENTAVOS)
        invalida('UMBRAL_CODIGO_CENTAVOS');

      if (config.OTP_HMAC_SECRETO === config.JWT_SECRETO) invalida('OTP_HMAC_SECRETO');

      if (config.NODE_ENV === 'production') {
        // RNF-15, R-6.17: nada de demo ni de dinero regalado en producción.
        if (config.OTP_SIMULADO) invalida('OTP_SIMULADO');
        if (config.DEMO_LATENCIA_MS !== 0) invalida('DEMO_LATENCIA_MS');
        if (config.FONDEO_BIENVENIDA_CENTAVOS !== 0) invalida('FONDEO_BIENVENIDA_CENTAVOS');
        // DD-24: la cookie del refresh lleva Secure.
        if (!config.WEB_ORIGIN.startsWith('https:')) invalida('WEB_ORIGIN');
      }
    },
    {
      // Zod 4 corre los refinamientos aunque un campo ya haya fallado (p. ej. LIMITE=0 por su mínimo).
      // Las reglas cruzadas solo se evalúan sobre campos válidos, para no reportar una variable sana.
      when: (payload) => payload.issues.length === 0,
    },
  );

export type Config = z.output<typeof esquema>;

export type ResultadoConfiguracion =
  { ok: true; config: Config } | { ok: false; variablesInvalidas: string[] };

export function cargarConfiguracion(
  env: Record<string, string | undefined>,
): ResultadoConfiguracion {
  const resultado = esquema.safeParse(env);
  if (resultado.success) return { ok: true, config: resultado.data };
  const nombres = new Set(resultado.error.issues.map((issue) => String(issue.path[0])));
  return { ok: false, variablesInvalidas: [...nombres].sort() };
}
