// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// DD-42 (design.md §13.1): en el sistema no existe ninguna operación de redondeo (D-18).
const SIN_REDONDEO =
  'D-18/DD-42: los montos son centavos enteros; usa montoTextoACentavos o formatearMXN de @billetera/shared.';

// DD-08 (design.md §2.1): mensajes de la regla de capas de la API.
const CAPAS_CONTROLADOR =
  'DD-08: un controlador no importa repositorios, entidades, typeorm ni pg; llama a un caso de uso.';
const CAPAS_CASOS_USO =
  'DD-08: un caso de uso no importa express ni conoce rutas ni controladores.';
const CAPAS_DOMINIO =
  'DD-08: el dominio son reglas puras: sin typeorm, pg, express, repositorios ni entidades.';

export default defineConfig(
  // eslint-pruebas/ contiene a propósito código prohibido; lo revisa `npm run lint:verificar-reglas`.
  // packages/shared/src/api/openapi.ts lo genera `npm run gen:tipos` (design.md §4.3).
  globalIgnores([
    '**/dist/',
    '**/node_modules/',
    '**/coverage/',
    'eslint-pruebas/',
    'packages/shared/src/api/openapi.ts',
    'mobile/.expo/',
    'mobile/expo-env.d.ts',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    name: 'billetera/dinero',
    // DD-42, ampliada en T-API-03 a api/**. Excepción solo en la línea, con su motivo.
    files: ['packages/shared/**', 'web/**', 'mobile/**', 'api/**'],
    rules: {
      'no-restricted-globals': ['error', { name: 'parseFloat', message: SIN_REDONDEO }],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: SIN_REDONDEO },
        { object: 'Math', property: 'round', message: SIN_REDONDEO },
        { object: 'Math', property: 'floor', message: SIN_REDONDEO },
        { object: 'Math', property: 'ceil', message: SIN_REDONDEO },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='/'][right.type='Literal'][right.value=100]",
          message: `x / 100 produce un float. ${SIN_REDONDEO}`,
        },
        {
          selector: "AssignmentExpression[operator='/='][right.type='Literal'][right.value=100]",
          message: `x /= 100 produce un float. ${SIN_REDONDEO}`,
        },
        {
          selector: "CallExpression[callee.property.name='toFixed']",
          message: `.toFixed() redondea un float. ${SIN_REDONDEO}`,
        },
      ],
    },
  },
  {
    name: 'billetera/almacenamiento-movil',
    files: ['mobile/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@react-native-async-storage/async-storage',
              message:
                'RNF-20/DD-42: tokens e intentos solo en expo-secure-store; nunca AsyncStorage.',
            },
            {
              name: '@billetera/shared',
              importNames: ['formatearMXN'],
              message:
                'D-18 punto 5: Hermes no acepta BigInt en formatToParts; en móvil usa formatearMXNSinIntl.',
            },
          ],
        },
      ],
    },
  },
  // DD-08 (design.md §2.1): la columna "No puede" de cada capa, como verificación automática.
  {
    name: 'billetera/capas-controlador',
    files: ['api/src/modulos/**/*.controlador.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '\\.(repositorio|entidad)(\\.js)?$', message: CAPAS_CONTROLADOR },
            { regex: '^(typeorm|pg)(/|$)', message: CAPAS_CONTROLADOR },
          ],
        },
      ],
    },
  },
  {
    name: 'billetera/capas-casos-uso',
    files: ['api/src/modulos/**/*.casos-uso.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^express(/|$)', message: CAPAS_CASOS_USO },
            { regex: '\\.(controlador|rutas)(\\.js)?$', message: CAPAS_CASOS_USO },
          ],
        },
      ],
    },
  },
  {
    name: 'billetera/capas-dominio',
    files: ['api/src/modulos/**/*.dominio.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^(typeorm|pg|express)(/|$)', message: CAPAS_DOMINIO },
            { regex: '\\.(repositorio|entidad)(\\.js)?$', message: CAPAS_DOMINIO },
          ],
        },
      ],
    },
  },
  // DD-03: la web es React en el navegador; reglas de hooks y globales del DOM.
  {
    name: 'billetera/web',
    files: ['web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.flat.recommended.rules,
  },
  // DD-03: la app móvil es React Native; reglas de hooks.
  {
    name: 'billetera/movil',
    files: ['mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.flat.recommended.rules,
  },
  {
    name: 'billetera/scripts-node',
    files: ['scripts/**'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  prettier,
);
