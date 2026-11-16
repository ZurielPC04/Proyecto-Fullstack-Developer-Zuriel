// Genera packages/shared/src/esquemas/contrasenas-comunes.ts (design.md §5.1, DD-28).
// Uso: node scripts/generar-contrasenas-comunes.mjs <ruta-del-txt>
// El .txt se descarga de la URL de abajo y no se versiona.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const COMMIT = '2d5dc7504a40962c53f932a6d9d5ece4b213dfc6';
const RUTA_FUENTE = 'Passwords/Common-Credentials/10-million-password-list-top-1000000.txt';
const URL_FUENTE = `https://raw.githubusercontent.com/danielmiessler/SecLists/${COMMIT}/${RUTA_FUENTE}`;
const SHA256 = '1843265e3860a97f417b2236dfa332a0d93b38efef0fee1a0a291fdba5458478';
const LONGITUD_MINIMA = 12;
const CANTIDAD = 1000;
const DESTINO = fileURLToPath(
  new URL('../packages/shared/src/esquemas/contrasenas-comunes.ts', import.meta.url),
);

const ruta = process.argv[2];
if (!ruta) {
  console.error(
    `Uso: node scripts/generar-contrasenas-comunes.mjs <ruta-del-txt>\nFuente: ${URL_FUENTE}`,
  );
  process.exit(1);
}

const bytes = readFileSync(ruta);
const sha = createHash('sha256').update(bytes).digest('hex');
if (sha !== SHA256) {
  console.error(`sha256 incorrecto: se esperaba ${SHA256} y llegó ${sha}.\nFuente: ${URL_FUENTE}`);
  process.exit(1);
}

const distintas = new Set();
for (const linea of bytes.toString('utf8').split('\n')) {
  const nfc = linea.normalize('NFC');
  // Longitud en code points (DD-16), no en unidades UTF-16.
  if ([...nfc].length < LONGITUD_MINIMA) continue;
  distintas.add(nfc.toLowerCase());
  if (distintas.size === CANTIDAD) break;
}
if (distintas.size !== CANTIDAD) {
  console.error(`Solo se encontraron ${distintas.size} contraseñas distintas.`);
  process.exit(1);
}

// Las mismas comillas que elige Prettier: simples, salvo que el texto tenga más simples que dobles.
// JSON.stringify escapa las barras y los controles.
const literal = (s) => {
  const json = JSON.stringify(s).slice(1, -1).replaceAll('\\"', '"');
  const simples = [...s].filter((c) => c === "'").length;
  const dobles = [...s].filter((c) => c === '"').length;
  return simples > dobles ? `"${json.replaceAll('"', '\\"')}"` : `'${json.replaceAll("'", "\\'")}'`;
};

const contenido = `// Archivo generado por scripts/generar-contrasenas-comunes.mjs. No editar a mano.
// Fuente: SecLists (licencia MIT), ${RUTA_FUENTE}
// Commit: ${COMMIT}
// sha256: ${SHA256}
// Las primeras ${CANTIDAD} distintas de ${LONGITUD_MINIMA} o más code points, en NFC y minúsculas (design.md §5.1).
export const CONTRASENAS_COMUNES: readonly string[] = [
${[...distintas].map((s) => `  ${literal(s)},`).join('\n')}
];
`;

writeFileSync(DESTINO, contenido, 'utf8');
console.log(`Escrito ${DESTINO} con ${distintas.size} entradas.`);
