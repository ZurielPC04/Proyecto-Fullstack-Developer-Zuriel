import { formatearMXN, type Comprobante } from '@billetera/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/errores';
import { mensajeDeError } from '../api/mensaje-error';
import { ErrorConReintento } from '../componentes/ErrorConReintento';
import { useBeneficiarios } from '../consultas/beneficiarios';
import { useCuentas, useLimites } from '../consultas/cuentas';
import { formatearFecha } from '../formato/fecha';
import {
  borrarIntento,
  guardarIntento,
  leerIntento,
  type IntentoGuardado,
} from './almacen-intento';
import {
  comprobanteDeTransferencia,
  confirmarTransferencia,
  crearTransferencia,
  esResultadoIncierto,
  mensajeDeMotivo,
  obtenerTransferencia,
} from './api-transferencia';
import { FormularioTransferencia, type DatosCongelados } from './FormularioTransferencia';
import type { ValoresFormulario } from './formulario';
import { PantallaCodigo } from './PantallaCodigo';

/** Un intento: la llave nace al pasar a la confirmación y muere al volver a editar (R-4.20, R-4.24). */
type Intento = { llave: string; datos: DatosCongelados; valores: ValoresFormulario };

/** Un intento que recibió un 202 (§6.2, fase `confirmacion`). */
type Pendiente = Intento & {
  transferenciaId: string;
  codigoExpiraEn: string;
  codigoSimulado?: string;
};

/** Máquina del intento de transferencia (design.md §13.2, D-16, DD-25, DD-32). */
type Estado =
  | { fase: 'editando'; valores: ValoresFormulario | null }
  | ({ fase: 'confirmando' } & Intento)
  | ({ fase: 'enviando' } & Intento)
  | ({ fase: 'errorReintentable'; mensaje: string } & Intento)
  | ({
      fase: 'capturandoCodigo';
      error: string | null;
      intentosRestantes: number | null;
    } & Pendiente)
  | ({ fase: 'confirmandoCodigo'; codigo: string } & Pendiente)
  | ({ fase: 'errorConfirmacion'; codigo: string; mensaje: string } & Pendiente)
  | ({ fase: 'verificandoEstado' } & Pendiente)
  | ({ fase: 'errorVerificacion'; mensaje: string } & Pendiente)
  | { fase: 'verificandoAnterior' }
  | { fase: 'comprobante'; comprobante: Comprobante }
  | { fase: 'rechazado'; mensaje: string };

const soloIntento = ({ llave, datos, valores }: Intento): Intento => ({ llave, datos, valores });

function soloPendiente(p: Pendiente): Pendiente {
  const { transferenciaId, codigoExpiraEn, codigoSimulado } = p;
  return {
    ...soloIntento(p),
    transferenciaId,
    codigoExpiraEn,
    ...(codigoSimulado === undefined ? {} : { codigoSimulado }),
  };
}

/**
 * §6.2: la fase `confirmacion` se guarda antes de mostrar la captura del código, con el
 * `codigoSimulado` si vino (DD-25). El código capturado se guarda solo mientras su confirmación
 * no tiene una respuesta definitiva.
 */
function guardarConfirmacion(p: Pendiente, codigoEnVuelo?: string) {
  guardarIntento({
    fase: 'confirmacion',
    ...soloPendiente(p),
    ...(codigoEnVuelo === undefined ? {} : { codigoEnVuelo }),
  });
}

function textoIntentos(n: number): string {
  return n === 1 ? 'Te queda 1 intento.' : `Te quedan ${n} intentos.`;
}

/**
 * Ruta `/transferir`: una sola ruta con la máquina del intento, sin `useMutation` (DD-43), para
 * que "atrás" no cree un segundo intento y los reintentos no dependan de la librería.
 */
