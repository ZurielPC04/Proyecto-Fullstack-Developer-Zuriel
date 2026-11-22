import type {
  Beneficiario,
  Comprobante,
  Cuenta,
  Limites,
  PendienteConfirmacion,
  Transferencia,
} from '@billetera/shared';
import { http, HttpResponse } from 'msw';
import { accessDe, INSTANTE, servidor, tokens } from './servidor';

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

export const USUARIO_A = '6b1e0c2d-1f3a-4b5c-8d6e-7f8091a2b3c4';
export const USUARIO_B = '7c2f1d3e-2a4b-4c6d-9e7f-8091a2b3c4d5';

/** La cookie de refresh es válida: la ruta protegida obtiene un access del usuario al cargar. */
export function conSesion(usuarioId: string = USUARIO_A) {
  servidor.use(http.post('/api/auth/refresh', () => tokens(accessDe(usuarioId))));
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

const EXPIRA = '2026-11-22T18:05:00.000000Z';

/** R-6.8: primera respuesta `202` de una transferencia a tercero de $15,000.00. */
export const PENDIENTE: PendienteConfirmacion = {
  transferenciaId: ID_TRANSFERENCIA,
  estado: 'PENDIENTE_CONFIRMACION',
  montoCentavos: 1500000,
  codigoExpiraEn: EXPIRA,
  codigoSimulado: '123456',
};

/** DD-25: la repetición del `202` con la misma llave no trae `codigoSimulado`. */
export const PENDIENTE_REPETIDA: PendienteConfirmacion = {
  transferenciaId: ID_TRANSFERENCIA,
  estado: 'PENDIENTE_CONFIRMACION',
  montoCentavos: 1500000,
  codigoExpiraEn: EXPIRA,
};

/** `GET /transferencias/{id}` de la transferencia pendiente, en el estado dado (§6.2). */
export function transferenciaEnEstado(
  estado: Transferencia['estado'],
  motivoRechazo: Transferencia['motivoRechazo'] = null,
): Transferencia {
  return {
    id: ID_TRANSFERENCIA,
    estado,
    tipo: 'TERCERO',
    montoCentavos: 1500000,
    concepto: 'Renta',
    referencia: '0042',
    origen: COMPROBANTE.origen,
    destino: COMPROBANTE.destino,
    creadaEn: INSTANTE,
    aplicadaEn: estado === 'APLICADA' ? INSTANTE : null,
    motivoRechazo,
    codigoExpiraEn: estado === 'PENDIENTE_CONFIRMACION' ? EXPIRA : null,
  };
}

/** `POST /transferencias/{id}/confirmar`: registra cada código enviado. */
export function confirmacionesResponden(
  responder: (n: number) => Response | Promise<Response>,
): string[] {
  const codigos: string[] = [];
  servidor.use(
    http.post('/api/transferencias/:id/confirmar', async ({ request }) => {
      codigos.push(((await request.json()) as { codigo: string }).codigo);
      return responder(codigos.length);
    }),
  );
  return codigos;
}

/** `GET /transferencias/{id}`: cuenta las consultas del estado real. */
export function estadoResponde(responder: (n: number) => Response | Promise<Response>) {
  const consultas = { n: 0 };
  servidor.use(
    http.get('/api/transferencias/:id', () => {
      consultas.n++;
      return responder(consultas.n);
    }),
  );
  return consultas;
}
