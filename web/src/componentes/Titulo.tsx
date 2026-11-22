import { useEffect, useRef, type ReactNode } from 'react';

/**
 * RNF-19 (§13.2 "Accesibilidad"): el h1 de cada pantalla y de cada fase de la transferencia.
 * Recibe el foco al montarse, así que el foco llega al encabezado nuevo al cambiar de pantalla
 * o de fase, y el lector de pantalla lo anuncia. `tabIndex={-1}` lo deja enfocable por código
 * sin meterlo en el orden de Tab.
 */
export function Titulo({ children, id }: { children: ReactNode; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} id={id} tabIndex={-1}>
      {children}
    </h1>
  );
}
