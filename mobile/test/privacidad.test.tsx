// T-MOB-06: contenido oculto en segundo plano y FLAG_SECURE (design.md §13.3, DD-44, RNF-21).
import { act, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { ProveedorApp } from '../src/contexto';
import { PantallaSaldo } from '../src/pantallas/PantallaSaldo';
import { aplicarBloqueoCapturas, debeBloquearCapturas } from '../src/privacidad/capturas';
import { CapaPrivacidad } from '../src/privacidad/CapaPrivacidad';
import { contextoDePrueba } from './ayudas';
import { CUENTAS, LIMITES } from './datos';

const VARIABLE = 'EXPO_PUBLIC_BLOQUEAR_CAPTURAS';
const original = process.env[VARIABLE];

afterEach(() => {
  if (original === undefined) delete process.env[VARIABLE];
  else process.env[VARIABLE] = original;
  jest.restoreAllMocks();
});

/** Carga `App.tsx` desde cero, con expo-screen-capture simulado, como al abrir la app. */
async function cargarApp(prevenir: () => Promise<void>) {
  jest.isolateModules(() => {
    jest.doMock('expo-screen-capture', () => ({ preventScreenCaptureAsync: prevenir }));
    jest.requireActual('../src/App');
  });
  // La llamada sale al cargar el módulo; se deja correr la promesa de `aplicarBloqueoCapturas`.
  await Promise.resolve();
}

/** Saldo dentro de la capa, con `AppState` simulado para poder cambiarlo. */
async function montarSaldo() {
  let avisar: (estado: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_tipo, oyente) => {
    avisar = oyente as (estado: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  const { contexto } = contextoDePrueba((p) =>
    p.ruta === '/cuentas' ? Response.json({ items: CUENTAS }) : Response.json(LIMITES),
  );
  await render(
    <CapaPrivacidad>
      <ProveedorApp value={contexto}>
        <PantallaSaldo alVerMovimientos={jest.fn()} alTransferir={jest.fn()} />
      </ProveedorApp>
    </CapaPrivacidad>,
  );
  expect(await screen.findByText('$1,234.56')).toBeTruthy();
  return {
    cambiar: async (estado: AppStateStatus) => {
      await act(async () => avisar(estado));
    },
  };
}

describe('capa de privacidad [RNF-21, DD-44]', () => {
  it('RNF-21: al pasar a inactive pinta la capa y los saldos no son accesibles', async () => {
    // DD-44: la capa no depende de la variable; con FLAG_SECURE desactivado sigue activa.
    process.env[VARIABLE] = 'false';
    const app = await montarSaldo();
    expect(screen.queryByLabelText('Contenido oculto')).toBeNull();

    await app.cambiar('inactive');

    expect(screen.getByLabelText('Contenido oculto')).toBeTruthy();
    expect(screen.queryByText('$1,234.56')).toBeNull();
    expect(screen.queryByText('Límite de hoy')).toBeNull();
    // Siguen montados debajo, solo ocultos a la accesibilidad.
    expect(screen.getByText('$1,234.56', { includeHiddenElements: true })).toBeTruthy();
  });

  it('RNF-21: en background también oculta, y al volver a active quita la capa', async () => {
    const app = await montarSaldo();
    await app.cambiar('background');
    expect(screen.getByLabelText('Contenido oculto')).toBeTruthy();
    expect(screen.queryByText('$1,234.56')).toBeNull();

    await app.cambiar('active');
    expect(screen.queryByLabelText('Contenido oculto')).toBeNull();
    expect(screen.getByText('$1,234.56')).toBeTruthy();
  });
});

describe('FLAG_SECURE con expo-screen-capture [DD-44]', () => {
  it('DD-44: con la variable ausente se llama a preventScreenCaptureAsync', async () => {
    const prevenir = jest.fn(() => Promise.resolve());
    expect(await aplicarBloqueoCapturas(undefined, prevenir)).toBe(true);
    expect(prevenir).toHaveBeenCalledTimes(1);
  });

  it('DD-44: con la variable en false no se bloquea, para poder grabar el video', async () => {
    const prevenir = jest.fn(() => Promise.resolve());
    expect(await aplicarBloqueoCapturas('false', prevenir)).toBe(false);
    expect(prevenir).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, true],
    ['', true],
    ['true', true],
    ['cualquier cosa', true],
    ['false', false],
    [' FALSE ', false],
  ])('DD-44: EXPO_PUBLIC_BLOQUEAR_CAPTURAS=%p bloquea: %p', (valor, esperado) => {
    expect(debeBloquearCapturas(valor)).toBe(esperado);
  });

  it('DD-44: un fallo del módulo nativo no detiene la app', async () => {
    const prevenir = jest.fn(() => Promise.reject(new Error('sin módulo')));
    await expect(aplicarBloqueoCapturas(undefined, prevenir)).resolves.toBe(false);
  });

  it('DD-44: la app, al cargar sin la variable, llama a preventScreenCaptureAsync', async () => {
    delete process.env[VARIABLE];
    const prevenir = jest.fn(() => Promise.resolve());
    await cargarApp(prevenir);
    expect(prevenir).toHaveBeenCalledTimes(1);
  });

  it('DD-44: la app, al cargar con la variable en false, no lo llama', async () => {
    process.env[VARIABLE] = 'false';
    const prevenir = jest.fn(() => Promise.resolve());
    await cargarApp(prevenir);
    expect(prevenir).not.toHaveBeenCalled();
  });
});
