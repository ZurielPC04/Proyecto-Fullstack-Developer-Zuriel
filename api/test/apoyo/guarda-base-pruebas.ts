// design.md §14.2: el globalSetup y la limpieza revierten, migran y vacían tablas. Antes de
// tocar nada exigen que la base sea exactamente billetera_test, para que una variable mal
// puesta nunca vacíe la base de desarrollo ni otra. El mensaje nunca trae la URL completa.
const BASE_DE_PRUEBAS = 'billetera_test';

export function exigirBaseDePruebas(url: string): void {
  const parseada = URL.parse(url);
  const base = parseada ? decodeURIComponent(parseada.pathname.replace(/^\//, '')) : undefined;
  if (base !== BASE_DE_PRUEBAS) {
    const nombre = base === undefined ? 'una URL inválida' : `"${base}"`;
    throw new Error(
      `Me niego a preparar o vaciar ${nombre}: las pruebas de integración solo corren contra ${BASE_DE_PRUEBAS}`,
    );
  }
}
