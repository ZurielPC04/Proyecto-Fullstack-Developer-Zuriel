// design.md §14.2: antes de todo, billetera_test queda con el esquema exacto de las migraciones
// y sin datos de corridas anteriores: se revierte todo y se migra desde cero. Revertir también
// ejercita el `down` de cada migración en cada corrida.
import { exigirBaseDePruebas } from '../../apoyo/guarda-base-pruebas.js';
import { aplicarTodas, revertirTodas } from './migraciones.js';

export default async function setup(): Promise<void> {
  // Se niega antes de tocar nada si alguna URL no apunta a billetera_test.
  exigirBaseDePruebas(process.env['PRUEBAS_DATABASE_URL'] ?? '');
  exigirBaseDePruebas(process.env['PRUEBAS_DATABASE_URL_MIGRACIONES'] ?? '');

  // El subproceso de los casos rotos (T-API-09) no reconstruye el esquema mientras el proceso
  // principal tiene la base abierta: solo rompe su invariante y vacía al terminar.
  if (process.env['PRUEBAS_FIXTURE'] === '1') return;

  await revertirTodas();
  await aplicarTodas();
}
