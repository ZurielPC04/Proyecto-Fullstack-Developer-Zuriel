// T-API-22: GET /api/cuentas/{cuentaId}/movimientos contra billetera_test, cada respuesta
// validada contra openapi.yaml (DD-27).
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RelojFijo } from '../../../src/plataforma/reloj/index.js';
import { appReal, type AppReal } from '../apoyo/app-real.js';
import { abrirDataSource } from '../apoyo/base.js';
import { validarRespuesta } from '../apoyo/contrato.js';
import { crearUsuarioConCuentas, fondear, type UsuarioDePrueba } from '../apoyo/fabricas.js';
import {
  altaBeneficiario,
  autorizacion,
  clabeDe,
  cuerpo,
  transferir,
} from '../transferencias/apoyo.js';

let dataSource: DataSource;
let real: AppReal;

beforeAll(async () => {
  dataSource = await abrirDataSource();
  real = await appReal(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

type App = AppReal['app'];

interface Movimiento {
  id: string;
  transferenciaId: string;
  tipo: string;
  montoCentavos: number;
  fecha: string;
  concepto: string;
  referencia: string | null;
  contraparte: { etiqueta: string; clabeTerminacion: string | null };
}

interface Pagina {
  items: Movimiento[];
  siguienteCursor: string | null;
}

async function movimientos(
  app: App,
  usuarioId: string,
  cuentaId: string,
  query: Record<string, string | number> = {},
) {
  const respuesta = await request(app)
    .get(`/api/cuentas/${cuentaId}/movimientos`)
    .query(query)
    .set('Authorization', await autorizacion(usuarioId));
  validarRespuesta(respuesta, 'get', '/cuentas/{cuentaId}/movimientos');
  return respuesta;
}

/** Recorre todas las páginas con `limite` y devuelve los movimientos en orden. */
async function recorrer(
  app: App,
  usuarioId: string,
  cuentaId: string,
  query: Record<string, string | number> = {},
): Promise<Movimiento[]> {
  const todos: Movimiento[] = [];
  let cursor: string | null = null;
  do {
    const respuesta = await movimientos(app, usuarioId, cuentaId, {
      ...query,
      ...(cursor === null ? {} : { cursor }),
    });
    expect(respuesta.status).toBe(200);
    const pagina = respuesta.body as Pagina;
    todos.push(...pagina.items);
    cursor = pagina.siguienteCursor;
  } while (cursor !== null);
  return todos;
}

const traspaso = (u: UsuarioDePrueba, monto: number) =>
  cuerpo(u.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: u.ahorroId }, monto);

/** Orden de D-11: fecha DESC y, a igual fecha, id DESC. */
function enOrden(items: Movimiento[]): boolean {
  return items.every((m, i) => {
    const previo = items[i - 1];
    if (!previo) return true;
    if (previo.fecha !== m.fecha) return previo.fecha > m.fecha;
    return BigInt(previo.id) > BigInt(m.id);
  });
}

describe('GET /api/cuentas/{cuentaId}/movimientos (T-API-22)', () => {
  it('R-5.1 R-5.9 DD-37: del más reciente al más antiguo, con tipo, monto con signo, concepto, referencia y contraparte sin datos del titular', async () => {
    const ana = await crearUsuarioConCuentas(dataSource);
    const beto = await crearUsuarioConCuentas(dataSource);
    await fondear(dataSource, ana.principalId, 1_000_000);
    await fondear(dataSource, beto.principalId, 1_000_000);
    const haciaBeto = await altaBeneficiario(real.app, ana.usuarioId, beto.principalId, 'Roberto');
    const haciaAna = await altaBeneficiario(real.app, beto.usuarioId, ana.principalId, 'Ana');
    await transferir(real.app, ana.usuarioId, traspaso(ana, 2_000));
    const envio = await transferir(
      real.app,
      ana.usuarioId,
      cuerpo(ana.principalId, { tipo: 'BENEFICIARIO', beneficiarioId: haciaBeto }, 3_000),
    );
    await transferir(
      real.app,
      beto.usuarioId,
      cuerpo(beto.principalId, { tipo: 'BENEFICIARIO', beneficiarioId: haciaAna }, 4_000),
    );

    const respuesta = await movimientos(real.app, ana.usuarioId, ana.principalId);

    expect(respuesta.status).toBe(200);
    const { items, siguienteCursor } = respuesta.body as Pagina;
    expect(siguienteCursor).toBeNull();
    expect(items.map((m) => [m.tipo, m.montoCentavos])).toEqual([
      ['RECEPCION', 4_000],
      ['ENVIO', -3_000],
      ['TRASPASO_SALIDA', -2_000],
      ['DEPOSITO', 1_000_000],
    ]);
    const [recepcion, enviado, salida, deposito] = items;
    expect(recepcion?.contraparte).toEqual({
      etiqueta: 'Transferencia recibida',
      clabeTerminacion: (await clabeDe(beto.principalId)).slice(-4),
    });
    // El alias que Beto le puso a Ana es privado de Beto.
    expect(JSON.stringify(recepcion)).not.toContain('alias-');
    expect(enviado?.contraparte.clabeTerminacion).toBe((await clabeDe(beto.principalId)).slice(-4));
    expect(enviado?.contraparte.etiqueta).toMatch(/^alias-/);
    expect(enviado?.transferenciaId).toBe(
      (envio.body as { transferenciaId: string }).transferenciaId,
    );
    expect(enviado?.concepto).toBe('Pago de prueba');
    expect(enviado?.referencia).toBe('1234567');
    expect(salida?.contraparte).toEqual({
      etiqueta: 'Ahorro',
      clabeTerminacion: (await clabeDe(ana.ahorroId)).slice(-4),
    });
    expect(deposito?.contraparte).toEqual({ etiqueta: 'Depósito', clabeTerminacion: null });
    expect(deposito?.referencia).toBeNull();
    expect(JSON.stringify(items)).not.toContain(beto.correo);
    expect(JSON.stringify(items)).not.toContain(await clabeDe(beto.principalId));

    const ahorro = await movimientos(real.app, ana.usuarioId, ana.ahorroId);
    expect((ahorro.body as Pagina).items[0]?.contraparte).toEqual({
      etiqueta: 'Principal',
      clabeTerminacion: (await clabeDe(ana.principalId)).slice(-4),
    });
  });

  it('R-5.2 R-5.3: 20 por defecto, siguienteCursor nulo al final, máximo 100 y fuera de 1 a 100 → 400 validation-error', async () => {
    const u = await crearUsuarioConCuentas(dataSource);
    for (let i = 0; i < 23; i++) await fondear(dataSource, u.principalId, 100 + i);

    const primera = await movimientos(real.app, u.usuarioId, u.principalId);
    const pagina = primera.body as Pagina;
    expect(pagina.items).toHaveLength(20);
    expect(pagina.items.map((m) => m.montoCentavos)).toEqual(
      Array.from({ length: 20 }, (_, i) => 122 - i),
    );
    expect(typeof pagina.siguienteCursor).toBe('string');

    const segunda = await movimientos(real.app, u.usuarioId, u.principalId, {
      cursor: pagina.siguienteCursor ?? '',
    });
    expect((segunda.body as Pagina).items.map((m) => m.montoCentavos)).toEqual([102, 101, 100]);
    expect((segunda.body as Pagina).siguienteCursor).toBeNull();

    // Exactamente limite filas: no hay página siguiente (la fila de más no existe).
    const exacta = await movimientos(real.app, u.usuarioId, u.principalId, { limite: 23 });
    expect((exacta.body as Pagina).items).toHaveLength(23);
    expect((exacta.body as Pagina).siguienteCursor).toBeNull();
    expect((await movimientos(real.app, u.usuarioId, u.principalId, { limite: 100 })).status).toBe(
      200,
    );

    for (const limite of ['0', '101', 'abc', '1.5', '-1']) {
      const respuesta = await movimientos(real.app, u.usuarioId, u.principalId, { limite });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toMatchObject({ type: 'validation-error' });
    }
  });

  it('R-5.4 D-11: 25 movimientos con el mismo instante se recorren con limite = 10 sin huecos ni repetidos', async () => {
    const instante = '2026-11-14 16:05:09.123456+00';
    const conReloj = await appReal(dataSource, { reloj: new RelojFijo(instante) });
    const u = await crearUsuarioConCuentas(dataSource);
    await fondear(dataSource, u.principalId, 100_000);
    for (let i = 1; i <= 25; i++) await transferir(conReloj.app, u.usuarioId, traspaso(u, i));

    const recorridos = await recorrer(conReloj.app, u.usuarioId, u.ahorroId, { limite: 10 });

    expect(recorridos).toHaveLength(25);
    expect(new Set(recorridos.map((m) => m.id)).size).toBe(25);
    expect(new Set(recorridos.map((m) => m.fecha))).toEqual(
      new Set(['2026-11-14T16:05:09.123456Z']),
    );
    expect(recorridos.map((m) => m.montoCentavos).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
    expect(enOrden(recorridos)).toBe(true);
  });

  it('R-5.5 D-15: desde y hasta son días en America/Mexico_City, en el borde de la medianoche local', async () => {
    // Diciembre: UTC-6. 05:59:59.999999Z es 23:59:59.999999 del 30 de noviembre local.
    const reloj = new RelojFijo('2026-12-01 05:59:59.999999+00');
    const conReloj = await appReal(dataSource, { reloj });
    const u = await crearUsuarioConCuentas(dataSource);
    await fondear(dataSource, u.principalId, 100_000);
    await transferir(conReloj.app, u.usuarioId, traspaso(u, 111));
    reloj.fijar('2026-12-01 06:00:00+00');
    await transferir(conReloj.app, u.usuarioId, traspaso(u, 222));

    const montos = async (query: Record<string, string>) =>
      (await recorrer(conReloj.app, u.usuarioId, u.ahorroId, query)).map((m) => m.montoCentavos);

    expect(await montos({ desde: '2026-12-01', hasta: '2026-12-01' })).toEqual([222]);
    expect(await montos({ desde: '2026-11-30', hasta: '2026-11-30' })).toEqual([111]);
    expect(await montos({ desde: '2026-11-30' })).toEqual([222, 111]);
    expect(await montos({ hasta: '2026-11-30' })).toEqual([111]);
    expect(await montos({ desde: '2026-12-02' })).toEqual([]);

    const invertido = await movimientos(conReloj.app, u.usuarioId, u.ahorroId, {
      desde: '2026-12-02',
      hasta: '2026-12-01',
    });
    expect(invertido.status).toBe(400);
    expect(invertido.body).toMatchObject({ type: 'validation-error' });
  });

  it('R-5.6: el filtro por tipo devuelve solo ese tipo, también al paginar', async () => {
    const u = await crearUsuarioConCuentas(dataSource);
    await fondear(dataSource, u.principalId, 100_000);
    await fondear(dataSource, u.principalId, 200_000);
    for (let i = 1; i <= 5; i++) await transferir(real.app, u.usuarioId, traspaso(u, i));

    const salidas = await recorrer(real.app, u.usuarioId, u.principalId, {
      tipo: 'TRASPASO_SALIDA',
      limite: 2,
    });
    expect(salidas.map((m) => m.montoCentavos)).toEqual([-5, -4, -3, -2, -1]);
    const depositos = await recorrer(real.app, u.usuarioId, u.principalId, { tipo: 'DEPOSITO' });
    expect(depositos.map((m) => m.montoCentavos)).toEqual([200_000, 100_000]);

    const fondeo = await movimientos(real.app, u.usuarioId, u.principalId, {
      tipo: 'FONDEO_SALIDA',
    });
    expect(fondeo.status).toBe(400);
  });

  it('R-5.7: cursor vacío → validation-error; basura, de otros filtros o de otra cuenta → invalid-cursor', async () => {
    const u = await crearUsuarioConCuentas(dataSource);
    for (let i = 0; i < 3; i++) await fondear(dataSource, u.principalId, 100 + i);
    await fondear(dataSource, u.ahorroId, 500);
    await fondear(dataSource, u.ahorroId, 600);
    const pagina = (await movimientos(real.app, u.usuarioId, u.principalId, { limite: 1 }))
      .body as Pagina;
    const cursor = pagina.siguienteCursor ?? '';
    expect(cursor).not.toBe('');

    const vacio = await movimientos(real.app, u.usuarioId, u.principalId, { cursor: '' });
    expect(vacio.status).toBe(400);
    expect(vacio.body).toMatchObject({ type: 'validation-error' });
    const largo = await movimientos(real.app, u.usuarioId, u.principalId, {
      cursor: 'a'.repeat(513),
    });
    expect(largo.body).toMatchObject({ type: 'validation-error' });

    const invalidos: Record<string, Record<string, string>> = {
      basura: { cursor: 'abcdefghij0123456789' },
      otroTipo: { cursor, tipo: 'DEPOSITO' },
      otroRango: { cursor, desde: '2026-01-01' },
      otraCuenta: { cursor },
    };
    for (const [caso, query] of Object.entries(invalidos)) {
      const cuenta = caso === 'otraCuenta' ? u.ahorroId : u.principalId;
      const respuesta = await movimientos(real.app, u.usuarioId, cuenta, query);
      expect([caso, respuesta.status]).toEqual([caso, 400]);
      expect(respuesta.body).toMatchObject({ type: 'invalid-cursor' });
    }

    // El mismo cursor sigue sirviendo con otro limite (limite no entra en el hash, §8.3).
    const otroLimite = await movimientos(real.app, u.usuarioId, u.principalId, {
      cursor,
      limite: 5,
    });
    expect((otroLimite.body as Pagina).items.map((m) => m.montoCentavos)).toEqual([101, 100]);
  });

  it('R-5.8: las rechazadas y las pendientes no aparecen', async () => {
    const ana = await crearUsuarioConCuentas(dataSource);
    const beto = await crearUsuarioConCuentas(dataSource);
    await fondear(dataSource, ana.principalId, 2_000_000);
    const haciaBeto = await altaBeneficiario(real.app, ana.usuarioId, beto.principalId);
    const destino = { tipo: 'BENEFICIARIO', beneficiarioId: haciaBeto } as const;
    const pendiente = await transferir(
      real.app,
      ana.usuarioId,
      cuerpo(ana.principalId, destino, 1_500_000),
    );
    const rechazada = await transferir(
      real.app,
      ana.usuarioId,
      cuerpo(ana.principalId, destino, 9_000_000),
    );
    expect([pendiente.status, rechazada.status]).toEqual([202, 422]);

    const items = (await recorrer(real.app, ana.usuarioId, ana.principalId)).map((m) => m.tipo);
    expect(items).toEqual(['DEPOSITO']);
    expect(await recorrer(real.app, beto.usuarioId, beto.principalId)).toEqual([]);
  });

  it('R-5.10 D-10: cuenta ajena, inexistente o Fondeo → 404 not-found', async () => {
    const ana = await crearUsuarioConCuentas(dataSource);
    const beto = await crearUsuarioConCuentas(dataSource);
    for (const cuenta of [beto.principalId, randomUUID(), '00000000-0000-0000-0000-000000000001']) {
      const respuesta = await movimientos(real.app, ana.usuarioId, cuenta);
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toMatchObject({ type: 'not-found' });
    }
    const sinToken = await request(real.app).get(`/api/cuentas/${ana.principalId}/movimientos`);
    expect(sinToken.status).toBe(401);
  });
});
