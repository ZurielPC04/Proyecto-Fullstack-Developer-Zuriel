import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 5 `Auditoria` (design.md §3.2, §3.3, §10.2; DD-15, DD-40, RNF-11).
 * `evento_auditoria` sin FK, con `ocurrido_en = clock_timestamp()` y `auditoria_inmutable`.
 */
export class Auditoria1000000000005 implements MigrationInterface {
  name = 'Auditoria1000000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    // DD-11: catálogo como CHECK; los tipos son los de §10.2.
    await queryRunner.query(`
      CREATE TABLE evento_auditoria (
        id bigint GENERATED ALWAYS AS IDENTITY,
        ocurrido_en timestamptz NOT NULL DEFAULT clock_timestamp(),
        tipo text NOT NULL,
        usuario_id uuid NULL,
        request_id text NULL,
        datos jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT pk_evento_auditoria PRIMARY KEY (id),
        CONSTRAINT ck_evento_auditoria_tipo CHECK (tipo IN (
          'usuario-registrado', 'sesion-iniciada', 'login-fallido', 'sesion-cerrada',
          'refresh-reuse-detected', 'beneficiario-creado', 'fondeo-aplicado',
          'transferencia-pendiente', 'transferencia-aplicada', 'transferencia-rechazada',
          'codigo-incorrecto'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE FUNCTION auditoria_inmutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'auditoria_inmutable: los eventos de auditoría no se modifican ni se borran'
          USING ERRCODE = 'P0001', CONSTRAINT = 'tg_evento_auditoria_inmutable';
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER tg_evento_auditoria_inmutable
        BEFORE UPDATE OR DELETE ON evento_auditoria
        FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE evento_auditoria');
    await queryRunner.query('DROP FUNCTION auditoria_inmutable()');
  }
}
