import { Link } from 'react-router';

export function NoEncontrada() {
  return (
    <>
      <h1>Página no encontrada</h1>
      <p>
        <Link to="/">Volver al resumen</Link>
      </p>
    </>
  );
}
