import { Link } from 'react-router';
import { Titulo } from '../componentes/Titulo';

export function NoEncontrada() {
  return (
    <>
      <Titulo>Página no encontrada</Titulo>
      <p>
        <Link to="/">Volver al resumen</Link>
      </p>
    </>
  );
}
