// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// DD-42 (design.md §13.1): en el sistema no existe ninguna operación de redondeo (D-18).
const SIN_REDONDEO =
  'D-18/DD-42: los montos son centavos enteros; usa montoTextoACentavos o formatearMXN de @billetera/shared.';

export default defineConfig(
  // eslint-pruebas/ contiene a propósito código prohibido; lo revisa `npm run lint:verificar-reglas`.
  // packages/shared/src/api/openapi.ts lo genera `npm run gen:tipos` (design.md §4.3).
  globalIgnores([
    '**/dist/',
    '**/node_modules/',
    '**/coverage/',
    'eslint-pruebas/',
    'packages/shared/src/api/openapi.ts',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    name: 'billetera/dinero',
    files: ['packages/shared/**', 'web/**', 'mobile/**'],
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
          ],
        },
      ],
    },
  },
  {
    name: 'billetera/scripts-node',
    files: ['scripts/**'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  prettier,
);
