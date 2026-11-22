// Estados de una carga (RNF-17, design.md §13.3): cargando, error con "Reintentar" y éxito.
import { useCallback, useEffect, useState } from 'react';

export type Carga<T> =
  { estado: 'cargando' } | { estado: 'error'; error: unknown } | { estado: 'exito'; datos: T };

/**
 * Ejecuta `cargar` al montar y cada vez que se llama `reintentar`. `cargar` debe ser estable
 * (`useCallback`). El estado solo cambia en el callback de la promesa o en `reintentar`.
 */
export function useCarga<T>(cargar: () => Promise<T>): Carga<T> & { reintentar: () => void } {
  const [carga, setCarga] = useState<Carga<T>>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    cargar().then(
      (datos) => {
        if (vigente) setCarga({ estado: 'exito', datos });
      },
      (error: unknown) => {
        if (vigente) setCarga({ estado: 'error', error });
      },
    );
    return () => {
      vigente = false;
    };
  }, [cargar, intento]);

  const reintentar = useCallback(() => {
    setCarga({ estado: 'cargando' });
    setIntento((n) => n + 1);
  }, []);

  return { ...carga, reintentar };
}