export function Transferir() {
  // R-4.25: con un intento guardado, la máquina arranca en VerificandoAnterior.
  const [guardado] = useState<IntentoGuardado | null>(leerIntento);
  const [estado, setEstado] = useState<Estado>(
    guardado ? { fase: 'verificandoAnterior' } : { fase: 'editando', valores: null },
  );
  // DD-43: la bandera se revisa antes de cualquier setState, así que descarta el segundo
  // disparo del mismo ciclo (doble clic o doble Enter en "Enviar" o "Confirmar", R-4.21).
  const enVuelo = useRef(false);
  const queryClient = useQueryClient();

  async function unaVez(accion: () => Promise<void>) {
    if (enVuelo.current) return;
    enVuelo.current = true;
    try {
      await accion();
    } finally {
      enVuelo.current = false;
    }
  }

  /** §13.2: al terminar, aplicada o rechazada, se borra el intento y se vuelven a pedir datos. */
  function terminar(final: Extract<Estado, { fase: 'comprobante' | 'rechazado' }>) {
    borrarIntento();
    void queryClient.invalidateQueries({ queryKey: ['cuentas'] });
    void queryClient.invalidateQueries({ queryKey: ['movimientos'] });
    void queryClient.invalidateQueries({ queryKey: ['limites'] });
    setEstado(final);
  }

  /** Solo la primera respuesta 202 de un intento lleva directo a la captura (DD-32). */
  async function crear(intento: Intento, modo: 'primera' | 'reintento' | 'reanudacion') {
    setEstado(
      modo === 'reanudacion' ? { fase: 'verificandoAnterior' } : { ...intento, fase: 'enviando' },
    );
    guardarIntento({ fase: 'creacion', ...intento });
    try {
      const resultado = await crearTransferencia(intento.llave, intento.datos.solicitud);
      if (resultado.status === 201) {
        terminar({ fase: 'comprobante', comprobante: resultado.comprobante });
        return;
      }
      const { transferenciaId, codigoExpiraEn, codigoSimulado } = resultado.pendiente;
      const pendiente: Pendiente = {
        ...intento,
        transferenciaId,
        codigoExpiraEn,
        ...(codigoSimulado === undefined ? {} : { codigoSimulado }),
      };
      guardarConfirmacion(pendiente);
      if (modo === 'primera') {
        setEstado({ ...pendiente, fase: 'capturandoCodigo', error: null, intentosRestantes: null });
      } else {
        await verificar(pendiente, modo === 'reanudacion');
      }
    } catch (error) {
      if (esResultadoIncierto(error)) {
        // R-4.22: "Reintentar" reusa la llave y los datos del intento.
        setEstado({ ...intento, fase: 'errorReintentable', mensaje: mensajeDeError(error) });
      } else {
        // R-4.12 y R-4.23: un rechazo cierra el intento; nunca muestra comprobante.
        terminar({ fase: 'rechazado', mensaje: mensajeDeError(error) });
      }
    }
  }

  /** DD-32: el estado real decide si se muestra el comprobante, el rechazo o la captura. */
  async function verificar(pendiente: Pendiente, reanudacion: boolean) {
    const base = soloPendiente(pendiente);
    if (!reanudacion) setEstado({ ...base, fase: 'verificandoEstado' });
    try {
      const real = await obtenerTransferencia(base.transferenciaId);
      if (real.estado === 'APLICADA') {
        terminar({ fase: 'comprobante', comprobante: comprobanteDeTransferencia(real) });
      } else if (real.estado === 'RECHAZADA') {
        terminar({ fase: 'rechazado', mensaje: mensajeDeMotivo(real.motivoRechazo) });
      } else {
        const vigente: Pendiente = {
          ...base,
          codigoExpiraEn: real.codigoExpiraEn ?? base.codigoExpiraEn,
        };
        guardarConfirmacion(vigente);
        setEstado({ ...vigente, fase: 'capturandoCodigo', error: null, intentosRestantes: null });
      }
    } catch (error) {
      if (esResultadoIncierto(error)) {
        // H3: "Reintentar" repite la consulta, que es una lectura.
        setEstado({ ...base, fase: 'errorVerificacion', mensaje: mensajeDeError(error) });
      } else {
        terminar({ fase: 'rechazado', mensaje: mensajeDeError(error) });
      }
    }
  }

  /** §6.2: confirmar es idempotente por el id; un reintento usa el mismo código. */
  async function confirmar(pendiente: Pendiente, codigo: string, reanudacion: boolean) {
    const base = soloPendiente(pendiente);
    setEstado(
      reanudacion
        ? { fase: 'verificandoAnterior' }
        : { ...base, fase: 'confirmandoCodigo', codigo },
    );
    guardarConfirmacion(base, codigo);
    try {
      const comprobante = await confirmarTransferencia(base.transferenciaId, codigo);
      terminar({ fase: 'comprobante', comprobante });
    } catch (error) {
      if (esResultadoIncierto(error)) {
        // El código sigue guardado: una recarga reintenta esta misma confirmación.
        setEstado({ ...base, fase: 'errorConfirmacion', codigo, mensaje: mensajeDeError(error) });
      } else if (error instanceof ErrorApi && error.problema?.type === 'codigo-incorrecto') {
        // R-6.11: vuelve a la captura con los intentos restantes; el código ya no está en vuelo.
        guardarConfirmacion(base);
        const restantes = error.problema.intentosRestantes;
        const intentosRestantes = typeof restantes === 'number' ? restantes : null;
        setEstado({
          ...base,
          fase: 'capturandoCodigo',
          intentosRestantes,
          error:
            intentosRestantes === null
              ? mensajeDeError(error)
              : `${mensajeDeError(error)} ${textoIntentos(intentosRestantes)}`,
        });
      } else {
        // R-6.15: codigo-agotado, codigo-expirado o un rechazo por saldo o límite.
        terminar({ fase: 'rechazado', mensaje: mensajeDeError(error) });
      }
    }
  }

  /** R-4.25 y §13.2 "Reanudación": según la fase guardada; nunca la creación en `confirmacion`. */
  const reanudar = useEffectEvent((intento: IntentoGuardado) => {
    if (intento.fase === 'creacion') {
      void unaVez(() => crear(soloIntento(intento), 'reanudacion'));
      return;
    }
    const pendiente = soloPendiente(intento);
    const codigo = intento.codigoEnVuelo;
    if (codigo !== undefined) {
      void unaVez(() => confirmar(pendiente, codigo, true));
    } else {
      void unaVez(() => verificar(pendiente, true));
    }
  });

  useEffect(() => {
    if (guardado) reanudar(guardado);
  }, [guardado]);

  const nuevaTransferencia = () => setEstado({ fase: 'editando', valores: null });

  switch (estado.fase) {
    case 'editando':
      return (
        <Captura
          valores={estado.valores}
          alContinuar={(datos, valores) =>
            setEstado({ fase: 'confirmando', llave: crypto.randomUUID(), datos, valores })
          }
        />
      );
    case 'confirmando':
    case 'enviando':
    case 'errorReintentable':
      return (
        <Confirmacion
          estado={estado}
          alEnviar={(evento) => {
            evento.preventDefault();
            const modo = estado.fase === 'errorReintentable' ? 'reintento' : 'primera';
            void unaVez(() => crear(soloIntento(estado), modo));
          }}
          alEditar={() => setEstado({ fase: 'editando', valores: estado.valores })}
        />
      );
    case 'capturandoCodigo':
    case 'confirmandoCodigo':
    case 'errorConfirmacion':
      return (
        <PantallaCodigo
          montoCentavos={estado.datos.solicitud.montoCentavos}
          destino={estado.datos.destino}
          codigoExpiraEn={estado.codigoExpiraEn}
          codigoSimulado={estado.codigoSimulado}
          ocupado={estado.fase === 'confirmandoCodigo'}
          errorCodigo={estado.fase === 'capturandoCodigo' ? estado.error : null}
          intentosRestantes={estado.fase === 'capturandoCodigo' ? estado.intentosRestantes : null}
          errorConfirmacion={estado.fase === 'errorConfirmacion' ? estado.mensaje : null}
          alConfirmar={(codigo) => {
            // R-6.13: en ErrorConfirmacion se reintenta con el mismo código que quedó en vuelo.
            const enviado = estado.fase === 'errorConfirmacion' ? estado.codigo : codigo;
            void unaVez(() => confirmar(estado, enviado, false));
          }}
        />
      );
    case 'verificandoAnterior':
      return (
        <>
          <h1>Verificando operación anterior</h1>
          <p role="status" aria-live="polite">
            Verificando operación anterior…
          </p>
        </>
      );
    case 'verificandoEstado':
    case 'errorVerificacion':
      return (
        <>
          <h1>Verificando tu transferencia</h1>
          <div role="status" aria-live="polite">
            {estado.fase === 'verificandoEstado' ? (
              <p>Verificando el estado de tu transferencia…</p>
            ) : null}
          </div>
          {estado.fase === 'errorVerificacion' ? (
            <div role="alert" className="error">
              <p>No pudimos verificar tu transferencia. {estado.mensaje}</p>
              <button type="button" onClick={() => void unaVez(() => verificar(estado, false))}>
                Reintentar
              </button>
            </div>
          ) : null}
        </>
      );
    case 'comprobante':
      return (
        <VistaComprobante
          comprobante={estado.comprobante}
          alNuevaTransferencia={nuevaTransferencia}
        />
      );
    case 'rechazado':
      return (
        <>
          <h1>Transferencia rechazada</h1>
          <p role="alert" className="error">
            {estado.mensaje}
          </p>
          <button type="button" onClick={nuevaTransferencia}>
            Nueva transferencia
          </button>
        </>
      );
  }
}

