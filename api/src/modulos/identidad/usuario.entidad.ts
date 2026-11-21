import { Column, Entity, PrimaryColumn } from 'typeorm';
import { columnaInstante, ID_GENERADO_EN_LA_BASE } from '../../plataforma/db/columnas.js';

/** design.md §3.2 `usuario`. Cada @Column declara su type: no hay emitDecoratorMetadata. */
@Entity({ name: 'usuario' })
export class Usuario {
  @PrimaryColumn({ ...ID_GENERADO_EN_LA_BASE, primaryKeyConstraintName: 'pk_usuario' })
  id!: string;

  @Column({ type: 'text' })
  correo!: string;

  @Column({ type: 'text', name: 'hash_contrasena' })
  hashContrasena!: string;

  /** DD-07: texto con microsegundos; DEFAULT now() en la base. */
  @columnaInstante('creado_en')
  creadoEn!: string;
}
