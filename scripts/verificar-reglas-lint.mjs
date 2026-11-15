// T-SHR-04 (DD-42): demuestra que cada regla de lint del dinero y de AsyncStorage
// reporta su patrón en las rutas donde aplica, y solo en ellas. Revisa los archivos
// de eslint-pruebas/ con la configuración real, como si vivieran en cada ruta.
import { readFile } from 'node:fs/promises';
import { ESLint } from 'eslint';

const REGLAS = new Set([
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
  'no-restricted-imports',
]);

const CASOS = [
  {
    archivo: 'eslint-pruebas/dinero.invalido.ts',
    aplica: ['packages/shared/src', 'web/src', 'mobile/src'],
    noAplica: ['api/src'],
  },
  {
    archivo: 'eslint-pruebas/almacenamiento.invalido.ts',
    aplica: ['mobile/src'],
    noAplica: ['packages/shared/src', 'web/src'],
  },
];

const eslint = new ESLint();
let fallas = 0;

function reportar(ok, texto) {
  console.log(`${ok ? '✓' : '✗'} ${texto}`);
  if (!ok) fallas++;
}

for (const { archivo, aplica, noAplica } of CASOS) {
  const codigo = await readFile(archivo, 'utf8');
  const lineas = codigo.split('\n').map((texto, i) => ({
    numero: i + 1,
    patron: texto.split('//')[0].trim(),
    espera: /\/\/ espera: (\S+)/.exec(texto)?.[1],
    valido: /\/\/ válido\s*$/.test(texto),
  }));
  const nombre = archivo.split('/').pop();

  for (const ruta of [...aplica, ...noAplica]) {
    const debeReportar = aplica.includes(ruta);
    const [resultado] = await eslint.lintText(codigo, { filePath: `${ruta}/${nombre}` });
    const reportadas = resultado.messages.filter((m) => REGLAS.has(m.ruleId ?? ''));
    const enLinea = (n) => reportadas.filter((m) => m.line === n).map((m) => m.ruleId);

    console.log(`\n${archivo} como ${ruta}/`);
    for (const { numero, patron, espera, valido } of lineas) {
      const reglas = enLinea(numero);
      if (espera) {
        const ok = debeReportar ? reglas.includes(espera) : reglas.length === 0;
        reportar(
          ok,
          `${patron} → ${debeReportar ? `rechazado por ${espera}` : 'permitido fuera del alcance'}${ok ? '' : ` (obtenido: ${reglas.join(', ') || 'nada'})`}`,
        );
      } else if (valido) {
        reportar(
          reglas.length === 0,
          `${patron} → permitido${reglas.length ? ` (obtenido: ${reglas.join(', ')})` : ''}`,
        );
      }
    }
  }
}

console.log(
  fallas === 0 ? '\nTodas las reglas de DD-42 funcionan.' : `\n${fallas} verificaciones fallaron.`,
);
process.exit(fallas === 0 ? 0 : 1);
