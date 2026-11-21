import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 2 `Beneficiario` (design.md §3.2, §3.3; DD-16, D-19).
 * Tabla `beneficiario`, índice único de alias sin mayúsculas y `validar_beneficiario`.
 */
export class Beneficiario1000000000002 implements MigrationInterface {
  name = 'Beneficiario1000000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE beneficiario (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        usuario_id uuid NOT NULL,
        cuenta_id uuid NOT NULL,
        nombre text NOT NULL,
        alias text NOT NULL,
        clabe text NOT NULL,
        creado_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_beneficiario PRIMARY KEY (id),
        CONSTRAINT fk_beneficiario_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id),
        CONSTRAINT fk_beneficiario_cuenta_id FOREIGN KEY (cuenta_id) REFERENCES cuenta (id),
        CONSTRAINT uq_beneficiario_usuario_clabe UNIQUE (usuario_id, clabe),
        CONSTRAINT ck_beneficiario_nombre CHECK (
          length(nombre) BETWEEN 1 AND 100 AND nombre = btrim(nombre) AND nombre !~ '[[:cntrl:]]'
        ),
        CONSTRAINT ck_beneficiario_alias CHECK (
          length(alias) BETWEEN 1 AND 40 AND alias = btrim(alias) AND alias !~ '[[:cntrl:]]'
        ),
        CONSTRAINT ck_beneficiario_clabe CHECK (clabe_valida(clabe))
      )
    `);
    // R-3.7: el alias es único por usuario sin distinguir mayúsculas.
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_beneficiario_usuario_alias ON beneficiario (usuario_id, lower(alias))',
    );

    // §3.3: la cuenta es de usuario y su CLABE coincide con la del beneficiario (R-3.5, D-02).
    await queryRunner.query(`
      CREATE FUNCTION validar_beneficiario() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        c cuenta%ROWTYPE;
      BEGIN
        SELECT * INTO c FROM cuenta WHERE id = NEW.cuenta_id;
        IF NOT FOUND OR c.tipo <> 'USUARIO' THEN
          RAISE EXCEPTION 'validar_beneficiario: la cuenta debe ser de un usuario'
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_beneficiario_validar';
        END IF;
        IF c.clabe <> NEW.clabe THEN
          RAISE EXCEPTION 'validar_beneficiario: la CLABE no es la de la cuenta'
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_beneficiario_validar';
        END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER tg_beneficiario_validar
        BEFORE INSERT ON beneficiario
        FOR EACH ROW EXECUTE FUNCTION validar_beneficiario()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE beneficiario');
    await queryRunner.query('DROP FUNCTION validar_beneficiario()');
  }
}
