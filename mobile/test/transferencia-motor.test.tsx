// T-MOB-04: motor de reintentos con temporizadores falsos (design.md §13.3, §12.7, D-17, DD-45).
import { fireEvent, screen } from '@testing-library/react-native';
import { LLAVE_INTENTO } from '../src/auth/almacen';
import { problema } from './ayudas';
import { avanzar, escenario, hacer, respuestas, sinRespuesta } from './ayudas-transferencia';
import { COMPROBANTE, CUERPO, USUARIO } from './datos';

// Textos literales de R-4.28 y R-4.30, no las constantes de la pantalla: un cambio de texto da rojo.
const VERIFICANDO = 'Verificando estado de tu transferencia…';
const DESCONOCIDO = 'Estado desconocido';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const aplicada = () => Response.json(COMPROBANTE, { status: 201 });

afterEach(() => {
  jest.useRealTimers();
});

/** R-4.28: nunca se dice que la transferencia no se hizo. */
function sinFallo() {
  expect(screen.queryByText(/fall/i, { includeHiddenElements: true })).toBeNull();
}

describe('motor de reintentos [R-4.28, RNF-26]', () => {
  it('RNF-26 R-4.32: falla dos veces y a la tercera responde 201; las tres llevan la misma llave, se muestra el comprobante y se borra el intento', async () => {
    const e = await escenario(respuestas('red', 'red', aplicada()));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));

    const posts = () => e.a('POST', '/transferencias');
    expect(posts()).toHaveLength(1);
    expect(screen.getByText(VERIFICANDO)).toBeTruthy();
    sinFallo();

    await avanzar(999);
    expect(posts()).toHaveLength(1);
    await avanzar(1);
    expect(posts()).toHaveLength(2);
    sinFallo();

    await avanzar(1_999);
    expect(posts()).toHaveLength(2);
    await avanzar(1);
    expect(posts()).toHaveLength(3);

    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    const llaves = posts().map((p) => p.llave);
    expect(llaves[0]).toMatch(UUID);
    expect(new Set(llaves)).toEqual(new Set([llaves[0]]));
    expect(posts().every((p) => JSON.stringify(p.cuerpo) === JSON.stringify(CUERPO))).toBe(true);
    // R-4.32: resuelto, el intento se borra.
    expect(e.almacen.datos.has(LLAVE_INTENTO)).toBe(false);
    sinFallo();
  });

  it('R-4.27: el intento se escribe en SecureStore antes de enviar la primera petición', async () => {
    const e = await escenario(respuestas(aplicada()));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));

    const escritura = e.registro.findIndex((l) => l.startsWith(`almacen.set ${LLAVE_INTENTO}=`));
    const envio = e.registro.findIndex((l) => l.startsWith('fetch POST /transferencias'));
    expect(escritura).toBeGreaterThanOrEqual(0);
    expect(envio).toBeGreaterThan(escritura);
    const guardado = JSON.parse(e.registro[escritura]!.split('=').slice(1).join('='));
    expect(guardado).toEqual({
      usuarioId: USUARIO,
      llave: e.a('POST', '/transferencias')[0]!.llave,
      cuerpo: CUERPO,
      fase: 'creacion',
    });
  });

  it('R-4.27: si no se puede guardar el intento, no se envía nada', async () => {
    const e = await escenario(respuestas(aplicada()));
    e.almacen.setItemAsync = jest.fn().mockRejectedValue(new Error('Keystore'));
    let error: unknown = null;
    await hacer(() => e.contexto.motor.iniciar(CUERPO).catch((x: unknown) => (error = x)));
    expect(error).toBeInstanceOf(Error);
    expect(e.a('POST', '/transferencias')).toHaveLength(0);
    expect(e.contexto.motor.obtenerEstado().tipo).toBe('inactivo');
  });

  it('R-4.30: espera 1, 2, 4, 8 y 16 s y al agotarse muestra "Estado desconocido"', async () => {
    let fallar = true;
    const e = await escenario(() => (fallar ? 'red' : aplicada()));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    const posts = () => e.a('POST', '/transferencias');

    let enviados = 1;
    for (const espera of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      await avanzar(espera - 1);
      expect(posts()).toHaveLength(enviados);
      expect(screen.getByText(VERIFICANDO)).toBeTruthy();
      await avanzar(1);
      enviados += 1;
      expect(posts()).toHaveLength(enviados);
    }

    expect(await screen.findByText(DESCONOCIDO)).toBeTruthy();
    sinFallo();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('Verificar de nuevo')).toBeTruthy();
    // El intento sigue guardado: la operación no está resuelta.
    expect(e.almacen.datos.has(LLAVE_INTENTO)).toBe(true);

    // Sin turnos pendientes: no sale nada más aunque pase el tiempo.
    await avanzar(60_000);
    expect(posts()).toHaveLength(6);

    fallar = false;
    await hacer(() => fireEvent.press(screen.getByText('Verificar de nuevo')));
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    expect(posts()).toHaveLength(7);
    expect(new Set(posts().map((p) => p.llave)).size).toBe(1);
  });

  it('R-4.29: un 401 a mitad refresca y sigue con la misma llave sin consumir un turno', async () => {
    const e = await escenario(respuestas('red', 401, 'red', 'red', 'red', 'red', 'red'));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    const posts = () => e.a('POST', '/transferencias');
    expect(posts()).toHaveLength(1);

    // Turno 2: 401, refresh y repetición inmediata dentro del mismo turno.
    await avanzar(1_000);
    expect(posts()).toHaveLength(3);
    expect(e.refrescos()).toBe(2); // uno al restaurar la sesión y otro por el 401
    expect(posts()[2]!.autorizacion).not.toBe(posts()[1]!.autorizacion);

    // Quedan intactas las esperas de 2, 4, 8 y 16 s.
    for (const espera of [2_000, 4_000, 8_000, 16_000]) await avanzar(espera);
    expect(await screen.findByText(DESCONOCIDO)).toBeTruthy();
    expect(posts()).toHaveLength(7);
    expect(new Set(posts().map((p) => p.llave)).size).toBe(1);
    sinFallo();
  });

  it('DD-45: un segundo 401 en el mismo turno, tras un refresh exitoso, consume el turno', async () => {
    const e = await escenario(respuestas(401, 401, aplicada()));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    expect(e.a('POST', '/transferencias')).toHaveLength(2);
    await avanzar(999);
    expect(e.a('POST', '/transferencias')).toHaveLength(2);
    await avanzar(1);
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
  });

  it('DD-45: un 5xx se reintenta con la misma llave', async () => {
    const e = await escenario(respuestas(problema(500, 'internal-error'), aplicada()));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    await avanzar(1_000);
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    const posts = e.a('POST', '/transferencias');
    expect(posts).toHaveLength(2);
    expect(posts[1]!.llave).toBe(posts[0]!.llave);
  });

  it('D-17: 15 s sin respuesta abortan la petición y se reintenta a 1 s', async () => {
    const e = await escenario((p) =>
      e.a('POST', '/transferencias').length === 1 ? sinRespuesta(p) : aplicada(),
    );
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    await avanzar(14_999);
    expect(e.a('POST', '/transferencias')).toHaveLength(1);
    expect(screen.getByText(VERIFICANDO)).toBeTruthy();
    await avanzar(1);
    await avanzar(999);
    expect(e.a('POST', '/transferencias')).toHaveLength(1);
    await avanzar(1);
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    sinFallo();
  });

  it('D-17: si NetInfo detecta que volvió la conexión, reintenta de inmediato', async () => {
    let fallar = true;
    const e = await escenario(() => (fallar ? 'red' : aplicada()));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    await avanzar(1_000);
    await avanzar(2_000);
    expect(e.a('POST', '/transferencias')).toHaveLength(3);

    // A mitad de la espera de 4 s vuelve la red.
    await avanzar(500);
    fallar = false;
    await hacer(() => e.conexion.volver());
    expect(e.a('POST', '/transferencias')).toHaveLength(4);
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
  });

  it('R-4.12 R-4.32: un 422 muestra el motivo sin comprobante y borra el intento', async () => {
    const e = await escenario(respuestas(problema(422, 'saldo-insuficiente')));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    expect(await screen.findByText('Transferencia rechazada')).toBeTruthy();
    expect(
      screen.getByText('La cuenta origen no tiene saldo suficiente para esta transferencia.'),
    ).toBeTruthy();
    expect(screen.queryByText('Transferencia aplicada')).toBeNull();
    expect(e.almacen.datos.has(LLAVE_INTENTO)).toBe(false);
  });

  it('§13.3: otro 4xx (404) es definitivo: muestra el mensaje y borra el intento', async () => {
    const e = await escenario(respuestas(problema(404, 'not-found')));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    expect(await screen.findByText('No encontramos lo que buscas.')).toBeTruthy();
    expect(e.a('POST', '/transferencias')).toHaveLength(1);
    expect(e.almacen.datos.has(LLAVE_INTENTO)).toBe(false);
  });

  it('R-4.11: el comprobante muestra los datos con los montos de R-2.5', async () => {
    const e = await escenario(respuestas(aplicada()));
    await hacer(() => e.contexto.motor.iniciar(CUERPO));
    expect(await screen.findByText('$1,500.50')).toBeTruthy();
    expect(screen.getByText('Principal · ••0001')).toBeTruthy();
    expect(screen.getByText('Luis · Luis Pérez · ••0099')).toBeTruthy();
    expect(screen.getByText(COMPROBANTE.transferenciaId)).toBeTruthy();
  });
});
