// T-MOB-05: captura y confirmación del código (design.md §6.2, §6.5, R-6.15, R-6.18, DD-25,
// DD-33).
import { fireEvent, screen } from '@testing-library/react-native';
import { LLAVE_INTENTO } from '../src/auth/almacen';
import { problema } from './ayudas';
import { avanzar, escenario, hacer } from './ayudas-transferencia';
import { COMPROBANTE, CUERPO, PENDIENTE, TRANSFERENCIA } from './datos';

const RUTA_CONFIRMAR = `/transferencias/${TRANSFERENCIA}/confirmar`;
const RUTA_GET = `/transferencias/${TRANSFERENCIA}`;

afterEach(() => {
  jest.useRealTimers();
});

/** Llega a la captura con el primer `202` y responde la confirmación con `confirmar`. */
async function enCaptura(confirmar: () => Response | 'red') {
  const e = await escenario((p) => {
    if (p.ruta === '/transferencias') return Response.json(PENDIENTE, { status: 202 });
    if (p.ruta === RUTA_CONFIRMAR) return confirmar();
    return problema(404, 'not-found');
  });
  await hacer(() => e.contexto.motor.iniciar(CUERPO));
  expect(await screen.findByText('Confirma con tu código')).toBeTruthy();
  return e;
}

async function capturar(codigo: string) {
  await fireEvent.changeText(screen.getByLabelText('Código'), codigo);
  await hacer(() => fireEvent.press(screen.getByText('Confirmar')));
}

describe('captura del código [R-6.18, §6.2]', () => {
  it('§6.2: el código se guarda en el intento antes de enviar la confirmación, y 201 lo resuelve', async () => {
    const e = await enCaptura(() => Response.json(COMPROBANTE, { status: 201 }));
    await capturar('654321');

    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    const escritura = e.registro.findIndex(
      (l) => l.startsWith(`almacen.set ${LLAVE_INTENTO}=`) && l.includes('"codigo":"654321"'),
    );
    const envio = e.registro.findIndex((l) => l.startsWith(`fetch POST ${RUTA_CONFIRMAR}`));
    expect(escritura).toBeGreaterThanOrEqual(0);
    expect(envio).toBeGreaterThan(escritura);
    expect(e.a('POST', RUTA_CONFIRMAR)[0]?.cuerpo).toEqual({ codigo: '654321' });
    expect(e.almacen.datos.has(LLAVE_INTENTO)).toBe(false);
  });

  it('DD-33: un código incorrecto vuelve a la captura con los intentos restantes y sin el código guardado', async () => {
    const e = await enCaptura(() =>
      Response.json(
        {
          type: 'codigo-incorrecto',
          title: 'Código incorrecto',
          status: 422,
          transferenciaId: TRANSFERENCIA,
          intentosRestantes: 2,
        },
        { status: 422 },
      ),
    );
    await capturar('000000');
    expect(
      await screen.findByText('El código es incorrecto. Inténtalo de nuevo. Te quedan 2 intentos.'),
    ).toBeTruthy();
    expect(screen.getByText('Confirma con tu código')).toBeTruthy();
    // §6.2: el código se borra al recibir respuesta; el intento sigue en fase confirmacion.
    expect(e.intentoGuardado()).toMatchObject({ fase: 'confirmacion', codigoSimulado: '123456' });
    expect(e.intentoGuardado()).not.toHaveProperty('codigo');
  });

  it('R-6.15: un código agotado cierra el intento con el rechazo, y la siguiente lleva otra llave', async () => {
    const e = await enCaptura(() => problema(422, 'codigo-agotado'));
    await capturar('000000');
    expect(
      await screen.findByText('Agotaste los intentos del código. La transferencia fue rechazada.'),
    ).toBeTruthy();
    expect(e.almacen.datos.has(LLAVE_INTENTO)).toBe(false);

    await hacer(() => fireEvent.press(screen.getByText('Volver al saldo')));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    const llaves = e.a('POST', '/transferencias').map((p) => p.llave);
    expect(llaves).toHaveLength(2);
    expect(llaves[1]).not.toBe(llaves[0]);
  });

  it('§6.2: si la confirmación no responde, se reintenta con el mismo código, nunca la creación', async () => {
    let fallar = true;
    const e = await enCaptura(() => (fallar ? 'red' : Response.json(COMPROBANTE, { status: 201 })));
    await capturar('654321');
    expect(e.intentoGuardado()).toMatchObject({ fase: 'confirmacion', codigo: '654321' });
    for (const espera of [1_000, 2_000, 4_000, 8_000, 16_000]) await avanzar(espera);
    expect(await screen.findByText('Estado desconocido')).toBeTruthy();

    fallar = false;
    await hacer(() => fireEvent.press(screen.getByText('Verificar de nuevo')));
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    const confirmaciones = e.a('POST', RUTA_CONFIRMAR);
    expect(confirmaciones).toHaveLength(7);
    expect(new Set(confirmaciones.map((p) => JSON.stringify(p.cuerpo)))).toEqual(
      new Set([JSON.stringify({ codigo: '654321' })]),
    );
    expect(e.a('POST', '/transferencias')).toHaveLength(1);
    expect(e.a('GET', RUTA_GET)).toHaveLength(0);
  });

  it('un código que no tiene 6 dígitos no se envía', async () => {
    const e = await enCaptura(() => Response.json(COMPROBANTE, { status: 201 }));
    await capturar('12345');
    expect(screen.getByText('Debe tener 6 dígitos.')).toBeTruthy();
    expect(e.a('POST', RUTA_CONFIRMAR)).toHaveLength(0);
  });
});
