import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appReal, type AppReal } from '../apoyo/app-real.js';
import { abrirDataSource, urlDueno } from '../apoyo/base.js';
import { crearUsuarioConCuentas, fondear, type UsuarioDePrueba } from '../apoyo/fabricas.js';
import {
  altaBeneficiario,
  asientosDe,
  cuerpo,
  saldo,
  transferenciasDe,
  transferir,
} from './apoyo.js';

let dataSource: DataSource;
let app: AppReal['app'];

beforeAll(async () => {
  dataSource = await abrirDataSource();
  ({ app } = await appReal(dataSource));
});

afterAll(async () => {
  await dataSource.destroy();
});

async function emisorConSaldo(monto: number): Promise<UsuarioDePrueba> {
  const usuario = await crearUsuarioConCuentas(dataSource);
  await fondear(dataSource, usuario.principalId, monto);
  return usuario;
}

const traspaso = (u: UsuarioDePrueba, monto: number) =>
  cuerpo(u.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: u.ahorroId }, monto);

describe('T-API-18 · Idempotency-Key', () => {
  it('R-4.13 sin llave o con una llave que no es UUID: 400 en headers.idempotency-key sin crear nada', async () => {
    const emisor = await emisorConSaldo(1_000);
    for (const llave of [null, 'no-es-uuid', '']) {
      const respuesta = await transferir(app, emisor.usuarioId, traspaso(emisor, 10), llave);
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errores).toContainEqual(
        expect.objectContaining({ campo: 'headers.idempotency-key' }),
      );
    }
    expect(await transferenciasDe(emisor.usuarioId)).toEqual([]);
  });

  it('R-4.14 la repetición de un 201 devuelve el mismo código y el mismo cuerpo sin mover dinero', async () => {
    const emisor = await emisorConSaldo(1_000);
    const llave = randomUUID();
    const primera = await transferir(app, emisor.usuarioId, traspaso(emisor, 300), llave);
    const segunda = await transferir(app, emisor.usuarioId, traspaso(emisor, 300), llave);

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body).toEqual(primera.body);
    expect(await transferenciasDe(emisor.usuarioId)).toHaveLength(1);
    expect(await saldo(emisor.principalId)).toBe(700);
    expect(await asientosDe(primera.body.transferenciaId)).toHaveLength(2);
  });

  it('R-4.14 la repetición de un 422 de negocio repite el rechazo aunque ahora sí haya saldo', async () => {
    const emisor = await emisorConSaldo(100);
    const llave = randomUUID();
    const primera = await transferir(app, emisor.usuarioId, traspaso(emisor, 500), llave);
    await fondear(dataSource, emisor.principalId, 1_000);
    const segunda = await transferir(app, emisor.usuarioId, traspaso(emisor, 500), llave);

    expect(primera.status).toBe(422);
    expect(primera.body).toMatchObject({ type: 'saldo-insuficiente' });
    expect(segunda.status).toBe(422);
    expect(segunda.body).toEqual(primera.body);
    expect(await transferenciasDe(emisor.usuarioId)).toHaveLength(1);
    expect(await saldo(emisor.principalId)).toBe(1_100);
  });

  it('R-4.14 D-03 el mismo cuerpo normalizado (espacios, NFC y uuid en mayúsculas) es el mismo hash', async () => {
    const emisor = await emisorConSaldo(1_000);
    const llave = randomUUID();
    const original = { ...traspaso(emisor, 50), concepto: 'Café' };
    const primera = await transferir(app, emisor.usuarioId, original, llave);
    const variante = {
      ...original,
      cuentaOrigenId: emisor.principalId.toUpperCase(),
      concepto: '  Café ',
    };
    const segunda = await transferir(app, emisor.usuarioId, variante, llave.toUpperCase());

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body).toEqual(primera.body);
    expect(await transferenciasDe(emisor.usuarioId)).toHaveLength(1);
  });

  it('R-4.15 la misma llave con otro cuerpo: 422 idempotency-key-reused sin mover dinero', async () => {
    const emisor = await emisorConSaldo(1_000);
    const llave = randomUUID();
    await transferir(app, emisor.usuarioId, traspaso(emisor, 300), llave);
    const distinta = await transferir(app, emisor.usuarioId, traspaso(emisor, 301), llave);

    expect(distinta.status).toBe(422);
    expect(distinta.body).toEqual({
      type: 'idempotency-key-reused',
      title: 'Llave de idempotencia reutilizada',
      status: 422,
      detail: 'No pudimos procesar este envío. Inicia uno nuevo.',
    });
    expect(await transferenciasDe(emisor.usuarioId)).toHaveLength(1);
    expect(await saldo(emisor.principalId)).toBe(700);
  });

  it('R-4.17 la misma llave en dos usuarios produce dos transferencias independientes', async () => {
    const ana = await emisorConSaldo(1_000);
    const beto = await emisorConSaldo(1_000);
    const llave = randomUUID();
    const deAna = await transferir(app, ana.usuarioId, traspaso(ana, 100), llave);
    const deBeto = await transferir(app, beto.usuarioId, traspaso(beto, 200), llave);

    expect(deAna.status).toBe(201);
    expect(deBeto.status).toBe(201);
    expect(deAna.body.transferenciaId).not.toBe(deBeto.body.transferenciaId);
    expect(await saldo(ana.ahorroId)).toBe(100);
    expect(await saldo(beto.ahorroId)).toBe(200);
  });

  it('R-4.16 dos peticiones simultáneas con la misma llave crean una sola transferencia y responden lo mismo', async () => {
    const emisor = await emisorConSaldo(1_000);
    const receptor = await crearUsuarioConCuentas(dataSource);
    const beneficiarioId = await altaBeneficiario(app, emisor.usuarioId, receptor.principalId);
    const datos = cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, 250);
    const llave = randomUUID();

    const [a, b] = await Promise.all([
      transferir(app, emisor.usuarioId, datos, llave),
      transferir(app, emisor.usuarioId, datos, llave),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body).toEqual(a.body);
    expect(await transferenciasDe(emisor.usuarioId)).toHaveLength(1);
    expect(await saldo(receptor.principalId)).toBe(250);
  });

  it('D-14 un rechazo previo a la fila (404) no guarda la llave: el reintento se evalúa desde cero', async () => {
    const emisor = await emisorConSaldo(1_000);
    const llave = randomUUID();
    const ajena = cuerpo(emisor.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: randomUUID() }, 10);
    expect((await transferir(app, emisor.usuarioId, ajena, llave)).status).toBe(404);
    expect((await transferir(app, emisor.usuarioId, traspaso(emisor, 10), llave)).status).toBe(201);
  });

  it('R-4.19 sin el bloqueo del usuario en 5 s: 503 retryable sin fila; el reintento con la misma llave aplica una vez', async () => {
    const emisor = await emisorConSaldo(1_000);
    const llave = randomUUID();
    const retenedor = new pg.Client({ connectionString: urlDueno() });
    await retenedor.connect();
    try {
      await retenedor.query('BEGIN');
      await retenedor.query('SELECT id FROM usuario WHERE id = $1 FOR UPDATE', [emisor.usuarioId]);
      const ocupado = await transferir(app, emisor.usuarioId, traspaso(emisor, 400), llave);
      expect(ocupado.status).toBe(503);
      expect(ocupado.headers['retry-after']).toBe('1');
      expect(ocupado.body).toMatchObject({ type: 'retryable' });
      await retenedor.query('COMMIT');
    } finally {
      await retenedor.end();
    }
    expect(await transferenciasDe(emisor.usuarioId)).toEqual([]);

    const reintento = await transferir(app, emisor.usuarioId, traspaso(emisor, 400), llave);
    const otraVez = await transferir(app, emisor.usuarioId, traspaso(emisor, 400), llave);
    expect(reintento.status).toBe(201);
    expect(otraVez.body).toEqual(reintento.body);
    expect(await transferenciasDe(emisor.usuarioId)).toHaveLength(1);
    expect(await saldo(emisor.principalId)).toBe(600);
  });
});
