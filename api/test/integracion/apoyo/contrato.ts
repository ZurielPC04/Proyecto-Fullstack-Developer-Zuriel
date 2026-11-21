// DD-27 y design.md §4.3: valida cada respuesta de Supertest contra el esquema de su operación
// y código en openapi.yaml, con Ajv en modo JSON Schema 2020-12.
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModulo from 'ajv-formats';
import { parse } from 'yaml';

const CONTRATO = new URL('../../../../specs/openapi.yaml', import.meta.url);
const ID = 'openapi';

type Nodo = Record<string, unknown>;

const documento = parse(readFileSync(CONTRATO, 'utf8')) as Nodo;

// El documento OpenAPI completo se carga como un esquema para que sus $ref internos
// (#/components/schemas/…) se resuelvan. Sus palabras propias (openapi, info, paths,
// example…) no son de JSON Schema: sin strict, Ajv las ignora. El documento lo valida
// `redocly lint` en CI (DD-27).
const ajv = new Ajv2020({ strict: false, allErrors: true });
// ajv-formats es CommonJS: su default llega como módulo o como función según el cargador.
const addFormats = ((addFormatsModulo as unknown as { default?: unknown }).default ??
  addFormatsModulo) as (instancia: Ajv2020) => void;
addFormats(ajv);
ajv.addSchema(documento, ID);

function escapar(segmento: string): string {
  return segmento.replace(/~/g, '~0').replace(/\//g, '~1');
}

function resolver(ref: string): { nodo: Nodo; puntero: string } {
  const puntero = ref.replace(/^#/, '');
  let nodo: unknown = documento;
  for (const parte of puntero.split('/').slice(1)) {
    nodo = (nodo as Nodo)[parte.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return { nodo: nodo as Nodo, puntero };
}

export interface RespuestaHttp {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/**
 * Lanza si la respuesta no cumple el contrato de `metodo ruta` (ruta como en openapi.yaml,
 * sin el prefijo /api: '/health', '/transferencias/{id}').
 */
export function validarRespuesta(respuesta: RespuestaHttp, metodo: string, ruta: string): void {
  const operacion = (documento['paths'] as Record<string, Nodo | undefined>)[ruta]?.[
    metodo.toLowerCase()
  ] as Nodo | undefined;
  if (!operacion) throw new Error(`El contrato no declara ${metodo.toUpperCase()} ${ruta}`);

  const respuestas = operacion['responses'] as Record<string, Nodo>;
  const codigo = String(respuesta.status);
  const clave = codigo in respuestas ? codigo : 'default' in respuestas ? 'default' : undefined;
  if (!clave) {
    throw new Error(`El contrato no declara ${codigo} para ${metodo.toUpperCase()} ${ruta}`);
  }

  let puntero = `/paths/${escapar(ruta)}/${metodo.toLowerCase()}/responses/${clave}`;
  let declarada = respuestas[clave] as Nodo;
  if (typeof declarada['$ref'] === 'string') {
    ({ nodo: declarada, puntero } = resolver(declarada['$ref']));
  }

  const contenido = declarada['content'] as Record<string, Nodo> | undefined;
  const tipo =
    String(respuesta.headers['content-type'] ?? '')
      .split(';')[0]
      ?.trim() ?? '';
  if (!contenido) {
    // Supertest entrega `{}` cuando la respuesta no trae cuerpo (p. ej. un 204): sin
    // Content-Type y sin claves, no hay cuerpo.
    const vacio =
      respuesta.body === undefined ||
      respuesta.body === '' ||
      respuesta.body === null ||
      (!tipo &&
        typeof respuesta.body === 'object' &&
        Object.keys(respuesta.body as object).length === 0);
    if (vacio) return;
    throw new Error(
      `El contrato no declara cuerpo para ${codigo} en ${metodo.toUpperCase()} ${ruta}`,
    );
  }
  if (!contenido[tipo]) {
    throw new Error(
      `El contrato no declara ${tipo || 'sin Content-Type'} para ${codigo} en ${metodo.toUpperCase()} ${ruta}`,
    );
  }

  const validar = ajv.compile({ $ref: `${ID}#${puntero}/content/${escapar(tipo)}/schema` });
  if (!validar(respuesta.body)) {
    throw new Error(
      `La respuesta ${codigo} de ${metodo.toUpperCase()} ${ruta} no cumple el contrato: ${ajv.errorsText(validar.errors)}`,
    );
  }
}
