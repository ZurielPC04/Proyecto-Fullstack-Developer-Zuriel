import {
  esquemaQueryMovimientos,
  formatearMXN,
  type Movimiento,
  type TipoMovimiento,
} from '@billetera/shared';
import { cloneElement, useState, type InputHTMLAttributes, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router';
import { ErrorConReintento } from '../componentes/ErrorConReintento';
import { useCuentas } from '../consultas/cuentas';
import { useMovimientos, type FiltrosMovimientos } from '../consultas/movimientos';
import { formatearFecha } from '../formato/fecha';

/** R-5.9: una entrada desde Fondeo es "Depósito", nunca una transferencia. */
export const ETIQUETA_TIPO: Record<TipoMovimiento, string> = {
  DEPOSITO: 'Depósito',
  ENVIO: 'Envío',
  RECEPCION: 'Recepción',
  TRASPASO_SALIDA: 'Traspaso enviado',
  TRASPASO_ENTRADA: 'Traspaso recibido',
};

type CamposFiltro = { desde: string; hasta: string; tipo: TipoMovimiento | '' };

/** Ruta `/cuentas/:cuentaId` (design.md §13.2): historial con filtros y "Cargar más" (R-5.11). */
export function Historial() {
  const { cuentaId = '' } = useParams();
  const cuentas = useCuentas();
  const cuenta = cuentas.data?.items.find((c) => c.id === cuentaId);
  const [filtros, setFiltros] = useState<FiltrosMovimientos>({});
  const movimientos = useMovimientos(cuentaId, filtros);
  const hayFiltros = Object.values(filtros).some((valor) => valor !== undefined);

  return (
    <>
      <h1>{cuenta ? `Movimientos de ${cuenta.nombre}` : 'Movimientos'}</h1>
      <Filtros alAplicar={setFiltros} />
      {movimientos.isPending ? (
        <div role="status" aria-live="polite">
          <p className="solo-lector">Cargando movimientos…</p>
          <div className="esqueleto" aria-hidden="true" />
        </div>
      ) : movimientos.isError ? (
        <ErrorConReintento
          titulo="No pudimos cargar los movimientos."
          error={movimientos.error}
          alReintentar={() => void movimientos.refetch()}
        />
      ) : (
        <Tabla
          items={movimientos.data.pages.flatMap((pagina) => pagina.items)}
          vacio={hayFiltros ? 'Sin resultados para estos filtros' : 'Sin movimientos'}
          hayMas={movimientos.hasNextPage}
          cargandoMas={movimientos.isFetchingNextPage}
          alCargarMas={() => void movimientos.fetchNextPage()}
        />
      )}
    </>
  );
}

function sinVacios(campos: CamposFiltro): Record<string, string> {
  return Object.fromEntries(Object.entries(campos).filter(([, valor]) => valor !== ''));
}

/** R-5.5 y R-5.6: se validan con el esquema de shared, el mismo de la API (RNF-18). */
function Filtros({ alAplicar }: { alAplicar: (filtros: FiltrosMovimientos) => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CamposFiltro>({ defaultValues: { desde: '', hasta: '', tipo: '' } });

  const aplicar = handleSubmit((campos) => {
    const resultado = esquemaQueryMovimientos.safeParse(sinVacios(campos));
    if (!resultado.success) {
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0];
        if (campo === 'desde' || campo === 'hasta' || campo === 'tipo') {
          setError(campo, { message: issue.message }, { shouldFocus: true });
        }
      }
      return;
    }
    const { desde, hasta, tipo } = resultado.data;
    alAplicar({ desde, hasta, tipo });
  });

  return (
    <form onSubmit={aplicar} noValidate aria-label="Filtros" className="filtros">
      <CampoFiltro id="filtro-desde" etiqueta="Desde" error={errors.desde?.message}>
        <input type="date" {...register('desde')} />
      </CampoFiltro>
      <CampoFiltro id="filtro-hasta" etiqueta="Hasta" error={errors.hasta?.message}>
        <input type="date" {...register('hasta')} />
      </CampoFiltro>
      <CampoFiltro id="filtro-tipo" etiqueta="Tipo" error={errors.tipo?.message}>
        <select {...register('tipo')}>
          <option value="">Todos</option>
          {Object.entries(ETIQUETA_TIPO).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
      </CampoFiltro>
      <button type="submit">Aplicar filtros</button>
    </form>
  );
}

/** Campo con etiqueta y error enlazados (RNF-19); el control llega como hijo. */
function CampoFiltro({
  id,
  etiqueta,
  error,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string | undefined;
  children: ReactElement<InputHTMLAttributes<HTMLElement>>;
}) {
  const idError = `${id}-error`;
  const control = cloneElement(children, {
    id,
    'aria-invalid': error ? 'true' : 'false',
    'aria-describedby': error ? idError : undefined,
  });
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      {control}
      {error ? (
        <p id={idError} className="error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Tabla({
  items,
  vacio,
  hayMas,
  cargandoMas,
  alCargarMas,
}: {
  items: Movimiento[];
  vacio: string;
  hayMas: boolean;
  cargandoMas: boolean;
  alCargarMas: () => void;
}) {
  if (items.length === 0) return <p>{vacio}</p>;
  return (
    <>
      <table>
        <caption className="solo-lector">Movimientos, del más reciente al más antiguo</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Tipo</th>
            <th scope="col">Contraparte</th>
            <th scope="col">Concepto</th>
            <th scope="col">Referencia</th>
            <th scope="col" className="monto">
              Monto
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id}>
              <td>{formatearFecha(m.fecha)}</td>
              <td>{ETIQUETA_TIPO[m.tipo]}</td>
              <td>
                {m.contraparte.etiqueta}
                {m.contraparte.clabeTerminacion ? ` ···${m.contraparte.clabeTerminacion}` : ''}
              </td>
              <td>{m.concepto}</td>
              <td>{m.referencia ?? '—'}</td>
              <td className="monto">{formatearMXN(m.montoCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hayMas ? (
        <button type="button" onClick={alCargarMas} disabled={cargandoMas} aria-busy={cargandoMas}>
          Cargar más
        </button>
      ) : null}
    </>
  );
}
