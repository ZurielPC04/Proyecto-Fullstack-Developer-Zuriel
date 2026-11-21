import { readFileSync } from 'node:fs';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

// Igual desde src/ y desde dist/: api/<src|dist>/plataforma/http → raíz del repo.
const CONTRATO = new URL('../../../../specs/openapi.yaml', import.meta.url);

/**
 * design.md §4.3 (RNF-28, DD-27): `GET /api/docs` con Swagger UI y `GET /api/openapi.yaml`
 * tal cual. Lee el contrato al montarse, nunca al importar el módulo: en producción no se
 * monta, así que la API arranca aunque `specs/` no exista.
 */
export function rutasDocumentacion(): Router {
  const texto = readFileSync(CONTRATO, 'utf8');
  const documento = parse(texto) as Record<string, unknown>;

  const router = Router();
  router.get('/openapi.yaml', (_req, res) => {
    res.type('application/yaml').send(texto);
  });
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(documento));
  return router;
}
