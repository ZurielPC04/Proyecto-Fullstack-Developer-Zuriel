// GET /health (openapi.yaml, operationId `salud`). Timeout de 15 s, igual que el resto
// de la app (D-17).

export type ResultadoSalud = { ok: true; estado: string } | { ok: false; error: string };

const TIMEOUT_MS = 15_000;

export async function consultarSalud(
  apiUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResultadoSalud> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetchFn(`${apiUrl}/health`, { signal: controlador.signal });
    if (!respuesta.ok) return { ok: false, error: `La API respondió ${respuesta.status}.` };
    const cuerpo = (await respuesta.json()) as { estado?: unknown };
    return { ok: true, estado: String(cuerpo.estado) };
  } catch {
    return {
      ok: false,
      error: `No se pudo conectar con ${apiUrl}. Revisa que la API esté corriendo y que la URL use la IP de la computadora en la red local.`,
    };
  } finally {
    clearTimeout(temporizador);
  }
}
