import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { columnaInstante } from '../../plataforma/db/columnas.js';

/** design.md §3.2 `cuenta`. Cada @Column declara su type: no hay emitDecoratorMetadata. */
@Entity({ name: 'cuenta' })
export class Cuenta {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_cuenta' })
  id!: string;

  /** NULL solo en la cuenta de sistema (Fondeo). */
  @Column({ type: 'uuid', name: 'usuario_id', nullable: true })
  usuarioId!: string | null;

  @Column({ type: 'text' })
  tipo!: 'USUARIO' | 'SISTEMA';

  @Column({ type: 'text' })
  nombre!: 'Principal' | 'Ahorro' | 'Fondeo';

  @Column({ type: 'text' })
  clabe!: string;

  /**
   * D-01 y RNF-07: solo lo escribe el trigger de asientos. TypeORM nunca lo inserta ni lo
   * actualiza; además billetera_app no tiene permiso sobre la columna (§3.4).
   */
  @Column({ type: 'bigint', name: 'saldo_centavos', insert: false, update: false })
  saldoCentavos!: number;

  /** DD-07: texto con microsegundos; DEFAULT now() en la base. */
  @columnaInstante('creado_en')
  creadoEn!: string;
}
