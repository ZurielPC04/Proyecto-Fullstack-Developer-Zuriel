// Almacén seguro de la app móvil (design.md §13.3, RNF-20). En la app es `expo-secure-store`;
// las pruebas inyectan uno en memoria. AsyncStorage está prohibido por lint (DD-42).

/** El subconjunto de `expo-secure-store` que usa la app. */
export type Almacen = {
  getItemAsync(llave: string): Promise<string | null>;
  setItemAsync(llave: string, valor: string): Promise<void>;
  deleteItemAsync(llave: string): Promise<void>;
};

/** Refresh token de la sesión (D-06). El access vive solo en memoria. */
export const LLAVE_REFRESH = 'billetera.refresh';

/** Intento de transferencia pendiente (D-17, §6.2). */
export const LLAVE_INTENTO = 'billetera.intento';