function Captura({
  valores,
  alContinuar,
}: {
  valores: ValoresFormulario | null;
  alContinuar: (datos: DatosCongelados, valores: ValoresFormulario) => void;
}) {
  const cuentas = useCuentas();
  const beneficiarios = useBeneficiarios();
  const limites = useLimites();
  const error = cuentas.error ?? beneficiarios.error ?? limites.error;
  const listo = cuentas.isSuccess && beneficiarios.isSuccess && limites.isSuccess;

  return (
    <>
      <h1>Transferir</h1>
      {error ? (
        <ErrorConReintento
          titulo="No pudimos cargar tus cuentas y beneficiarios."
          error={error}
          alReintentar={() => {
            void cuentas.refetch();
            void beneficiarios.refetch();
            void limites.refetch();
          }}
        />
      ) : (
        <>
          {listo ? null : (
            <p role="status" className="solo-lector">
              Cargando cuentas y beneficiarios…
            </p>
          )}
          <FormularioTransferencia
            key={listo ? 'listo' : 'cargando'}
            cargando={!listo}
            cuentas={cuentas.data?.items ?? []}
            beneficiarios={beneficiarios.data?.items ?? []}
            disponibleCentavos={limites.data?.disponibleCentavos ?? 0}
            valoresIniciales={valores}
            alContinuar={alContinuar}
          />
        </>
      )}
    </>
  );
}

