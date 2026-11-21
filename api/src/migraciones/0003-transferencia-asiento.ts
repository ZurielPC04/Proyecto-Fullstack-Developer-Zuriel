import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 3 `TransferenciaAsiento` (design.md §3.2, §3.3, §3.4; DD-12, DD-13, DD-14, DD-17).
 * `transferencia`, `asiento`, `codigo_confirmacion`, sus funciones y triggers, y los índices
 * del historial (D-11) y del límite diario (D-04).
 */
export class TransferenciaAsiento1000000000003 implements MigrationInterface {
  name = 'TransferenciaAsiento1000000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transferencia (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        usuario_id uuid NULL,
        tipo text NOT NULL,
        cuenta_origen_id uuid NOT NULL,
        cuenta_destino_id uuid NOT NULL,
        beneficiario_id uuid NULL,
        monto_centavos bigint NOT NULL,
        concepto text NOT NULL,
        referencia text NULL,
        estado text NOT NULL,
        motivo_rechazo text NULL,
        llave_idempotencia uuid NULL,
        hash_peticion text NULL,
        creado_en timestamptz NOT NULL,
        aplicada_en timestamptz NULL,
        CONSTRAINT pk_transferencia PRIMARY KEY (id),
        CONSTRAINT fk_transferencia_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id),
        CONSTRAINT fk_transferencia_cuenta_origen_id FOREIGN KEY (cuenta_origen_id) REFERENCES cuenta (id),
        CONSTRAINT fk_transferencia_cuenta_destino_id FOREIGN KEY (cuenta_destino_id) REFERENCES cuenta (id),
        CONSTRAINT fk_transferencia_beneficiario_id FOREIGN KEY (beneficiario_id) REFERENCES beneficiario (id),
        CONSTRAINT uq_transferencia_usuario_llave UNIQUE (usuario_id, llave_idempotencia),
        CONSTRAINT ck_transferencia_tipo CHECK (tipo IN ('FONDEO', 'TRASPASO', 'TERCERO')),
        CONSTRAINT ck_transferencia_monto CHECK (monto_centavos > 0),
        CONSTRAINT ck_transferencia_concepto CHECK (
          length(concepto) BETWEEN 1 AND 40 AND concepto = btrim(concepto) AND concepto !~ '[[:cntrl:]]'
        ),
        CONSTRAINT ck_transferencia_referencia CHECK (referencia ~ '^[0-9]{1,7}$'),
        CONSTRAINT ck_transferencia_estado CHECK (estado IN ('PENDIENTE_CONFIRMACION', 'APLICADA', 'RECHAZADA')),
        CONSTRAINT ck_transferencia_motivo CHECK (
          motivo_rechazo IN ('SALDO_INSUFICIENTE', 'LIMITE_DIARIO_EXCEDIDO', 'CODIGO_AGOTADO', 'CODIGO_EXPIRADO')
        ),
        CONSTRAINT ck_transferencia_hash_peticion CHECK (hash_peticion ~ '^[0-9a-f]{64}$'),
        CONSTRAINT ck_transferencia_cuentas_distintas CHECK (cuenta_origen_id <> cuenta_destino_id),
        CONSTRAINT ck_transferencia_motivo_si_rechazada CHECK ((estado = 'RECHAZADA') = (motivo_rechazo IS NOT NULL)),
        CONSTRAINT ck_transferencia_aplicada_en CHECK ((estado = 'APLICADA') = (aplicada_en IS NOT NULL)),
        CONSTRAINT ck_transferencia_pendiente_solo_tercero CHECK (estado <> 'PENDIENTE_CONFIRMACION' OR tipo = 'TERCERO'),
        CONSTRAINT ck_transferencia_fondeo_sin_usuario CHECK ((tipo = 'FONDEO') = (usuario_id IS NULL)),
        CONSTRAINT ck_transferencia_fondeo_sin_llave CHECK ((tipo = 'FONDEO') = (llave_idempotencia IS NULL)),
        CONSTRAINT ck_transferencia_fondeo_sin_hash CHECK ((tipo = 'FONDEO') = (hash_peticion IS NULL)),
        CONSTRAINT ck_transferencia_fondeo_sin_referencia CHECK ((tipo = 'FONDEO') = (referencia IS NULL)),
        CONSTRAINT ck_transferencia_fondeo_aplicada CHECK (tipo <> 'FONDEO' OR estado = 'APLICADA')
      )
    `);
    // D-04, D-09: suma del límite diario por rango de aplicada_en.
    await queryRunner.query(`
      CREATE INDEX ix_transferencia_limite ON transferencia (usuario_id, aplicada_en)
        WHERE estado = 'APLICADA' AND tipo = 'TERCERO'
    `);

    await queryRunner.query(`
      CREATE TABLE asiento (
        id bigint GENERATED ALWAYS AS IDENTITY,
        transferencia_id uuid NOT NULL,
        cuenta_id uuid NOT NULL,
        monto_centavos bigint NOT NULL,
        tipo_movimiento text NOT NULL,
        creado_en timestamptz NOT NULL,
        CONSTRAINT pk_asiento PRIMARY KEY (id),
        CONSTRAINT fk_asiento_transferencia_id FOREIGN KEY (transferencia_id) REFERENCES transferencia (id),
        CONSTRAINT fk_asiento_cuenta_id FOREIGN KEY (cuenta_id) REFERENCES cuenta (id),
        CONSTRAINT uq_asiento_transferencia_cuenta UNIQUE (transferencia_id, cuenta_id),
        CONSTRAINT ck_asiento_monto CHECK (monto_centavos <> 0),
        CONSTRAINT ck_asiento_tipo_movimiento CHECK (tipo_movimiento IN (
          'DEPOSITO', 'ENVIO', 'RECEPCION', 'TRASPASO_SALIDA', 'TRASPASO_ENTRADA', 'FONDEO_SALIDA'
        )),
        CONSTRAINT ck_asiento_signo CHECK (
          (tipo_movimiento IN ('DEPOSITO', 'RECEPCION', 'TRASPASO_ENTRADA')) = (monto_centavos > 0)
        )
      )
    `);
    // D-11 y §8.2: índices del historial.
    await queryRunner.query(
      'CREATE INDEX ix_asiento_historial ON asiento (cuenta_id, creado_en DESC, id DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_asiento_historial_tipo ON asiento (cuenta_id, tipo_movimiento, creado_en DESC, id DESC)',
    );

    await queryRunner.query(`
      CREATE TABLE codigo_confirmacion (
        transferencia_id uuid NOT NULL,
        codigo_hmac text NOT NULL,
        expira_en timestamptz NOT NULL,
        intentos smallint NOT NULL DEFAULT 0,
        creado_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_codigo_confirmacion PRIMARY KEY (transferencia_id),
        CONSTRAINT fk_codigo_confirmacion_transferencia_id FOREIGN KEY (transferencia_id) REFERENCES transferencia (id),
        CONSTRAINT ck_codigo_confirmacion_hmac CHECK (codigo_hmac ~ '^[0-9a-f]{64}$'),
        CONSTRAINT ck_codigo_confirmacion_intentos CHECK (intentos BETWEEN 0 AND 3)
      )
    `);

    // §3.3: el saldo solo lo escribe este trigger. SECURITY DEFINER con search_path fijo (§3.4).
    await queryRunner.query(`
      CREATE FUNCTION aplicar_asiento() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
      BEGIN
        UPDATE cuenta
           SET saldo_centavos = saldo_centavos + NEW.monto_centavos
         WHERE id = NEW.cuenta_id;   -- fila ya bloqueada por el caso de uso (D-01)
        RETURN NULL;                 -- si el saldo queda negativo, el CHECK lanza 23514
      END $$
    `);
    await queryRunner.query('REVOKE EXECUTE ON FUNCTION aplicar_asiento() FROM PUBLIC');
    await queryRunner.query(`
      CREATE TRIGGER tg_asiento_aplica_saldo
        AFTER INSERT ON asiento
        FOR EACH ROW EXECUTE FUNCTION aplicar_asiento()
    `);

    await queryRunner.query(`
      CREATE FUNCTION asiento_inmutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'asiento_inmutable: los asientos no se modifican ni se borran'
          USING ERRCODE = 'P0001', CONSTRAINT = 'tg_asiento_inmutable';
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER tg_asiento_inmutable
        BEFORE UPDATE OR DELETE ON asiento
        FOR EACH ROW EXECUTE FUNCTION asiento_inmutable()
    `);

    // §3.3 y DD-17: clasificación y pertenencia al insertar. Las cuentas o el beneficiario que
    // no existen los rechaza su FK; las reglas usan IS NOT TRUE para no dejar pasar un NULL.
    await queryRunner.query(`
      CREATE FUNCTION validar_transferencia() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        o cuenta%ROWTYPE;
        d cuenta%ROWTYPE;
        b beneficiario%ROWTYPE;
        valida boolean;
      BEGIN
        SELECT * INTO o FROM cuenta WHERE id = NEW.cuenta_origen_id;
        IF NOT FOUND THEN RETURN NEW; END IF;
        SELECT * INTO d FROM cuenta WHERE id = NEW.cuenta_destino_id;
        IF NOT FOUND THEN RETURN NEW; END IF;

        valida := CASE NEW.tipo
          WHEN 'FONDEO' THEN o.tipo = 'SISTEMA' AND d.tipo = 'USUARIO'
          WHEN 'TRASPASO' THEN o.usuario_id = NEW.usuario_id AND d.usuario_id = NEW.usuario_id
          WHEN 'TERCERO' THEN o.usuario_id = NEW.usuario_id AND d.tipo = 'USUARIO'
                              AND d.usuario_id <> NEW.usuario_id
        END;
        IF valida IS NOT TRUE THEN
          RAISE EXCEPTION 'validar_transferencia: % no corresponde a las cuentas', NEW.tipo
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_transferencia_validar';
        END IF;

        IF NEW.beneficiario_id IS NOT NULL THEN
          SELECT * INTO b FROM beneficiario WHERE id = NEW.beneficiario_id;
          IF NOT FOUND THEN RETURN NEW; END IF;
          IF (b.cuenta_id = NEW.cuenta_destino_id AND b.usuario_id = NEW.usuario_id) IS NOT TRUE THEN
            RAISE EXCEPTION 'validar_transferencia: el beneficiario no es del usuario o no apunta al destino'
              USING ERRCODE = 'P0001', CONSTRAINT = 'tg_transferencia_validar';
          END IF;
        END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER tg_transferencia_validar
        BEFORE INSERT ON transferencia
        FOR EACH ROW EXECUTE FUNCTION validar_transferencia()
    `);

    // §3.3: solo PENDIENTE_CONFIRMACION → APLICADA | RECHAZADA; identidad inmutable; sin borrado.
    await queryRunner.query(`
      CREATE FUNCTION transferencia_transicion() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'transferencia_transicion: las transferencias no se borran'
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_transferencia_transicion';
        END IF;
        IF OLD.estado <> 'PENDIENTE_CONFIRMACION' OR NEW.estado NOT IN ('APLICADA', 'RECHAZADA') THEN
          RAISE EXCEPTION 'transferencia_transicion: transición % → % no permitida', OLD.estado, NEW.estado
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_transferencia_transicion';
        END IF;
        IF (NEW.id, NEW.usuario_id, NEW.tipo, NEW.cuenta_origen_id, NEW.cuenta_destino_id,
            NEW.beneficiario_id, NEW.monto_centavos, NEW.concepto, NEW.referencia,
            NEW.llave_idempotencia, NEW.hash_peticion, NEW.creado_en)
           IS DISTINCT FROM
           (OLD.id, OLD.usuario_id, OLD.tipo, OLD.cuenta_origen_id, OLD.cuenta_destino_id,
            OLD.beneficiario_id, OLD.monto_centavos, OLD.concepto, OLD.referencia,
            OLD.llave_idempotencia, OLD.hash_peticion, OLD.creado_en) THEN
          RAISE EXCEPTION 'transferencia_transicion: la identidad de la transferencia no cambia'
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_transferencia_transicion';
        END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER tg_transferencia_transicion
        BEFORE UPDATE OR DELETE ON transferencia
        FOR EACH ROW EXECUTE FUNCTION transferencia_transicion()
    `);

    // §3.3 y DD-17: coherencia completa, evaluada al confirmar la transacción.
    await queryRunner.query(`
      CREATE FUNCTION comprobar_transferencia(p_id uuid, p_trigger text) RETURNS void
      LANGUAGE plpgsql AS $$
      DECLARE
        t transferencia%ROWTYPE;
        n int;
        suma bigint;
      BEGIN
        SELECT * INTO t FROM transferencia WHERE id = p_id;
        SELECT count(*), coalesce(sum(monto_centavos), 0)::bigint INTO n, suma
          FROM asiento WHERE transferencia_id = p_id;

        IF t.estado <> 'APLICADA' THEN
          IF n <> 0 THEN
            RAISE EXCEPTION 'comprobar_transferencia: transferencia % no aplicada con asientos', p_id
              USING ERRCODE = 'P0001', CONSTRAINT = p_trigger;
          END IF;
          RETURN;
        END IF;
        IF n <> 2 OR suma <> 0 THEN
          RAISE EXCEPTION 'comprobar_transferencia: transferencia % no cuadra (% asientos, suma %)', p_id, n, suma
            USING ERRCODE = 'P0001', CONSTRAINT = p_trigger;
        END IF;

        PERFORM 1 FROM asiento a
         WHERE a.transferencia_id = p_id AND a.cuenta_id = t.cuenta_origen_id
           AND a.monto_centavos = -t.monto_centavos AND a.creado_en = t.aplicada_en
           AND a.tipo_movimiento = CASE t.tipo WHEN 'FONDEO' THEN 'FONDEO_SALIDA'
                                               WHEN 'TERCERO' THEN 'ENVIO'
                                               ELSE 'TRASPASO_SALIDA' END;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'comprobar_transferencia: transferencia % sin cargo correcto', p_id
            USING ERRCODE = 'P0001', CONSTRAINT = p_trigger;
        END IF;

        PERFORM 1 FROM asiento a
         WHERE a.transferencia_id = p_id AND a.cuenta_id = t.cuenta_destino_id
           AND a.monto_centavos = t.monto_centavos AND a.creado_en = t.aplicada_en
           AND a.tipo_movimiento = CASE t.tipo WHEN 'FONDEO' THEN 'DEPOSITO'
                                               WHEN 'TERCERO' THEN 'RECEPCION'
                                               ELSE 'TRASPASO_ENTRADA' END;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'comprobar_transferencia: transferencia % sin abono correcto', p_id
            USING ERRCODE = 'P0001', CONSTRAINT = p_trigger;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE FUNCTION transferencia_cuadra() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM comprobar_transferencia(NEW.id, 'tg_transferencia_cuadra');
        RETURN NULL;
      END $$
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER tg_transferencia_cuadra
        AFTER INSERT OR UPDATE ON transferencia
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION transferencia_cuadra()
    `);
    await queryRunner.query(`
      CREATE FUNCTION asiento_cuadra() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM comprobar_transferencia(NEW.transferencia_id, 'tg_asiento_cuadra');
        RETURN NULL;
      END $$
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER tg_asiento_cuadra
        AFTER INSERT ON asiento
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION asiento_cuadra()
    `);

    // §3.3 y D-07: solo se permite contar un intento más; lo demás es inmutable.
    await queryRunner.query(`
      CREATE FUNCTION codigo_protegido() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'codigo_protegido: los códigos no se borran'
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_codigo_confirmacion_protegido';
        END IF;
        IF NEW.intentos <> OLD.intentos + 1
           OR (NEW.transferencia_id, NEW.codigo_hmac, NEW.expira_en, NEW.creado_en)
              IS DISTINCT FROM (OLD.transferencia_id, OLD.codigo_hmac, OLD.expira_en, OLD.creado_en) THEN
          RAISE EXCEPTION 'codigo_protegido: solo se permite sumar un intento'
            USING ERRCODE = 'P0001', CONSTRAINT = 'tg_codigo_confirmacion_protegido';
        END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER tg_codigo_confirmacion_protegido
        BEFORE UPDATE OR DELETE ON codigo_confirmacion
        FOR EACH ROW EXECUTE FUNCTION codigo_protegido()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE codigo_confirmacion');
    await queryRunner.query('DROP TABLE asiento');
    await queryRunner.query('DROP TABLE transferencia');
    await queryRunner.query('DROP FUNCTION codigo_protegido()');
    await queryRunner.query('DROP FUNCTION asiento_cuadra()');
    await queryRunner.query('DROP FUNCTION transferencia_cuadra()');
    await queryRunner.query('DROP FUNCTION comprobar_transferencia(uuid, text)');
    await queryRunner.query('DROP FUNCTION transferencia_transicion()');
    await queryRunner.query('DROP FUNCTION validar_transferencia()');
    await queryRunner.query('DROP FUNCTION asiento_inmutable()');
    await queryRunner.query('DROP FUNCTION aplicar_asiento()');
  }
}
