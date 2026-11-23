// Contenido oculto en segundo plano (design.md §13.3, DD-44, RNF-21). Siempre activa: no depende
// de `EXPO_PUBLIC_BLOQUEAR_CAPTURAS`, que solo controla FLAG_SECURE en Android.
import { type ReactNode, useEffect, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';

/** `inactive` en iOS al abrir el selector de apps; `background` en ambos sistemas. */
function debeOcultar(estado: AppStateStatus | string | null | undefined): boolean {
  return estado === 'inactive' || estado === 'background';
}

export function CapaPrivacidad({ children }: { children: ReactNode }) {
  const [oculto, setOculto] = useState(() => debeOcultar(AppState.currentState));

  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (estado) => {
      setOculto(debeOcultar(estado));
    });
    return () => suscripcion.remove();
  }, []);

  return (
    <View style={estilos.raiz}>
      <View
        style={estilos.raiz}
        // Lo de abajo no se lee con un lector de pantalla mientras la capa está puesta.
        accessibilityElementsHidden={oculto}
        importantForAccessibility={oculto ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {oculto ? (
        <View style={estilos.capa} accessibilityLabel="Contenido oculto">
          <Text style={estilos.logo}>Billetera</Text>
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1 },
  capa: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0b3d91',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: { color: '#ffffff', fontSize: 32, fontWeight: '700' },
});
