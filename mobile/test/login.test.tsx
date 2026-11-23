// T-MOB-02: el teclado no altera el correo ni la contraseña del login (DD-28, R-1.7).
import { render, screen } from '@testing-library/react-native';
import { ProveedorApp } from '../src/contexto';
import { PantallaLogin } from '../src/pantallas/PantallaLogin';
import { contextoDePrueba } from './ayudas';

describe('campos del login', () => {
  it.each(['Correo', 'Contraseña'])(
    'DD-28: el campo %s no capitaliza ni autocorrige',
    async (etiqueta) => {
      const { contexto } = contextoDePrueba(() => Response.json({}));
      await render(
        <ProveedorApp value={contexto}>
          <PantallaLogin alVerEstadoServidor={() => undefined} />
        </ProveedorApp>,
      );
      const campo = screen.getByLabelText(etiqueta);
      expect(campo.props.autoCapitalize).toBe('none');
      expect(campo.props.autoCorrect).toBe(false);
    },
  );
});
