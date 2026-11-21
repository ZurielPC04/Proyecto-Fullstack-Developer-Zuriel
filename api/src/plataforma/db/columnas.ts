import { Column, type ColumnOptions, type PrimaryColumnOptions } from 'typeorm';

/**
 * DD-11 y DD-05: el `uuid` lo genera la base con `DEFAULT gen_random_uuid()`. Se usa con
 * @PrimaryColumn, no con @PrimaryGeneratedColumn('uuid'), que haría a TypeORM instalar
 * "uuid-ossp" por su cuenta. El `default` solo documenta el de la base (synchronize es
 * false) y hace que TypeORM pida el id en el RETURNING del INSERT.
 */
export const ID_GENERADO_EN_LA_BASE: PrimaryColumnOptions = {
  type: 'uuid',
  default: () => 'gen_random_uuid()',
};

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
