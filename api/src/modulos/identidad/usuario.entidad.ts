import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { columnaInstante } from '../../plataforma/db/columnas.js';

/** design.md §3.2 `usuario`. Cada @Column declara su type: no hay emitDecoratorMetadata. */
@Entity({ name: 'usuario' })
export class Usuario {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_usuario' })
  id!: string;

  @Column({ type: 'text' })
  correo!: string;

  @Column({ type: 'text', name: 'hash_contrasena' })
  hashContrasena!: string;

  /** DD-07: texto con microsegundos; DEFAULT now() en la base. */
  @columnaInstante('creado_en')
  creadoEn!: string;
}
