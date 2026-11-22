// design.md §3.7, fase 1: usuarios demo por los casos de uso reales, con el DataSource de
// billetera_app: el mismo camino, los mismos triggers y la misma auditoría que en producción.
import { esquemaRegistro } from '@billetera/shared';
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import type { Config } from '../../config/index.js';
import { crearCasosUsoBeneficiarios } from '../../modulos/beneficiarios/beneficiarios.casos-uso.js';
import { crearConsultasCuentas } from '../../modulos/cuentas/cuentas.casos-uso.js';
import { clabeDeUsuario } from '../../modulos/cuentas/cuentas.dominio.js';
import { crearCasosUsoIdentidad } from '../../modulos/identidad/identidad.casos-uso.js';
import { crearTransferencias } from '../../modulos/transferencias/transferencias.casos-uso.js';
import { crearConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { RelojBaseDatos } from '../../plataforma/reloj/index.js';
import { contrasenasArgon2 } from '../../plataforma/seguridad/contrasenas.js';
import { crearTokens } from '../../plataforma/seguridad/tokens.js';

/** Cumple la política de §5.1; va en el README. */
export const CONTRASENA_DEMO = 'demo billetera 2026';

interface UsuarioDemo {
  correo: string;
  nombre: string;
  alias: string;
  /** Saldo final exacto de Principal (§3.7, H3). */
  saldoCentavos: number;
  /** Números de cuenta de 11 dígitos de Principal y Ahorro: CLABEs fijas (§3.7). */
  cuentas: [string, string];
}

/** §3.7: Ana demuestra la transferencia normal, con código y el límite; Beto, el saldo insuficiente. */
export const USUARIOS_DEMO: readonly UsuarioDemo[] = [
  {
    correo: 'ana@demo.mx',
    nombre: 'Ana Demo',
    alias: 'Ana',
    saldoCentavos: 8_000_000,
    cuentas: ['00000000001', '00000000002'],
  },
  {
    correo: 'beto@demo.mx',
    nombre: 'Roberto Demo',
    alias: 'Beto',
    saldoCentavos: 50_000,
    cuentas: ['00000000003', '00000000004'],
  },
];

export async function sembrarDemo(dependencias: {
  dataSource: DataSource;
  config: Config;
  logger: Logger;
}): Promise<void> {
  const { dataSource, config, logger } = dependencias;
  const conTransaccion = crearConTransaccion({ dataSource, logger });
  const reloj = new RelojBaseDatos();
  const transferencias = crearTransferencias({ reloj });
  const consultas = crearConsultasCuentas({ conTransaccion });
  const beneficiarios = crearCasosUsoBeneficiarios({ conTransaccion });

  // CLABEs fijas en el orden en que registrar pide Principal y Ahorro (§3.7, H3).
  const numeros = USUARIOS_DEMO.flatMap((u) => u.cuentas);
  let siguiente = 0;
  const generarClabe = () => {
    const numero = numeros[siguiente++];
    if (numero === undefined) throw new Error('No quedan CLABEs demo');
    return clabeDeUsuario(numero);
  };
  const identidad = await crearCasosUsoIdentidad({
    conTransaccion,
    contrasenas: contrasenasArgon2,
    transferencias,
    generarClabe,
    tokens: crearTokens(config.JWT_SECRETO),
    reloj,
    logger,
    // §3.7, H3: el saldo de la tabla es exacto; la bienvenida no se suma.
    fondeoBienvenidaCentavos: 0,
  });

  const creados: { demo: UsuarioDemo; id: string; principal: { id: string; clabe: string } }[] = [];
  for (const demo of USUARIOS_DEMO) {
    // El mismo esquema que la ruta de registro: la contraseña demo cumple la política.
    const solicitud = esquemaRegistro.parse({ correo: demo.correo, contrasena: CONTRASENA_DEMO });
    const { id } = await identidad.registrar(solicitud);
    const principal = (await consultas.listar(id)).find((c) => c.nombre === 'Principal');
    if (!principal) throw new Error(`${demo.correo} no tiene Principal`);
    await conTransaccion((tx) => transferencias.fondear(tx, principal.id, demo.saldoCentavos));
    creados.push({ demo, id, principal });
  }

  // R-4.26: cada uno tiene al otro como beneficiario.
  for (const { id } of creados) {
    for (const otro of creados.filter((c) => c.id !== id)) {
      await beneficiarios.crear(id, {
        nombre: otro.demo.nombre,
        alias: otro.demo.alias,
        clabe: otro.principal.clabe,
      });
    }
  }
}
