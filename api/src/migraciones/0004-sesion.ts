import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Migración 4 `Sesion` (design.md §3.2, §5.3; RNF-02: el refresh se guarda como SHA-256). */
export class Sesion1000000000004 implements MigrationInterface {
  name = 'Sesion1000000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sesion (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        usuario_id uuid NOT NULL,
        familia_id uuid NOT NULL,
        refresh_hash text NOT NULL,
        creado_en timestamptz NOT NULL DEFAULT now(),
        expira_en timestamptz NOT NULL,
        usada_en timestamptz NULL,
        revocada_en timestamptz NULL,
        CONSTRAINT pk_sesion PRIMARY KEY (id),
        CONSTRAINT fk_sesion_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id),
        CONSTRAINT uq_sesion_refresh_hash UNIQUE (refresh_hash),
        CONSTRAINT ck_sesion_refresh_hash CHECK (refresh_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT ck_sesion_expira CHECK (expira_en > creado_en)
      )
    `);
    await queryRunner.query('CREATE INDEX ix_sesion_familia ON sesion (familia_id)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE sesion');
  }
}
