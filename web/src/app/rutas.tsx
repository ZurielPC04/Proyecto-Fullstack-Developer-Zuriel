import type { RouteObject } from 'react-router';
import { RutaProtegida } from '../auth/RutaProtegida';
import { Historial } from '../pantallas/Historial';
import { Login } from '../pantallas/Login';
import { NoEncontrada } from '../pantallas/NoEncontrada';
import { Registro } from '../pantallas/Registro';
import { Resumen } from '../pantallas/Resumen';
import { Layout } from './Layout';

/** Rutas de design.md §13.2. */
export const rutas: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/registro', element: <Registro /> },
      {
        element: <RutaProtegida />,
        children: [
          { path: '/', element: <Resumen /> },
          { path: '/cuentas/:cuentaId', element: <Historial /> },
        ],
      },
      { path: '*', element: <NoEncontrada /> },
    ],
  },
];
