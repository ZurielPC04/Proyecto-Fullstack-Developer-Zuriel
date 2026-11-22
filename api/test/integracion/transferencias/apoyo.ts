// Apoyo de las pruebas HTTP de transferencias (T-API-17 a T-API-21): peticiones validadas
// contra el contrato (DD-27) y lecturas como dueño de lo que la spec pide verificar en la base.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { crearTokens } from '../../../src/plataforma/seguridad/tokens.js';
import { configDePrueba } from '../../apoyo/app.js';
import type { AppReal } from '../apoyo/app-real.js';
import { validarRespuesta } from '../apoyo/contrato.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';

type App = AppReal['app'] | Parameters<typeof request>[0];

const tokens = crearTokens(configDePrueba().JWT_SECRETO);
export const autorizacion = async (usuarioId: string) =>
  `Bearer ${(await tokens.emitirAccess(usuarioId)).token}`;

export type Destino =
  { tipo: 'BENEFICIARIO'; beneficiarioId: string } | { tipo: 'CUENTA_PROPIA'; cuentaId: string };

export interface Cuerpo {
  cuentaOrigenId: string;
  destino: Destino;
  montoCentavos: number;
  concepto: string;
  referencia: string;
}

export function cuerpo(cuentaOrigenId: string, destino: Destino, montoCentavos: number): Cuerpo {
  return {
    cuentaOrigenId,
    destino,
    montoCentavos,
    concepto: 'Pago de prueba',
    referencia: '1234567',
  };
}

export async function transferir(
  app: App,
  usuarioId: string,
  datos: object,
  llave: string | null = randomUUID(),
) {
  let peticion = request(app)
    .post('/api/transferencias')
    .set('Authorization', await autorizacion(usuarioId));
  if (llave !== null) peticion = peticion.set('Idempotency-Key', llave);
  const respuesta = await peticion.send(datos);
  validarRespuesta(respuesta, 'post', '/transferencias');
  return respuesta;
}

export async function consultar(app: App, usuarioId: string, transferenciaId: string) {
  const respuesta = await request(app)
    .get(`/api/transferencias/${transferenciaId}`)
    .set('Authorization', await autorizacion(usuarioId));
  validarRespuesta(respuesta, 'get', '/transferencias/{transferenciaId}');
  return respuesta;
}

export async function confirmar(
  app: App,
  usuarioId: string,
  transferenciaId: string,
  codigo: string,
) {
  const respuesta = await request(app)
    .post(`/api/transferencias/${transferenciaId}/confirmar`)
    .set('Authorization', await autorizacion(usuarioId))
    .send({ codigo });
  validarRespuesta(respuesta, 'post', '/transferencias/{transferenciaId}/confirmar');
  return respuesta;
}

export async function limites(app: App, usuarioId: string) {
  const respuesta = await request(app)
    .get('/api/limites')
    .set('Authorization', await autorizacion(usuarioId));
  validarRespuesta(respuesta, 'get', '/limites');
  return respuesta;
}

export async function clabeDe(cuentaId: string): Promise<string> {
  const [fila] = await consultarComoDueno<{ clabe: string }>(
    'SELECT clabe FROM cuenta WHERE id = $1',
    [cuentaId],
  );
  if (!fila) throw new Error('cuenta inexistente');
  return fila.clabe;
}

let siguienteAlias = 0;

/** Alta real por `POST /beneficiarios` (T-API-16). */
export async function altaBeneficiario(
  app: App,
  usuarioId: string,
  cuentaId: string,
  nombre = 'Beneficiario de prueba',
): Promise<string> {
  const respuesta = await request(app)
    .post('/api/beneficiarios')
    .set('Authorization', await autorizacion(usuarioId))
    .send({ nombre, alias: `alias-${++siguienteAlias}`, clabe: await clabeDe(cuentaId) });
  if (respuesta.status !== 201) throw new Error(`alta de beneficiario: ${respuesta.status}`);
  return (respuesta.body as { id: string }).id;
}

export async function saldo(cuentaId: string): Promise<number> {
  const [fila] = await consultarComoDueno<{ saldo_centavos: number }>(
    'SELECT saldo_centavos FROM cuenta WHERE id = $1',
    [cuentaId],
  );
  if (!fila) throw new Error('cuenta inexistente');
  return fila.saldo_centavos;
}

export interface FilaGuardada {
  id: string;
  estado: string;
  tipo: string;
  motivo_rechazo: string | null;
  llave_idempotencia: string;
  hash_peticion: string;
  beneficiario_id: string | null;
}

export const transferenciasDe = (usuarioId: string) =>
  consultarComoDueno<FilaGuardada>(
    `SELECT id, estado, tipo, motivo_rechazo, llave_idempotencia, hash_peticion, beneficiario_id
       FROM transferencia WHERE usuario_id = $1 ORDER BY creado_en, id`,
    [usuarioId],
  );

export const asientosDe = (transferenciaId: string) =>
  consultarComoDueno<{ cuenta_id: string; monto_centavos: number; tipo_movimiento: string }>(
    'SELECT cuenta_id, monto_centavos, tipo_movimiento FROM asiento WHERE transferencia_id = $1 ORDER BY monto_centavos',
    [transferenciaId],
  );

export const eventosDe = (usuarioId: string, tipos: string[]) =>
  consultarComoDueno<{ tipo: string; datos: Record<string, unknown> }>(
    'SELECT tipo, datos FROM evento_auditoria WHERE usuario_id = $1 AND tipo = ANY($2) ORDER BY id',
    [usuarioId, tipos],
  );
