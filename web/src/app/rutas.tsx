import type { RouteObject } from 'react-router';
import { NoEncontrada } from '../pantallas/NoEncontrada';
import { Resumen } from '../pantallas/Resumen';
import { Layout } from './Layout';

/** Rutas de design.md §13.2. */
export const rutas: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Resumen /> },
      { path: '*', element: <NoEncontrada /> },
    ],
  },
];
