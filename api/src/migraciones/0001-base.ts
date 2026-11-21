import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 1 `Base` (design.md §3.2, §3.3, §3.6; DD-11, DD-16, DD-18, DD-19).
 * `clabe_valida`, `usuario`, `cuenta` con `cuenta_protegida` y la fila de Fondeo.
 */
export class Base1000000000001 implements MigrationInterface {
  name = 'Base1000000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // §3.6: mismo algoritmo que digitoVerificador de shared. plpgsql y no sql: una función sql
    // se inlinea y el planificador podría evaluar substr(...)::int antes del CASE con un literal.
    await queryRunner.query(`
      CREATE FUNCTION clabe_valida(c text) RETURNS boolean
      LANGUAGE plpgsql IMMUTABLE STRICT AS $$
      DECLARE
        pesos constant int[] := ARRAY[3, 7, 1];
        suma int := 0;
      BEGIN
        IF c !~ '^[0-9]{18}$' THEN
          RETURN false;
        END IF;
        FOR i IN 1..17 LOOP
          suma := suma + (substr(c, i, 1)::int * pesos[(i - 1) % 3 + 1]) % 10;
        END LOOP;
        RETURN (10 - suma % 10) % 10 = substr(c, 18, 1)::int;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE usuario (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        correo text NOT NULL,
        hash_contrasena text NOT NULL,
        creado_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_usuario PRIMARY KEY (id),
        CONSTRAINT uq_usuario_correo UNIQUE (correo),
        CONSTRAINT ck_usuario_correo CHECK (
          correo = lower(correo)
          AND length(correo) BETWEEN 3 AND 254
          AND correo = btrim(correo)
          AND correo !~ '[[:cntrl:]]'
        ),
        CONSTRAINT ck_usuario_hash_contrasena CHECK (hash_contrasena LIKE '$argon2id$%')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE cuenta (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        usuario_id uuid NULL,
        tipo text NOT NULL,
        nombre text NOT NULL,
        clabe text NOT NULL,
        saldo_centavos bigint NOT NULL DEFAULT 0,
        creado_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_cuenta PRIMARY KEY (id),
        CONSTRAINT fk_cuenta_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id),
        CONSTRAINT uq_cuenta_clabe UNIQUE (clabe),
        CONSTRAINT uq_cuenta_usuario_nombre UNIQUE (usuario_id, nombre),
        CONSTRAINT ck_cuenta_tipo CHECK (tipo IN ('USUARIO', 'SISTEMA')),
        CONSTRAINT ck_cuenta_nombre CHECK (nombre IN ('Principal', 'Ahorro', 'Fondeo')),
        CONSTRAINT ck_cuenta_clabe CHECK (clabe_valida(clabe)),
        CONSTRAINT ck_cuenta_saldo_no_negativo CHECK (tipo = 'SISTEMA' OR saldo_centavos >= 0),
        CONSTRAINT ck_cuenta_sistema_sin_usuario CHECK ((tipo = 'SISTEMA') = (usuario_id IS NULL)),
        CONSTRAINT ck_cuenta_sistema_es_fondeo CHECK ((tipo = 'SISTEMA') = (nombre = 'Fondeo'))
      )
    `);
    // A lo más una cuenta de sistema (§3.2).
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_cuenta_sistema_unica ON cuenta ((true)) WHERE tipo = 'SISTEMA'`,
    );

    // §3.3 y DD-18: identidad inmutable, sin borrado, y el saldo solo desde otro trigger.
    await queryRunner.query(`
      CREATE FUNCTION cuenta_protegida() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'cuenta_protegida: las cuentas no se borran'
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_cuenta_protegida';
        END IF;
        IF (NEW.id, NEW.usuario_id, NEW.tipo, NEW.nombre, NEW.clabe, NEW.creado_en)
           IS DISTINCT FROM (OLD.id, OLD.usuario_id, OLD.tipo, OLD.nombre, OLD.clabe, OLD.creado_en) THEN
          RAISE EXCEPTION 'cuenta_protegida: la identidad de la cuenta no cambia'
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_cuenta_protegida';
        END IF;
        IF NEW.saldo_centavos <> OLD.saldo_centavos AND pg_trigger_depth() < 2 THEN
          RAISE EXCEPTION 'cuenta_protegida: el saldo solo cambia por asientos'
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_cuenta_protegida';
        END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER tg_cuenta_protegida
        BEFORE UPDATE OR DELETE ON cuenta
        FOR EACH ROW EXECUTE FUNCTION cuenta_protegida()
    `);

    // §3.2 y §3.6: la cuenta Fondeo, única de sistema.
    await queryRunner.query(`
      INSERT INTO cuenta (id, usuario_id, tipo, nombre, clabe)
      VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'SISTEMA', 'Fondeo', '999000000000000001')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE cuenta');
    await queryRunner.query('DROP TABLE usuario');
    await queryRunner.query('DROP FUNCTION cuenta_protegida()');
    await queryRunner.query('DROP FUNCTION clabe_valida(text)');
  }
}
