import { formatearMXN, type Cuenta, type Limites } from '@billetera/shared';
import { Link } from 'react-router';
import { ErrorConReintento } from '../componentes/ErrorConReintento';
import { useCuentas, useLimites } from '../consultas/cuentas';

/** Ruta `/` (design.md §13.2): cuentas con su saldo y el límite del día (R-2.1, R-2.6, R-6.7). */
export function Resumen() {
  const cuentas = useCuentas();
  const limites = useLimites();

  return (
    <>
      <h1>Resumen</h1>
      {cuentas.isPending || limites.isPending ? (
        <Cargando />
      ) : cuentas.isError || limites.isError ? (
        <ErrorConReintento
          titulo="No pudimos cargar tus cuentas."
          error={cuentas.error ?? limites.error}
          alReintentar={() => {
            void cuentas.refetch();
            void limites.refetch();
          }}
        />
      ) : (
        <>
          <TarjetasDeCuentas cuentas={cuentas.data.items} />
          <LimiteDelDia limites={limites.data} />
        </>
      )}
    </>
  );
}

function Cargando() {
  return (
    <div role="status" aria-live="polite">
      <p className="solo-lector">Cargando cuentas…</p>
      <div className="tarjetas" aria-hidden="true">
        <div className="esqueleto" />
        <div className="esqueleto" />
      </div>
    </div>
  );
}

function TarjetasDeCuentas({ cuentas }: { cuentas: Cuenta[] }) {
  return (
    <section aria-labelledby="titulo-cuentas">
      <h2 id="titulo-cuentas">Cuentas</h2>
      <ul className="tarjetas">
        {cuentas.map((cuenta) => (
          <li key={cuenta.id} className="tarjeta" aria-labelledby={`cuenta-${cuenta.id}`}>
            <h3 id={`cuenta-${cuenta.id}`}>{cuenta.nombre}</h3>
            <dl>
              <dt>Saldo disponible</dt>
              <dd className="monto">{formatearMXN(cuenta.saldoCentavos)}</dd>
              <dt>CLABE</dt>
              <dd>{cuenta.clabe}</dd>
            </dl>
            {/* RNF-19: el nombre accesible empieza con el texto visible (WCAG 2.5.3). */}
            <Link to={`/cuentas/${cuenta.id}`} aria-label={`Ver movimientos de ${cuenta.nombre}`}>
              Ver movimientos
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** R-6.7: el límite, lo consumido y lo disponible llegan de `GET /limites`; no se recalculan. */
function LimiteDelDia({ limites }: { limites: Limites }) {
  return (
    <section aria-labelledby="titulo-limite">
      <h2 id="titulo-limite">Límite de hoy</h2>
      <dl>
        <dt>Disponible para transferir a terceros</dt>
        <dd className="monto">{formatearMXN(limites.disponibleCentavos)}</dd>
        <dt>Consumido hoy</dt>
        <dd className="monto">{formatearMXN(limites.consumidoCentavos)}</dd>
        <dt>Límite diario</dt>
        <dd className="monto">{formatearMXN(limites.limiteCentavos)}</dd>
      </dl>
      <p>Se renueva a medianoche, hora del centro de México.</p>
    </section>
  );
}
