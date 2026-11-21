import { Column, type ColumnOptions } from 'typeorm';

/**
 * DD-07: columna `timestamptz` declarada en TypeORM como texto. En la base sigue siendo
 * timestamptz; TypeORM la deja como el texto que entrega el parser de pg (§2.3), con sus
 * microsegundos, en vez de convertirla a Date al hidratar la entidad.
 */
export function columnaInstante(
  nombre: string,
  opciones: Omit<ColumnOptions, 'type' | 'name'> = {},
): PropertyDecorator {
  return Column({ ...opciones, type: 'text', name: nombre });
}
