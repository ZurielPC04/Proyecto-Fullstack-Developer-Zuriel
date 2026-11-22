import type { Beneficiario, Cuenta, Limites } from '@billetera/shared';
import { http, HttpResponse } from 'msw';
import { servidor, tokens } from './servidor';

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
