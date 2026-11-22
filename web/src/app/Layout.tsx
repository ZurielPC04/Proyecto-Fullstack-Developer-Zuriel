import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { cerrarSesion, haySesion, suscribirSesion } from '../auth/sesion';

/** Layout común: encabezado y región principal; cada pantalla pone su propio h1 (RNF-19). */
export function Layout() {
  const activa = useSyncExternalStore(suscribirSesion, haySesion);
  const queryClient = useQueryClient();

  return (
    <>
      <header className="encabezado">
        <Link to="/" className="marca">
          Billetera
        </Link>
        {activa ? (
          <>
            <nav aria-label="Principal">
              <ul>
                <li>
                  <NavLink to="/" end>
                    Resumen
                  </NavLink>
                </li>
              </ul>
            </nav>
            <button
              type="button"
              className="secundario"
              onClick={() => void cerrarSesion(queryClient)}
            >
              Cerrar sesión
            </button>
          </>
        ) : null}
      </header>
      <main className="principal">
        <Outlet />
      </main>
    </>
  );
}
