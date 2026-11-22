import { useEffect, useState, useSyncExternalStore } from 'react';
import { Navigate, Outlet } from 'react-router';
import { haySesion, refrescar, suscribirSesion } from './sesion';

/**
 * R-1.14: al cargar, espera a `POST /auth/refresh` antes de pintar datos protegidos; si el
 * refresh falla, lleva al login. Si la sesión se pierde después (logout o refresh fallido
 * tras un 401), también lleva al login.
 */
export function RutaProtegida() {
  const activa = useSyncExternalStore(suscribirSesion, haySesion);
  const [verificada, setVerificada] = useState(activa);

  useEffect(() => {
    if (verificada) return;
    let vigente = true;
    refrescar(null)
      .catch(() => false)
      .then(() => {
        if (vigente) setVerificada(true);
      });
    return () => {
      vigente = false;
    };
  }, [verificada]);

  if (!verificada) return <p role="status">Verificando sesión…</p>;
  if (!activa) return <Navigate to="/login" replace />;
  return <Outlet />;
}
