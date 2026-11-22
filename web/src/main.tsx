import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App } from './app/App';
import { crearQueryClient } from './app/query-client';
import { rutas } from './app/rutas';
import './estilos/tokens.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta el elemento #raiz en index.html');

createRoot(raiz).render(
  <StrictMode>
    <App router={createBrowserRouter(rutas)} queryClient={crearQueryClient()} />
  </StrictMode>,
);
