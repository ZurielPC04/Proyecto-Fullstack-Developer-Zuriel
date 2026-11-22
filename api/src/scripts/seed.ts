// design.md §3.7 y DD-20: `npm run db:seed`. Vacía las tablas de datos como dueño, genera los
// datos con una semilla fija y termina con la verificación final; si algo falla, código 1.
import pg from 'pg';
import { crearDataSource } from '../plataforma/db/data-source.js';
import { registrarParsers } from '../plataforma/db/parsers.js';
import { contextoPeticion } from '../plataforma/logging/contexto.js';
import { crearLogger } from '../plataforma/logging/logger.js';
import { sembrarDemo } from './seed/demo.js';
import { revisarEntornoSeed } from './seed/guarda.js';
import { leerResumen } from './seed/resumen.js';
import { vaciar } from './seed/vaciar.js';
import { evaluarVerificacion, leerReporte } from './seed/verificacion.js';

const logger = crearLogger();
const entorno = revisarEntornoSeed(process.env);

if (!entorno.ok) {
  logger.error({ motivos: entorno.motivos }, 'el seed se niega a correr');
  process.exitCode = 1;
} else {
  const { config, urlDueno } = entorno;
  const inicio = process.hrtime.bigint();
  registrarParsers();
  const dueno = new pg.Client({ connectionString: urlDueno, options: '-c TimeZone=UTC' });
  const dataSource = crearDataSource({ url: config.DATABASE_URL, poolMax: 2 });
  try {
    await dueno.connect();
    await dataSource.initialize();

    await vaciar(dueno);
    logger.info('tablas de datos vaciadas; Fondeo repuesto');

    // §10.2: los eventos de auditoría del seed llevan request_id = 'seed'.
    await contextoPeticion.run({ reqId: 'seed' }, () =>
      sembrarDemo({ dataSource, config, logger }),
    );
    logger.info('fase 1: usuarios demo creados por los casos de uso');

    const reporte = await leerReporte(dueno, null);
    const fallas = evaluarVerificacion(reporte, { asientosMinimos: 0, cuentaCalienteMinima: null });
    // Duración en milisegundos enteros, con BigInt: no es un monto, pero DD-42 no admite redondeos.
    const milisegundos = Number((process.hrtime.bigint() - inicio) / 1_000_000n);
    const verificacion = {
      asientos: reporte.asientos,
      cuentaCaliente: reporte.movimientosCuentaCaliente,
      saldoIgualSumaAsientos: reporte.cuentasDescuadradas.length === 0,
      sumaSaldos: reporte.sumaSaldos,
      milisegundos,
    };
    if (fallas.length > 0) {
      logger.error({ verificacion, fallas }, 'la verificación final del seed falló');
      process.exitCode = 1;
    } else {
      logger.info({ verificacion }, 'verificación final del seed: todo cuadra');
    }
    // Resumen sin uuid, para comparar dos corridas (§3.7): datos demo públicos, no de la API.
    process.stdout.write(`${JSON.stringify(await leerResumen(dueno), null, 2)}\n`);
  } catch (error) {
    logger.error({ err: error }, 'el seed falló');
    process.exitCode = 1;
  } finally {
    await dueno.end().catch(() => undefined);
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}
