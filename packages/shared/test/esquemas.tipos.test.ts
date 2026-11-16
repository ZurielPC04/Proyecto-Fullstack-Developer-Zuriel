import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  esquemaBeneficiario,
  esquemaConfirmacion,
  esquemaLogin,
  esquemaQueryMovimientos,
  esquemaRefresh,
  esquemaRegistro,
  esquemaTransferencia,
  type SolicitudBeneficiario,
  type SolicitudConfirmacion,
  type SolicitudLogin,
  type SolicitudRefresh,
  type SolicitudRegistro,
  type SolicitudTransferencia,
  type operations,
} from '../src/index.js';

// DD-27 y §4.3: expectTypeOf solo falla en `npm run typecheck`; en vitest siempre pasa.
describe('esquemas alineados al contrato', () => {
  it('RNF-18 DD-27 registro: z.input y z.output contra SolicitudRegistro', () => {
    type E = typeof esquemaRegistro;
    expectTypeOf<z.input<E>>().toExtend<SolicitudRegistro>();
    expectTypeOf<SolicitudRegistro>().toExtend<z.input<E>>();
    expectTypeOf<z.output<E>>().toExtend<SolicitudRegistro>();
    expectTypeOf<SolicitudRegistro>().toExtend<z.output<E>>();
  });

  it('RNF-18 DD-27 login: z.input y z.output contra SolicitudLogin', () => {
    type E = typeof esquemaLogin;
    expectTypeOf<z.input<E>>().toExtend<SolicitudLogin>();
    expectTypeOf<SolicitudLogin>().toExtend<z.input<E>>();
    expectTypeOf<z.output<E>>().toExtend<SolicitudLogin>();
    expectTypeOf<SolicitudLogin>().toExtend<z.output<E>>();
  });

  it('RNF-18 DD-27 refresh: z.input y z.output contra SolicitudRefresh', () => {
    type E = typeof esquemaRefresh;
    expectTypeOf<z.input<E>>().toExtend<SolicitudRefresh>();
    expectTypeOf<SolicitudRefresh>().toExtend<z.input<E>>();
    expectTypeOf<z.output<E>>().toExtend<SolicitudRefresh>();
    expectTypeOf<SolicitudRefresh>().toExtend<z.output<E>>();
  });

  it('RNF-18 DD-27 beneficiario: z.input y z.output contra SolicitudBeneficiario', () => {
    type E = typeof esquemaBeneficiario;
    expectTypeOf<z.input<E>>().toExtend<SolicitudBeneficiario>();
    expectTypeOf<SolicitudBeneficiario>().toExtend<z.input<E>>();
    expectTypeOf<z.output<E>>().toExtend<SolicitudBeneficiario>();
    expectTypeOf<SolicitudBeneficiario>().toExtend<z.output<E>>();
  });

  it('RNF-18 DD-27 DD-26 transferencia: z.input y z.output contra SolicitudTransferencia', () => {
    type E = typeof esquemaTransferencia;
    expectTypeOf<z.input<E>>().toExtend<SolicitudTransferencia>();
    expectTypeOf<SolicitudTransferencia>().toExtend<z.input<E>>();
    expectTypeOf<z.output<E>>().toExtend<SolicitudTransferencia>();
    expectTypeOf<SolicitudTransferencia>().toExtend<z.output<E>>();
  });

  it('RNF-18 DD-27 confirmación: z.input y z.output contra SolicitudConfirmacion', () => {
    type E = typeof esquemaConfirmacion;
    expectTypeOf<z.input<E>>().toExtend<SolicitudConfirmacion>();
    expectTypeOf<SolicitudConfirmacion>().toExtend<z.input<E>>();
    expectTypeOf<z.output<E>>().toExtend<SolicitudConfirmacion>();
    expectTypeOf<SolicitudConfirmacion>().toExtend<z.output<E>>();
  });

  it('RNF-18 DD-27 R-5.2 query del historial: z.output extiende al tipo generado', () => {
    type Query = NonNullable<operations['listarMovimientos']['parameters']['query']>;
    expectTypeOf<z.output<typeof esquemaQueryMovimientos>>().toExtend<Query>();
  });
});
