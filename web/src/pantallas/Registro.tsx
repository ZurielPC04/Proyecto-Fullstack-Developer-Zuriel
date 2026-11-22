import { esquemaRegistro } from '@billetera/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/cliente';
import { Campo } from '../componentes/Campo';
import { aplicarErrorDelServidor } from '../formularios/errores-servidor';
import { Titulo } from '../componentes/Titulo';

export function Registro() {
  const navegar = useNavigate();
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(esquemaRegistro),
    defaultValues: { correo: '', contrasena: '' },
  });

  // RNF-18: se envían los valores ya normalizados por el esquema de shared (DD-16, DD-28).
  const enviar = handleSubmit(async (datos) => {
    setErrorFormulario(null);
    try {
      await api.post('/auth/registro', { body: datos });
      // DD-24: el registro no abre sesión; el usuario inicia sesión después.
      await navegar('/login', { state: { aviso: 'Tu cuenta está lista. Inicia sesión.' } });
    } catch (error) {
      setErrorFormulario(
        aplicarErrorDelServidor(error, setError, ['correo', 'contrasena'], {
          'correo-ya-registrado': 'correo',
        }),
      );
    }
  });

  return (
    <>
      <Titulo>Crear cuenta</Titulo>
      <form onSubmit={enviar} noValidate>
        <Campo
          id="registro-correo"
          etiqueta="Correo"
          type="email"
          autoComplete="email"
          registro={register('correo')}
          error={errors.correo?.message}
        />
        <Campo
          id="registro-contrasena"
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          registro={register('contrasena')}
          error={errors.contrasena?.message}
        />
        <p className="ayuda">De 12 a 128 caracteres; puede ser una frase.</p>
        {errorFormulario ? (
          <p role="alert" className="error">
            {errorFormulario}
          </p>
        ) : null}
        <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          Crear cuenta
        </button>
      </form>
      <p>
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </p>
    </>
  );
}
