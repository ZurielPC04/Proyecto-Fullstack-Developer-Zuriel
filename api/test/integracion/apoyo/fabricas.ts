// Fábricas de datos de las pruebas de integración (design.md §14.2). Corren como
// billetera_app dentro de conTransaccion: el saldo lo mueve aplicar_asiento por los triggers
// y la suma cero la verifica la base al confirmar. El FONDEO sale del caso de uso `fondear`.
import { randomInt, randomUUID } from 'node:crypto';
import { digitoVerificador } from '@billetera/shared';
import type { DataSource } from 'typeorm';
import { crearTransferencias } from '../../../src/modulos/transferencias/transferencias.casos-uso.js';
import { crearConTransaccion } from '../../../src/plataforma/db/unidad-de-trabajo.js';
import { crearLogger } from '../../../src/plataforma/logging/logger.js';
import { RelojBaseDatos } from '../../../src/plataforma/reloj/index.js';

export const FONDEO_ID = '00000000-0000-0000-0000-000000000001';
export const HASH_DE_PRUEBA = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

export interface UsuarioDePrueba {
  usuarioId: string;
  correo: string;
  principalId: string;
  ahorroId: string;
}

export function clabeAleatoria(): string {
  let primeros = '999180';
  for (let i = 0; i < 11; i++) primeros += String(randomInt(0, 10));
  return `${primeros}${digitoVerificador(primeros)}`;
}

function conTransaccionDe(dataSource: DataSource) {
  return crearConTransaccion({ dataSource, logger: crearLogger({ nivel: 'silent' }) });
}

/** D-20: un usuario con sus cuentas Principal y Ahorro, en saldo 0. */
export async function crearUsuarioConCuentas(dataSource: DataSource): Promise<UsuarioDePrueba> {
  const correo = `prueba-${randomUUID()}@prueba.mx`;
  return conTransaccionDe(dataSource)(async (tx) => {
    const [usuario] = (await tx.query(
      'INSERT INTO usuario (correo, hash_contrasena) VALUES ($1, $2) RETURNING id',
      [correo, HASH_DE_PRUEBA],
    )) as { id: string }[];
    const cuentas = (await tx.query(
      `INSERT INTO cuenta (usuario_id, tipo, nombre, clabe)
       VALUES ($1, 'USUARIO', 'Principal', $2), ($1, 'USUARIO', 'Ahorro', $3)
       RETURNING id, nombre`,
      [usuario?.id, clabeAleatoria(), clabeAleatoria()],
    )) as { id: string; nombre: string }[];
    return {
      usuarioId: usuario?.id ?? '',
      correo,
      principalId: cuentas.find((c) => c.nombre === 'Principal')?.id ?? '',
      ahorroId: cuentas.find((c) => c.nombre === 'Ahorro')?.id ?? '',
    };
  });
}

/** D-02: un FONDEO por el caso de uso real `fondear` (T-API-11), en su propia transacción. */
export async function fondear(
  dataSource: DataSource,
  cuentaId: string,
  montoCentavos: number,
  concepto = 'Depósito',
): Promise<string> {
  const transferencias = crearTransferencias({ reloj: new RelojBaseDatos() });
  return conTransaccionDe(dataSource)((tx) =>
    transferencias.fondear(tx, cuentaId, montoCentavos, concepto),
  );
}
