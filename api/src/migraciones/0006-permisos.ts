import type { MigrationInterface, QueryRunner } from 'typeorm';

const APP = 'billetera_app';

/**
 * Funciones que existían con EXECUTE para PUBLIC (el valor por defecto de PostgreSQL) antes
 * de esta migración. `aplicar_asiento()` no está: su migración ya le revocó EXECUTE (§3.4).
 */
const FUNCIONES_CON_EXECUTE_PUBLICO = [
  'clabe_valida(text)',
  'cuenta_protegida()',
  'validar_beneficiario()',
  'asiento_inmutable()',
  'validar_transferencia()',
  'transferencia_transicion()',
  'comprobar_transferencia(uuid, text)',
  'transferencia_cuadra()',
  'asiento_cuadra()',
  'codigo_protegido()',
  'auditoria_inmutable()',
];

/**
 * Migración 6 `Permisos` (design.md §3.4; DD-18, RNF-11). Todos los GRANT juntos, para
 * revisarlos en un solo lugar. `billetera_app` nunca tiene DELETE ni TRUNCATE.
 */
export class Permisos1000000000006 implements MigrationInterface {
  name = 'Permisos1000000000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC');
    await queryRunner.query('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC');
    await queryRunner.query('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC');
    // Parte de cero también para billetera_app: el resultado son exactamente los GRANT de
    // §3.4, aunque alguien le haya concedido algo a mano antes.
    await queryRunner.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${APP}`);
    await queryRunner.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${APP}`);
    await queryRunner.query(`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM ${APP}`);

    const grants = [
      `GRANT SELECT, INSERT ON usuario TO ${APP}`,
      `GRANT UPDATE (id) ON usuario TO ${APP}`,
      `GRANT SELECT ON cuenta TO ${APP}`,
      `GRANT INSERT (id, usuario_id, tipo, nombre, clabe) ON cuenta TO ${APP}`,
      `GRANT UPDATE (id) ON cuenta TO ${APP}`,
      `GRANT SELECT, INSERT ON beneficiario TO ${APP}`,
      `GRANT SELECT, INSERT ON transferencia TO ${APP}`,
      `GRANT UPDATE (estado, motivo_rechazo, aplicada_en) ON transferencia TO ${APP}`,
      `GRANT SELECT, INSERT ON asiento TO ${APP}`,
      `GRANT SELECT, INSERT ON codigo_confirmacion TO ${APP}`,
      `GRANT UPDATE (intentos) ON codigo_confirmacion TO ${APP}`,
      `GRANT SELECT, INSERT ON sesion TO ${APP}`,
      `GRANT UPDATE (usada_en, revocada_en) ON sesion TO ${APP}`,
      `GRANT INSERT ON evento_auditoria TO ${APP}`,
      // §3.4: EXECUTE solo donde PostgreSQL lo revisa en el camino de la API.
      `GRANT EXECUTE ON FUNCTION clabe_valida(text) TO ${APP}`,
      `GRANT EXECUTE ON FUNCTION comprobar_transferencia(uuid, text) TO ${APP}`,
    ];
    for (const grant of grants) await queryRunner.query(grant);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${APP}`);
    await queryRunner.query(
      `REVOKE EXECUTE ON FUNCTION clabe_valida(text), comprobar_transferencia(uuid, text) FROM ${APP}`,
    );
    // Las tablas y secuencias no tenían permisos para PUBLIC; las funciones sí (por defecto).
    await queryRunner.query(
      `GRANT EXECUTE ON FUNCTION ${FUNCIONES_CON_EXECUTE_PUBLICO.join(', ')} TO PUBLIC`,
    );
  }
}
