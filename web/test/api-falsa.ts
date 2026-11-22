import type { Beneficiario, Comprobante, Cuenta, Limites } from '@billetera/shared';
import { http, HttpResponse } from 'msw';
import { INSTANTE, servidor, tokens } from './servidor';

export const ID_PRINCIPAL = '0b6f1f8e-4f0c-4b8e-9a51-7d0e0f6a2c11';
export const ID_AHORRO = '1c7a2e9f-5a1d-4c9f-8b62-8e1f1a7b3d22';

export const PRINCIPAL: Cuenta = {
  id: ID_PRINCIPAL,
  nombre: 'Principal',
  clabe: '999180000000000015',
  saldoCentavos: 123456,
};

export const AHORRO: Cuenta = {
  id: ID_AHORRO,
  nombre: 'Ahorro',
  clabe: '999180000000000028',
  saldoCentavos: 5,
};

export const LIMITES: Limites = {
  limiteCentavos: 5000000,
  consumidoCentavos: 4999900,
  disponibleCentavos: 100,
  dia: '2026-11-22',
  reiniciaEn: '2026-11-23T06:00:00.000000Z',
};

/** La cookie de refresh es válida: la ruta protegida obtiene un access al cargar. */
export function conSesion() {
  servidor.use(http.post('/api/auth/refresh', () => tokens('access-1')));
}

export function conCuentas(cuentas: Cuenta[] = [PRINCIPAL, AHORRO], limites: Limites = LIMITES) {
  servidor.use(
    http.get('/api/cuentas', () => HttpResponse.json({ items: cuentas })),
    http.get('/api/limites', () => HttpResponse.json(limites)),
  );
}

export function conBeneficiarios(items: Beneficiario[]) {
  servidor.use(http.get('/api/beneficiarios', () => HttpResponse.json({ items })));
}

export const BETO: Beneficiario = {
  id: '3e9c4a1b-7c3f-4e1b-8d84-a03b3c9d5f44',
  nombre: 'Beto Pérez',
  alias: 'Beto',
  clabe: '999180000000000031',
  esCuentaPropia: false,
};

export const ID_TRANSFERENCIA = '5abe6c3d-9e5b-4a3d-8fa6-c25d5ebf7166';

/** DD-34: comprobante de una transferencia de $1.15 a Beto desde Principal. */
export const COMPROBANTE: Comprobante = {
  transferenciaId: ID_TRANSFERENCIA,
  estado: 'APLICADA',
  tipo: 'TERCERO',
  montoCentavos: 115,
  concepto: 'Renta',
  referencia: '0042',
  origen: { cuentaId: ID_PRINCIPAL, nombre: 'Principal', clabeTerminacion: '0015' },
  destino: { etiqueta: 'Beto', nombre: 'Beto Pérez', clabeTerminacion: '0031' },
  creadaEn: INSTANTE,
  aplicadaEn: INSTANTE,
};

/** Sesión, cuentas, límite y beneficiarios: lo que necesita la ruta `/transferir`. */
export function conDatosDeTransferencia(beneficiarios: Beneficiario[] = [BETO]) {
  conSesion();
  conCuentas();
  conBeneficiarios(beneficiarios);
}

export type PeticionRegistrada = { llave: string | null; cuerpo: unknown };

/**
 * `POST /transferencias`: registra la llave y el cuerpo de cada petición (RNF-25) y responde
 * con lo que devuelva `responder`, que recibe el número de petición empezando en 1.
 */
export function transferenciasResponden(
  responder: (n: number) => Response | Promise<Response>,
): PeticionRegistrada[] {
  const peticiones: PeticionRegistrada[] = [];
  servidor.use(
    http.post('/api/transferencias', async ({ request }) => {
      peticiones.push({
        llave: request.headers.get('Idempotency-Key'),
        cuerpo: await request.json(),
      });
      return responder(peticiones.length);
    }),
  );
  return peticiones;
}

/** Una promesa que la prueba resuelve cuando quiere: mantiene una petición en vuelo. */
export function puerta() {
  let abrir: () => void = () => undefined;
  const abierta = new Promise<void>((resolver) => {
    abrir = resolver;
  });
  return { abierta, abrir };
}
