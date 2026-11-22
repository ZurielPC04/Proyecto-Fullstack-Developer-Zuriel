import { esquemaLogin } from '@billetera/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { iniciarSesion } from '../auth/sesion';
import { Campo } from '../componentes/Campo';
import { aplicarErrorDelServidor } from '../formularios/errores-servidor';

// DD-24: el cliente lo agrega la web al enviar; el usuario solo captura correo y contraseña.
const esquema = esquemaLogin.omit({ cliente: true });

export function Login() {
  const navegar = useNavigate();
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: { correo: '', contrasena: '' } });

  const enviar = handleSubmit(async ({ correo, contrasena }) => {
    setErrorFormulario(null);
    try {
      await iniciarSesion(correo, contrasena);
      await navegar('/', { replace: true });
    } catch (error) {
      setErrorFormulario(aplicarErrorDelServidor(error, setError, ['correo', 'contrasena']));
    }
  });

  return (
    <>
      <h1>Iniciar sesión</h1>
      {aviso ? <p role="status">{aviso}</p> : null}
      <form onSubmit={enviar} noValidate>
        <Campo
          id="login-correo"
          etiqueta="Correo"
          type="email"
          autoComplete="email"
          registro={register('correo')}
          error={errors.correo?.message}
        />
        <Campo
          id="login-contrasena"
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          registro={register('contrasena')}
          error={errors.contrasena?.message}
        />
        {errorFormulario ? (
          <p role="alert" className="error">
            {errorFormulario}
          </p>
        ) : null}
        <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          Entrar
        </button>
      </form>
      <p>
        ¿No tienes cuenta? <Link to="/registro">Crea una</Link>
      </p>
    </>
  );
}
