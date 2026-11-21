import type { EntityManager } from 'typeorm';

/** Lo único que se lee de la cuenta destino: nunca datos del titular (R-3.6). */
export interface CuentaDestino {
  id: string;
  usuarioId: string;
}

/**
 * R-3.5 y D-02: solo cuentas de usuario; Fondeo (tipo SISTEMA) nunca se resuelve. La cuenta
 * no se bloquea: ninguna se borra ni cambia de CLABE o de dueño (`cuenta_protegida`).
 */
export async function buscarCuentaDeUsuarioPorClabe(
  tx: EntityManager,
  clabe: string,
): Promise<CuentaDestino | undefined> {
  const filas = (await tx.query(
    "SELECT id, usuario_id FROM cuenta WHERE clabe = $1 AND tipo = 'USUARIO'",
    [clabe],
  )) as { id: string; usuario_id: string }[];
  const fila = filas[0];
  return fila ? { id: fila.id, usuarioId: fila.usuario_id } : undefined;
}

export interface NuevoBeneficiario {
  usuarioId: string;
  cuentaId: string;
  nombre: string;
  alias: string;
  clabe: string;
}

/**
 * §3.2 `beneficiario`. Un duplicado lanza `23505` en `uq_beneficiario_usuario_clabe` o
 * `uq_beneficiario_usuario_alias`, que el manejador traduce a `409` (§7.3). No hay SELECT
 * previo: tendría una carrera con el INSERT, y el índice único es atómico.
 */
export async function insertarBeneficiario(
  tx: EntityManager,
  beneficiario: NuevoBeneficiario,
): Promise<string> {
  const filas = (await tx.query(
    `INSERT INTO beneficiario (usuario_id, cuenta_id, nombre, alias, clabe)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      beneficiario.usuarioId,
      beneficiario.cuentaId,
      beneficiario.nombre,
      beneficiario.alias,
      beneficiario.clabe,
    ],
  )) as { id: string }[];
  const id = filas[0]?.id;
  if (id === undefined) throw new Error('El INSERT del beneficiario no devolvió id');
  return id;
}

export interface BeneficiarioPropio {
  id: string;
  nombre: string;
  alias: string;
  clabe: string;
  esCuentaPropia: boolean;
}

interface FilaBeneficiario {
  id: string;
  nombre: string;
  alias: string;
  clabe: string;
  es_cuenta_propia: boolean;
}

const aBeneficiario = (fila: FilaBeneficiario): BeneficiarioPropio => ({
  id: fila.id,
  nombre: fila.nombre,
  alias: fila.alias,
  clabe: fila.clabe,
  esCuentaPropia: fila.es_cuenta_propia,
});

// DD-26: esCuentaPropia compara dueños; de la cuenta no sale ningún otro dato.
const SELECT_BENEFICIARIO = `
  SELECT b.id, b.nombre, b.alias, b.clabe, c.usuario_id = b.usuario_id AS es_cuenta_propia
    FROM beneficiario b JOIN cuenta c ON c.id = b.cuenta_id`;

/** R-3.11: solo los del usuario, por alias sin distinguir mayúsculas. */
export async function listarBeneficiariosDeUsuario(
  tx: EntityManager,
  usuarioId: string,
): Promise<BeneficiarioPropio[]> {
  const filas = (await tx.query(
    `${SELECT_BENEFICIARIO} WHERE b.usuario_id = $1 ORDER BY lower(b.alias), b.id`,
    [usuarioId],
  )) as FilaBeneficiario[];
  return filas.map(aBeneficiario);
}

/** R-3.11 y D-10: `undefined` si no existe o no es del usuario. */
export async function buscarBeneficiarioDeUsuario(
  tx: EntityManager,
  usuarioId: string,
  beneficiarioId: string,
): Promise<BeneficiarioPropio | undefined> {
  const filas = (await tx.query(`${SELECT_BENEFICIARIO} WHERE b.id = $1 AND b.usuario_id = $2`, [
    beneficiarioId,
    usuarioId,
  ])) as FilaBeneficiario[];
  const fila = filas[0];
  return fila ? aBeneficiario(fila) : undefined;
}
