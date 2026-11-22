import { formatearMXN, type Comprobante } from '@billetera/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { mensajeDeError } from '../api/mensaje-error';
import { ErrorConReintento } from '../componentes/ErrorConReintento';
import { useBeneficiarios } from '../consultas/beneficiarios';
import { useCuentas, useLimites } from '../consultas/cuentas';
import { formatearFecha } from '../formato/fecha';
import { crearTransferencia, esResultadoIncierto } from './api-transferencia';
import { FormularioTransferencia, type DatosCongelados } from './FormularioTransferencia';
import type { ValoresFormulario } from './formulario';

/** Un intento: la llave nace al pasar a la confirmación y muere al volver a editar (R-4.20, R-4.24). */
type Intento = { llave: string; datos: DatosCongelados; valores: ValoresFormulario };

/** Máquina del intento de transferencia (design.md §13.2, D-16). */
type Estado =
  | { fase: 'editando'; valores: ValoresFormulario | null }
  | ({ fase: 'confirmando' } & Intento)
  | ({ fase: 'enviando' } & Intento)
  | ({ fase: 'errorReintentable'; mensaje: string } & Intento)
  | { fase: 'comprobante'; comprobante: Comprobante }
  | { fase: 'rechazado'; mensaje: string }
  | { fase: 'pendiente' };

/**
 * Ruta `/transferir`: una sola ruta con la máquina del intento, sin `useMutation` (DD-43), para
 * que "atrás" no cree un segundo intento y los reintentos no dependan de la librería.
 */
export function Transferir() {
  const [estado, setEstado] = useState<Estado>({ fase: 'editando', valores: null });
  // DD-43: la bandera se revisa antes de cualquier setState, así que descarta el segundo
  // disparo del mismo ciclo (doble clic o doble Enter, R-4.21).
  const enVuelo = useRef(false);
  const queryClient = useQueryClient();

  /** §13.2: al terminar, aplicada o rechazada, los datos se vuelven a pedir al servidor. */
  function alTerminar() {
    void queryClient.invalidateQueries({ queryKey: ['cuentas'] });
    void queryClient.invalidateQueries({ queryKey: ['movimientos'] });
    void queryClient.invalidateQueries({ queryKey: ['limites'] });
  }

  async function enviar(intento: Intento) {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setEstado({ ...intento, fase: 'enviando' });
    try {
      const resultado = await crearTransferencia(intento.llave, intento.datos.solicitud);
      if (resultado.status === 201) {
        alTerminar();
        setEstado({ fase: 'comprobante', comprobante: resultado.comprobante });
      } else {
        setEstado({ fase: 'pendiente' });
      }
    } catch (error) {
      if (esResultadoIncierto(error)) {
        // R-4.22: "Reintentar" reusa la llave y los datos del intento.
        setEstado({ ...intento, fase: 'errorReintentable', mensaje: mensajeDeError(error) });
      } else {
        // R-4.12 y R-4.23: un rechazo cierra el intento; nunca muestra comprobante.
        alTerminar();
        setEstado({ fase: 'rechazado', mensaje: mensajeDeError(error) });
      }
    } finally {
      enVuelo.current = false;
    }
  }

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
            void enviar({ llave: estado.llave, datos: estado.datos, valores: estado.valores });
          }}
          alEditar={() => setEstado({ fase: 'editando', valores: estado.valores })}
        />
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
    case 'pendiente':
      return (
        <>
          <h1>Código de confirmación</h1>
          <p>Tu transferencia necesita un código de confirmación.</p>
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
