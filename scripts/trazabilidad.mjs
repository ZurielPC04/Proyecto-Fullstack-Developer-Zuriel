// Trazabilidad requerimiento → prueba → commit (RNF-33, DD-46, tasks.md T-DOC-04).
//
// Para cada R- y RNF- de specs/requirements.md verifica:
//   1. al menos una prueba con ese ID en el título (it, test o describe, incluido `.each`), salvo
//      los criterios exentos de EXENTOS_DE_PRUEBA;
//   2. al menos un commit que lo cite en su mensaje.
// Los rangos "R-4.1 a R-4.19" cuentan como cada ID del rango, en títulos y en commits.
// Los criterios de las tareas P2 sin marcar en tasks.md §2 se reportan como omitidos en la línea
// de corte (tasks.md §10) y no hacen fallar el script. Cualquier otro faltante sale con código 1.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8');

/** Criterios que no se verifican con una prueba con su ID en el título, y por qué. */
const EXENTOS_DE_PRUEBA = {
  'RNF-20': 'verificado por CI: job movil (pruebas de sesión e intento con SecureStore simulado)',
  'RNF-22': 'verificado por CI: job unitarias (dinero, clabe y servicios con sus propios IDs)',
  'RNF-25': 'verificado por CI: job unitarias (flujo de transferencia web con sus propios IDs)',
  'RNF-29': 'verificado por CI: los jobs calidad, unitarias, integracion y movil',
  'RNF-30': 'documentación: docs/aws-deploy.md',
  'RNF-31': 'documentación: README.md',
  'RNF-33': 'documentación y proceso: specs/ y este script',
};

const ID = String.raw`(?:R-[0-9B]+\.[0-9]+|RNF-[0-9]+)`;

/** IDs citados en un texto, con los rangos "X a Y" expandidos. */
function idsCitados(texto) {
  const ids = new Set(texto.match(new RegExp(`(?<![\\w.-])${ID}(?![0-9])`, 'g')) ?? []);
  for (const [, desde, hasta] of texto.matchAll(new RegExp(`(${ID}) a (${ID})`, 'g'))) {
    const [prefijoA, numA] = partir(desde);
    const [prefijoB, numB] = partir(hasta);
    if (prefijoA !== prefijoB || numB < numA) continue;
    for (let n = numA; n <= numB; n++) {
      ids.add(prefijoA === 'RNF-' ? `RNF-${String(n).padStart(2, '0')}` : `${prefijoA}${n}`);
    }
  }
  return ids;
}

function partir(id) {
  const m = /^(RNF-|R-[0-9B]+\.)([0-9]+)$/.exec(id);
  return [m[1], Number(m[2])];
}

/** Títulos de it/test/describe, con modificadores (`.only`, `.skip`) y `.each(...)`. */
function titulosDePrueba(codigo) {
  const titulos = [];
  const inicio = /\b(?:it|test|describe)\b((?:\.\w+)*)\s*/g;
  let m;
  while ((m = inicio.exec(codigo))) {
    let i = m.index + m[0].length;
    if (m[1].endsWith('.each')) {
      if (codigo[i] === '`') i = cerrarCadena(codigo, i);
      else if (codigo[i] === '(') i = cerrarParentesis(codigo, i);
      else continue;
      while (/\s/.test(codigo[i] ?? '')) i++;
    }
    if (codigo[i] !== '(') continue;
    i++;
    while (/\s/.test(codigo[i] ?? '')) i++;
    const comilla = codigo[i];
    if (comilla !== "'" && comilla !== '"' && comilla !== '`') continue;
    const fin = cerrarCadena(codigo, i);
    titulos.push(codigo.slice(i + 1, fin - 1));
    inicio.lastIndex = fin;
  }
  return titulos;
}

/** Índice siguiente al cierre de la cadena que abre en `i`. */
function cerrarCadena(codigo, i) {
  const comilla = codigo[i];
  for (let j = i + 1; j < codigo.length; j++) {
    if (codigo[j] === '\\') j++;
    else if (codigo[j] === comilla) return j + 1;
  }
  return codigo.length;
}

