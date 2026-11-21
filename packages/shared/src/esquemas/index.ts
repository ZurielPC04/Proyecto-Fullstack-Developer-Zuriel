// Esquemas Zod de entrada (design.md §13.1, §6.7, DD-16, DD-26, DD-28).
export { normalizarTexto, uuid } from './texto.js';
export { esquemaLogin, esquemaRefresh, esquemaRegistro } from './auth.js';
export { esquemaBeneficiario } from './beneficiario.js';
export {
  esquemaConfirmacion,
  esquemaIdempotencyKey,
  esquemaTransferencia,
} from './transferencia.js';
export { esquemaQueryEstadoCuenta, esquemaQueryMovimientos } from './historial.js';
