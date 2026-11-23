// T-MOB-05: reanudación al abrir y verificación del `202` de reintento (design.md §6.2, §12.7,
// §13.3, R-4.31, R-4.32, DD-32).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LLAVE_INTENTO, LLAVE_REFRESH } from '../src/auth/almacen';
import { Raiz } from '../src/Raiz';
import {
  REFRESH_1,
  REFRESH_2,
  accessDe,
  contextoDePrueba,
  diferido,
  type Peticion,
  tokens,
} from './ayudas';
import { avanzar, escenario, hacer, respuestas } from './ayudas-transferencia';
import {
  COMPROBANTE,
  CUERPO,
  CUENTAS_UUID,
  LIMITES,
  LLAVE_GUARDADA,
  OTRO_USUARIO,
  PENDIENTE,
  TRANSFERENCIA,
  USUARIO,
  intentoEnConfirmacion,
  intentoGuardado,
  transferencia,
} from './datos';

const RUTA_GET = `/transferencias/${TRANSFERENCIA}`;
const RUTA_CONFIRMAR = `/transferencias/${TRANSFERENCIA}/confirmar`;

afterEach(() => {
  jest.useRealTimers();
});

/** La raíz con una sesión guardada de USUARIO y el intento dado en SecureStore. */
async function abrirApp(
  intento: string,
  transferencias: (p: Peticion) => Response | Promise<Response>,
) {
  const prueba = contextoDePrueba(
    (p) => {
      if (p.ruta === '/auth/refresh') return tokens(accessDe(USUARIO), REFRESH_2);
      if (p.ruta === '/cuentas') return Response.json({ items: CUENTAS_UUID });
      if (p.ruta === '/limites') return Response.json(LIMITES);
      return transferencias(p);
    },
    { [LLAVE_REFRESH]: REFRESH_1, [LLAVE_INTENTO]: intento },
  );
  await render(<Raiz contexto={prueba.contexto} />);
  const indice = (prefijo: string) => prueba.registro.findIndex((l) => l.startsWith(prefijo));
  return { ...prueba, indice };
}

describe('reanudación al abrir la app [R-4.31]', () => {
  it('R-4.31: con un intento pendiente del usuario, lo resuelve antes de mostrar el saldo', async () => {
    const respuesta = diferido<Response>();
    const app = await abrirApp(intentoGuardado(), () => respuesta.promesa);

    expect(await screen.findByText('Verificando estado de tu transferencia…')).toBeTruthy();
    expect(screen.queryByText('Transferir')).toBeNull();
    expect(app.peticiones.some((p) => p.ruta === '/cuentas')).toBe(false);
    const post = app.peticiones.find((p) => p.ruta === '/transferencias');
    expect(post?.llave).toBe(LLAVE_GUARDADA);

    respuesta.resolver(Response.json(COMPROBANTE, { status: 201 }));
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    expect(app.almacen.datos.has(LLAVE_INTENTO)).toBe(false);

    await fireEvent.press(screen.getByText('Volver al saldo'));
    expect(await screen.findByText('Transferir')).toBeTruthy();
    expect(app.indice('fetch POST /transferencias')).toBeLessThan(app.indice('fetch GET /cuentas'));
  });

  it('R-4.31: el intento de otro usuario no se envía y se borra', async () => {
    const app = await abrirApp(intentoGuardado({ usuarioId: OTRO_USUARIO }), () =>
      Response.json(COMPROBANTE, { status: 201 }),
    );
    expect(await screen.findByText('Transferir')).toBeTruthy();
    expect(app.peticiones.some((p) => p.ruta.startsWith('/transferencias'))).toBe(false);
    expect(app.almacen.datos.has(LLAVE_INTENTO)).toBe(false);
  });

  it('§13.3: un intento ilegible no se envía y se borra', async () => {
    const app = await abrirApp('{"usuarioId":', () => Response.json(COMPROBANTE, { status: 201 }));
    expect(await screen.findByText('Transferir')).toBeTruthy();
    expect(app.peticiones.some((p) => p.ruta.startsWith('/transferencias'))).toBe(false);
    expect(app.almacen.datos.has(LLAVE_INTENTO)).toBe(false);
  });

  it('§6.2: en fase confirmacion sin código consulta el GET y nunca reenvía la creación', async () => {
    const app = await abrirApp(intentoEnConfirmacion(), (p) =>
      p.ruta === RUTA_GET
        ? Response.json(transferencia('PENDIENTE_CONFIRMACION'))
        : Response.json(COMPROBANTE, { status: 201 }),
    );
    expect(await screen.findByText('Confirma con tu código')).toBeTruthy();
    expect(app.peticiones.filter((p) => p.ruta === RUTA_GET)).toHaveLength(1);
    expect(app.peticiones.some((p) => p.ruta === '/transferencias')).toBe(false);
    // DD-25: el `codigoSimulado` se recupera del intento guardado, no de la respuesta.
    expect(screen.getByText('Modo de prueba · código: 123456')).toBeTruthy();
  });

  it('§6.2: en fase confirmacion con código en vuelo reenvía la confirmación con ese código', async () => {
    const app = await abrirApp(intentoEnConfirmacion({ codigo: '654321' }), (p) =>
      p.ruta === RUTA_CONFIRMAR
        ? Response.json(COMPROBANTE, { status: 201 })
        : Response.json(COMPROBANTE, { status: 201 }),
    );
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    const confirmaciones = app.peticiones.filter((p) => p.ruta === RUTA_CONFIRMAR);
    expect(confirmaciones.map((p) => p.cuerpo)).toEqual([{ codigo: '654321' }]);
    expect(app.peticiones.some((p) => p.ruta === '/transferencias')).toBe(false);
    expect(app.almacen.datos.has(LLAVE_INTENTO)).toBe(false);
  });

  it('DD-32: al reanudar en fase creacion, un 202 consulta el estado real antes de pedir el código', async () => {
    const app = await abrirApp(intentoGuardado(), (p) =>
      p.ruta === RUTA_GET
        ? Response.json(transferencia('APLICADA'))
        : Response.json({ ...PENDIENTE, codigoSimulado: undefined }, { status: 202 }),
    );
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    expect(screen.queryByText('Confirma con tu código')).toBeNull();
    expect(app.indice('fetch GET ' + RUTA_GET)).toBeGreaterThan(
      app.indice('fetch POST /transferencias'),
    );
  });
});

