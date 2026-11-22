import { esquemaBeneficiario, type Beneficiario } from '@billetera/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Campo } from '../componentes/Campo';
import { ErrorConReintento } from '../componentes/ErrorConReintento';
import { useAltaBeneficiario, useBeneficiarios } from '../consultas/beneficiarios';
import { aplicarErrorDelServidor } from '../formularios/errores-servidor';
import { Titulo } from '../componentes/Titulo';

/** Ruta `/beneficiarios` (design.md §13.2): lista y formulario de alta (R-3.1, R-3.10). */
export function Beneficiarios() {
  const beneficiarios = useBeneficiarios();

  return (
    <>
      <Titulo>Beneficiarios</Titulo>
      <section aria-labelledby="titulo-lista">
        <h2 id="titulo-lista">Tus beneficiarios</h2>
        {beneficiarios.isPending ? (
          <div role="status" aria-live="polite">
            <p className="solo-lector">Cargando beneficiarios…</p>
            <div className="esqueleto" aria-hidden="true" />
          </div>
        ) : beneficiarios.isError ? (
          <ErrorConReintento
            titulo="No pudimos cargar tus beneficiarios."
            error={beneficiarios.error}
            alReintentar={() => void beneficiarios.refetch()}
          />
        ) : beneficiarios.data.items.length === 0 ? (
          <p>Aún no tienes beneficiarios</p>
        ) : (
          <Lista items={beneficiarios.data.items} />
        )}
      </section>
      <FormularioAlta />
    </>
  );
}

function Lista({ items }: { items: Beneficiario[] }) {
  return (
    <ul className="tarjetas">
      {items.map((b) => (
        <li key={b.id} className="tarjeta" aria-labelledby={`beneficiario-${b.id}`}>
          <h3 id={`beneficiario-${b.id}`}>{b.alias}</h3>
          <dl>
            <dt>Nombre</dt>
            <dd>{b.nombre}</dd>
            <dt>CLABE</dt>
            <dd>{b.clabe}</dd>
          </dl>
          {/* R-3.8 y DD-26: enviarle a una cuenta propia es un traspaso. */}
          {b.esCuentaPropia ? <p>Cuenta propia: enviarle es un traspaso</p> : null}
        </li>
      ))}
    </ul>
  );
}

const CAMPOS = ['nombre', 'alias', 'clabe'] as const;

/**
 * R-3.10 y RNF-18: valida con `esquemaBeneficiario` de shared (longitud y dígito verificador
 * con `validarClabe`, la misma función de la API) antes de enviar. La CLABE se captura con o sin
 * espacios; el formulario los quita antes de validar (§13.1). Los errores del servidor (`409`,
 * `422 clabe-not-found`) van junto a su campo; el `429` va al formulario.
 */
function FormularioAlta() {
  const alta = useAltaBeneficiario();
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(esquemaBeneficiario),
    defaultValues: { nombre: '', alias: '', clabe: '' },
  });

  const enviar = handleSubmit(async (solicitud) => {
    setErrorFormulario(null);
    setConfirmacion(null);
    try {
      const creado = await alta.mutateAsync(solicitud);
      reset();
      setConfirmacion(`Agregaste a ${creado.alias}.`);
    } catch (error) {
      setErrorFormulario(
        aplicarErrorDelServidor(error, setError, CAMPOS, { 'clabe-not-found': 'clabe' }),
      );
    }
  });

  return (
    <section aria-labelledby="titulo-alta">
      <h2 id="titulo-alta">Nuevo beneficiario</h2>
      <form onSubmit={enviar} noValidate aria-labelledby="titulo-alta">
        <Campo
          id="beneficiario-nombre"
          etiqueta="Nombre"
          autoComplete="off"
          registro={register('nombre')}
          error={errors.nombre?.message}
        />
        <Campo
          id="beneficiario-alias"
          etiqueta="Alias"
          autoComplete="off"
          registro={register('alias')}
          error={errors.alias?.message}
        />
        <Campo
          id="beneficiario-clabe"
          etiqueta="CLABE"
          inputMode="numeric"
          autoComplete="off"
          registro={register('clabe', {
            setValueAs: (valor: string) => valor.replaceAll(' ', ''),
          })}
          error={errors.clabe?.message}
        />
        {errorFormulario ? (
          <p role="alert" className="error">
            {errorFormulario}
          </p>
        ) : null}
        <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          Agregar beneficiario
        </button>
      </form>
      <div role="status" aria-live="polite">
        {confirmacion ? <p>{confirmacion}</p> : null}
      </div>
    </section>
  );
}
