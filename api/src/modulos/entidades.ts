import { Cuenta } from './cuentas/cuenta.entidad.js';
import { Usuario } from './identidad/usuario.entidad.js';

/** DD-05: lista explícita de entidades, nunca un glob. Cada tarea de módulo agrega las suyas. */
export const entidades = [Usuario, Cuenta];