function Confirmacion({
  estado,
  alEnviar,
  alEditar,
}: {
  estado: Extract<Estado, { fase: 'confirmando' | 'enviando' | 'errorReintentable' }>;
  alEnviar: (evento: FormEvent<HTMLFormElement>) => void;
  alEditar: () => void;
}) {
  const enviando = estado.fase === 'enviando';
  const { solicitud, origen, destino } = estado.datos;
  return (
    <>
      <h1>Confirma la transferencia</h1>
      <dl>
        <dt>Desde</dt>
        <dd>{origen}</dd>
        <dt>Para</dt>
        <dd>{destino}</dd>
        <dt>Monto</dt>
        <dd className="monto">{formatearMXN(solicitud.montoCentavos)}</dd>
        <dt>Concepto</dt>
        <dd>{solicitud.concepto}</dd>
        <dt>Referencia</dt>
        <dd>{solicitud.referencia}</dd>
      </dl>
      {estado.fase === 'errorReintentable' ? (
        <p role="alert" className="error">
          {estado.mensaje} Puedes reintentar: no se enviará dos veces.
        </p>
      ) : null}
      {/* R-4.21: clic y Enter pasan por el mismo onSubmit. */}
      <form onSubmit={alEnviar} aria-label="Confirmación">
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {estado.fase === 'errorReintentable' ? 'Reintentar' : 'Enviar'}
        </button>
        {/* Tras un resultado incierto ya no se edita: la petición pudo haber llegado. */}
        {estado.fase === 'errorReintentable' ? null : (
          <button type="button" className="secundario" onClick={alEditar} disabled={enviando}>
            Editar
          </button>
        )}
      </form>
    </>
  );
}

const TIPO: Record<Comprobante['tipo'], string> = {
  TERCERO: 'Envío a tercero',
  TRASPASO: 'Traspaso entre tus cuentas',
};

/** DD-34: comprobante con las CLABE en sus últimos 4 dígitos (R-4.11). */
function VistaComprobante({
  comprobante,
  alNuevaTransferencia,
}: {
  comprobante: Comprobante;
  alNuevaTransferencia: () => void;
}) {
  return (
    <section aria-labelledby="titulo-comprobante">
      <h1 id="titulo-comprobante">Transferencia aplicada</h1>
      <dl>
        <dt>Folio</dt>
        <dd>{comprobante.transferenciaId}</dd>
        <dt>Tipo</dt>
        <dd>{TIPO[comprobante.tipo]}</dd>
        <dt>Monto</dt>
        <dd className="monto">{formatearMXN(comprobante.montoCentavos)}</dd>
        <dt>Desde</dt>
        <dd>
          {comprobante.origen.nombre} ···{comprobante.origen.clabeTerminacion}
        </dd>
        <dt>Para</dt>
        <dd>
          {comprobante.destino.etiqueta} ({comprobante.destino.nombre}) ···
          {comprobante.destino.clabeTerminacion}
        </dd>
        <dt>Concepto</dt>
        <dd>{comprobante.concepto}</dd>
        <dt>Referencia</dt>
        <dd>{comprobante.referencia}</dd>
        <dt>Aplicada</dt>
        <dd>{formatearFecha(comprobante.aplicadaEn)}</dd>
      </dl>
      <button type="button" onClick={alNuevaTransferencia}>
        Nueva transferencia
      </button>
    </section>
  );
}