/** Índice siguiente al paréntesis que cierra el que abre en `i`, saltando cadenas. */
function cerrarParentesis(codigo, i) {
  let profundidad = 0;
  for (let j = i; j < codigo.length; j++) {
    const c = codigo[j];
    if (c === "'" || c === '"' || c === '`') j = cerrarCadena(codigo, j) - 1;
    else if (c === '(') profundidad++;
    else if (c === ')' && --profundidad === 0) return j + 1;
  }
  return codigo.length;
}

function* archivosDePrueba(dir) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '.git', '.expo'].includes(entrada.name)) continue;
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) yield* archivosDePrueba(ruta);
    else if (/\.test\.tsx?$/.test(entrada.name)) yield ruta;
  }
}

/** Criterios de las tareas P2 que siguen sin marcar en tasks.md §2 (omitidas en la línea de corte). */
function criteriosP2Omitidos(tareas) {
  const omitidos = new Map();
  for (const [, tarea, cuerpo] of tareas.matchAll(
    /^### (T-[A-Z]+-\d+) · .*· P2\n([\s\S]*?)(?=^### |^## )/gm,
  )) {
    const sinMarcar = new RegExp(`^- \\[ \\] ${tarea} `, 'm').test(tareas);
    const criterios = /\*\*Criterios:\*\*(.*)/.exec(cuerpo)?.[1] ?? '';
    if (!sinMarcar) continue;
    for (const id of idsCitados(criterios)) omitidos.set(id, tarea);
  }
  return omitidos;
}

function main() {
  const requisitos = [
    ...new Set(leer('specs/requirements.md').match(new RegExp(`(?<=\\*\\*)${ID}(?=\\*\\*)`, 'g'))),
  ];

  const conPrueba = new Map();
  for (const proyecto of ['packages/shared', 'api', 'web', 'mobile']) {
    for (const archivo of archivosDePrueba(join(RAIZ, proyecto))) {
      for (const titulo of titulosDePrueba(readFileSync(archivo, 'utf8'))) {
        for (const id of idsCitados(titulo)) {
          if (!conPrueba.has(id)) conPrueba.set(id, relative(RAIZ, archivo).replaceAll('\\', '/'));
        }
      }
    }
  }

  const mensajes = execFileSync('git', ['log', '--format=%B'], { cwd: RAIZ, encoding: 'utf8' });
  const conCommit = idsCitados(mensajes);

  const p2 = criteriosP2Omitidos(leer('specs/tasks.md'));
  const faltantes = [];
  const omitidos = [];
  for (const id of requisitos) {
    const sinPrueba = !(id in EXENTOS_DE_PRUEBA) && !conPrueba.has(id);
    const sinCommit = !conCommit.has(id);
    if (!sinPrueba && !sinCommit) continue;
    const falta = [sinPrueba && 'prueba', sinCommit && 'commit'].filter(Boolean).join(' y ');
    (p2.has(id) ? omitidos : faltantes).push(
      p2.has(id) ? `${id}: sin ${falta} (P2 omitida: ${p2.get(id)})` : `${id}: sin ${falta}`,
    );
  }

  const exentos = Object.keys(EXENTOS_DE_PRUEBA).filter((id) => requisitos.includes(id));
  console.log(
    `${requisitos.length} criterios; ${exentos.length} exentos de prueba con ID en el título:`,
  );
  for (const id of exentos) console.log(`  ${id}: ${EXENTOS_DE_PRUEBA[id]}`);
  if (omitidos.length > 0) {
    console.log(
      `\nOmitidos en la línea de corte (tasks.md §10, README "qué haría con más tiempo"):`,
    );
    for (const linea of omitidos) console.log(`  ${linea}`);
  }
  if (faltantes.length > 0) {
    console.error(`\nFaltantes (${faltantes.length}):`);
    for (const linea of faltantes) console.error(`  ${linea}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    omitidos.length > 0
      ? '\nSin faltantes: fuera de las P2 omitidas, cada criterio tiene prueba y commit.'
      : '\nTrazabilidad completa: cada criterio tiene prueba y commit.',
  );
}

main();