describe('reintentos en fase confirmacion [§6.2, DD-32]', () => {
  it('§6.2: si el GET no responde, se reintenta el GET y nunca la creación', async () => {
    let fallar = true;
    const e = await escenario(
      (p) => (p.ruta === RUTA_GET && !fallar ? Response.json(transferencia('APLICADA')) : 'red'),
      { [LLAVE_INTENTO]: intentoEnConfirmacion() },
    );
    await hacer(() => e.contexto.motor.reanudar());
    for (const espera of [1_000, 2_000, 4_000, 8_000, 16_000]) await avanzar(espera);
    expect(await screen.findByText('Estado desconocido')).toBeTruthy();
    expect(e.a('GET', RUTA_GET)).toHaveLength(6);

    fallar = false;
    await hacer(() => fireEvent.press(screen.getByText('Verificar de nuevo')));
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    expect(e.a('POST', '/transferencias')).toHaveLength(0);
  });

  it('§6.2: si la confirmación no responde, se reintenta con el mismo código', async () => {
    const e = await escenario(
      respuestas('red', 'red', Response.json(COMPROBANTE, { status: 201 })),
      { [LLAVE_INTENTO]: intentoEnConfirmacion({ codigo: '654321' }) },
    );
    await hacer(() => e.contexto.motor.reanudar());
    await avanzar(1_000);
    await avanzar(2_000);
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    expect(e.a('POST', RUTA_CONFIRMAR).map((p) => p.cuerpo)).toEqual([
      { codigo: '654321' },
      { codigo: '654321' },
      { codigo: '654321' },
    ]);
    expect(e.a('POST', '/transferencias')).toHaveLength(0);
  });
});

describe('el 202 de un reintento [DD-32]', () => {
  const pendienteRepetido = () =>
    Response.json({ ...PENDIENTE, codigoSimulado: undefined }, { status: 202 });

  it('DD-32: un 202 por reintento consulta GET /transferencias/{id}; si ya se aplicó, muestra el comprobante', async () => {
    const e = await escenario((p) => {
      if (p.ruta === RUTA_GET) return Response.json(transferencia('APLICADA'));
      return e.a('POST', '/transferencias').length === 1 ? 'red' : pendienteRepetido();
    });
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    await avanzar(1_000);
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    expect(screen.queryByText('Confirma con tu código')).toBeNull();
    expect(e.a('GET', RUTA_GET)).toHaveLength(1);
    expect(e.almacen.datos.has(LLAVE_INTENTO)).toBe(false);
  });

  it('DD-32: un 202 por reintento que sigue pendiente muestra la captura con el codigoExpiraEn real', async () => {
    const e = await escenario((p) => {
      if (p.ruta === RUTA_GET) return Response.json(transferencia('PENDIENTE_CONFIRMACION'));
      return e.a('POST', '/transferencias').length === 1 ? 'red' : pendienteRepetido();
    });
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    await avanzar(1_000);
    expect(await screen.findByText('Confirma con tu código')).toBeTruthy();
    expect(e.a('GET', RUTA_GET)).toHaveLength(1);
    expect(e.intentoGuardado()).toMatchObject({
      fase: 'confirmacion',
      transferenciaId: TRANSFERENCIA,
      codigoExpiraEn: '2026-11-22T18:40:00.000Z',
    });
  });

  it('DD-32: un 202 por reintento de una transferencia rechazada muestra el motivo', async () => {
    const e = await escenario((p) => {
      if (p.ruta === RUTA_GET) return Response.json(transferencia('RECHAZADA'));
      return e.a('POST', '/transferencias').length === 1 ? 'red' : pendienteRepetido();
    });
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    await avanzar(1_000);
    expect(
      await screen.findByText('El código expiró. La transferencia fue rechazada.'),
    ).toBeTruthy();
    expect(e.almacen.datos.has(LLAVE_INTENTO)).toBe(false);
  });

  it('R-6.18 R-4.32: el primer 202 del intento lleva directo a la captura, ya en fase confirmacion', async () => {
    const e = await escenario(respuestas(Response.json(PENDIENTE, { status: 202 })));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    expect(await screen.findByText('Confirma con tu código')).toBeTruthy();
    expect(screen.getByText('Modo de prueba · código: 123456')).toBeTruthy();
    expect(e.a('GET', RUTA_GET)).toHaveLength(0);
    // §6.2: guardado antes de mostrar la captura, con el `codigoSimulado` (DD-25).
    expect(e.intentoGuardado()).toMatchObject({
      fase: 'confirmacion',
      transferenciaId: TRANSFERENCIA,
      codigoSimulado: '123456',
    });
  });
});
