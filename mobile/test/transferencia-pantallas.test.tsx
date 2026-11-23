// T-MOB-04: pantallas Transferir, Confirmar y Estado dentro de la navegación (design.md §13.3,
// R-4.26, R-4.27, R-4.30, R-4.33).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LLAVE_INTENTO, LLAVE_REFRESH } from '../src/auth/almacen';
import { ProveedorApp } from '../src/contexto';
import { SIN_PREPARAR } from '../src/pantallas/PantallaConfirmar';
import { PantallaTransferir, SIN_BENEFICIARIOS } from '../src/pantallas/PantallaTransferir';
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
import {
  BENEFICIARIO,
  BENEFICIARIOS,
  COMPROBANTE,
  CUENTA_ORIGEN,
  CUENTAS_UUID,
  CUERPO,
  LIMITES,
  USUARIO,
} from './datos';

function api(
  transferir: (p: Peticion) => Response | Promise<Response>,
  beneficiarios = BENEFICIARIOS,
) {
  return (p: Peticion): Response | Promise<Response> => {
    if (p.ruta === '/auth/refresh') return tokens(accessDe(USUARIO), REFRESH_2);
    if (p.ruta === '/cuentas') return Response.json({ items: CUENTAS_UUID });
    if (p.ruta === '/limites') return Response.json(LIMITES);
    if (p.ruta === '/beneficiarios') return Response.json({ items: beneficiarios });
    return transferir(p);
  };
}

async function llenar(monto: string) {
  await fireEvent.press(await screen.findByLabelText('Luis · Luis Pérez · ••0099'));
  await fireEvent.changeText(screen.getByLabelText('Monto'), monto);
  await fireEvent.changeText(screen.getByLabelText('Concepto'), '  Renta ');
  await fireEvent.changeText(screen.getByLabelText('Referencia'), '1234567');
  await fireEvent.press(screen.getByText('Continuar'));
}

describe('pantalla Transferir [R-4.26, R-4.33]', () => {
  async function montar(beneficiarios = BENEFICIARIOS) {
    const prueba = contextoDePrueba(api(() => new Response(null, { status: 500 }), beneficiarios));
    const alContinuar = jest.fn();
    await render(
      <ProveedorApp value={prueba.contexto}>
        <PantallaTransferir alContinuar={alContinuar} />
      </ProveedorApp>,
    );
    return { alContinuar };
  }

  it('R-4.26: sin beneficiarios muestra "Registra un beneficiario en la web"', async () => {
    await montar([]);
    expect(await screen.findByText(SIN_BENEFICIARIOS)).toBeTruthy();
    expect(screen.queryByText('Continuar')).toBeNull();
  });

  it('R-4.26: solo ofrece beneficiarios registrados como destino', async () => {
    await montar();
    await screen.findByText('Continuar');
    // Las únicas opciones son la cuenta de origen y el beneficiario: ninguna cuenta propia
    // aparece como destino.
    expect(screen.getAllByRole('radio')).toHaveLength(CUENTAS_UUID.length + BENEFICIARIOS.length);
  });

  it('R-4.33: el monto pasa a centavos enteros con montoTextoACentavos', async () => {
    const { alContinuar } = await montar();
    await llenar('1,500.50');
    expect(alContinuar).toHaveBeenCalledWith({
      cuerpo: {
        cuentaOrigenId: CUENTA_ORIGEN,
        destino: { tipo: 'BENEFICIARIO', beneficiarioId: BENEFICIARIO },
        montoCentavos: 150_050,
        concepto: 'Renta',
        referencia: '1234567',
      },
      origen: 'Principal',
      destino: 'Luis · Luis Pérez',
    });
  });

  it('R-4.33: un monto con 3 decimales no avanza y muestra el error', async () => {
    const { alContinuar } = await montar();
    await llenar('10.005');
    expect(screen.getByText('Máximo 2 decimales')).toBeTruthy();
    expect(alContinuar).not.toHaveBeenCalled();
  });

  it('sin beneficiario elegido no avanza', async () => {
    const { alContinuar } = await montar();
    await fireEvent.press(await screen.findByText('Continuar'));
    expect(screen.getByText('Elige el beneficiario.')).toBeTruthy();
    expect(alContinuar).not.toHaveBeenCalled();
  });
});

describe('flujo completo en la navegación [R-4.27, R-4.30]', () => {
  async function hastaConfirmar(transferir: (p: Peticion) => Response | Promise<Response>) {
    const prueba = contextoDePrueba(api(transferir), { [LLAVE_REFRESH]: REFRESH_1 });
    await render(<Raiz contexto={prueba.contexto} />);
    await fireEvent.press(await screen.findByText('Transferir'));
    await llenar('1500.50');
    expect(await screen.findByText('Confirma tu transferencia')).toBeTruthy();
    expect(screen.getByText('$1,500.50')).toBeTruthy();
    return prueba;
  }

  it('R-4.30: mientras el intento no se resuelve no existe el stack con Saldo', async () => {
    const respuesta = diferido<Response>();
    const prueba = await hastaConfirmar(() => respuesta.promesa);
    await fireEvent.press(screen.getByText('Enviar'));

    expect(await screen.findByText('Verificando estado de tu transferencia…')).toBeTruthy();
    expect(screen.queryByText('Transferir')).toBeNull();
    expect(screen.queryByText('Cerrar sesión')).toBeNull();
    expect(prueba.almacen.datos.has(LLAVE_INTENTO)).toBe(true);

    respuesta.resolver(Response.json(COMPROBANTE, { status: 201 }));
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    expect(prueba.almacen.datos.has(LLAVE_INTENTO)).toBe(false);

    await fireEvent.press(screen.getByText('Volver al saldo'));
    expect(await screen.findByText('Transferir')).toBeTruthy();
    const post = prueba.peticiones.find((p) => p.ruta === '/transferencias');
    expect(post?.cuerpo).toEqual(CUERPO);
  });

  it('R-4.27: si no se puede guardar el intento, no envía y lo dice en Confirmar', async () => {
    const prueba = await hastaConfirmar(() => Response.json(COMPROBANTE, { status: 201 }));
    const original = prueba.almacen.setItemAsync;
    prueba.almacen.setItemAsync = (llave, valor) =>
      llave === LLAVE_INTENTO ? Promise.reject(new Error('Keystore')) : original(llave, valor);

    await fireEvent.press(screen.getByText('Enviar'));
    expect(await screen.findByText(SIN_PREPARAR)).toBeTruthy();
    expect(prueba.peticiones.some((p) => p.ruta === '/transferencias')).toBe(false);
  });

  it('R-4.21: un doble toque en "Enviar" crea un solo intento', async () => {
    const prueba = await hastaConfirmar(() => Response.json(COMPROBANTE, { status: 201 }));
    const enviar = screen.getByText('Enviar');
    await Promise.all([fireEvent.press(enviar), fireEvent.press(enviar)]);
    expect(await screen.findByText('Transferencia aplicada')).toBeTruthy();
    expect(prueba.peticiones.filter((p) => p.ruta === '/transferencias')).toHaveLength(1);
    expect(prueba.generarLlave).toHaveBeenCalledTimes(1);
  });
});
