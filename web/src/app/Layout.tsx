import { Link, Outlet } from 'react-router';

/** Layout común: encabezado y región principal; cada pantalla pone su propio h1 (RNF-19). */
export function Layout() {
  return (
    <>
      <header className="encabezado">
        <Link to="/" className="marca">
          Billetera
        </Link>
      </header>
      <main className="principal">
        <Outlet />
      </main>
    </>
  );
}
