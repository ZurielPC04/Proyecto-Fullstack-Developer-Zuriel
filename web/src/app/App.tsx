import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider, type createBrowserRouter } from 'react-router';

type Router = ReturnType<typeof createBrowserRouter>;

/** Raíz de la web: el router y el QueryClient llegan desde fuera para poder probarla. */
export function App({ router, queryClient }: { router: Router; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
