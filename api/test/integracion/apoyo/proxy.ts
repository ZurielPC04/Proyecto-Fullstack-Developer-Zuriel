// Proxy TCP para simular que la base deja de estar disponible después de conectar:
// reenvía al PostgreSQL real y, al cerrarlo, corta las conexiones y rechaza las nuevas.
import { createServer, connect, type Socket } from 'node:net';

export interface ProxyTcp {
  /** URL igual a la original, pero apuntando al proxy. */
  url: string;
  cerrar: () => Promise<void>;
}

export async function abrirProxy(urlOriginal: string): Promise<ProxyTcp> {
  const destino = new URL(urlOriginal);
  const sockets = new Set<Socket>();
  const servidor = createServer((cliente) => {
    const base = connect(Number(destino.port || 5432), destino.hostname);
    for (const s of [cliente, base]) {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
      s.on('error', () => s.destroy());
    }
    cliente.pipe(base).pipe(cliente);
  });
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const direccion = servidor.address();
  if (typeof direccion !== 'object' || direccion === null) throw new Error('proxy sin puerto');

  const url = new URL(urlOriginal);
  url.hostname = '127.0.0.1';
  url.port = String(direccion.port);

  return {
    url: url.toString(),
    cerrar: () =>
      new Promise<void>((resolver) => {
        for (const s of sockets) s.destroy();
        servidor.close(() => resolver());
      }),
  };
}
