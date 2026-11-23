// FLAG_SECURE en Android con expo-screen-capture (design.md §13.3, DD-44, RNF-21).

/**
 * `EXPO_PUBLIC_BLOQUEAR_CAPTURAS`: solo el valor `false` desactiva el bloqueo (desarrollo, para
 * grabar el video). Si falta o trae cualquier otro valor, se bloquea, como en producción.
 */
export function debeBloquearCapturas(valor: string | undefined): boolean {
  return valor?.trim().toLowerCase() !== 'false';
}

/**
 * Llama a `preventScreenCaptureAsync` si corresponde. Un fallo del módulo nativo no detiene la
 * app: la capa por `AppState` sigue cubriendo el contenido.
 */
export async function aplicarBloqueoCapturas(
  valor: string | undefined,
  prevenir: () => Promise<void>,
): Promise<boolean> {
  if (!debeBloquearCapturas(valor)) return false;
  try {
    await prevenir();
    return true;
  } catch {
    return false;
  }
}
