// design.md §13.2 "Formularios": los mensajes por defecto de Zod en español. `shared` y `web`
// resuelven la misma instalación de zod, así que esto aplica también a los esquemas de shared.
// Se importa antes que cualquier esquema: primero en main.tsx y en el setup de las pruebas.
import { z } from 'zod';
import { es } from 'zod/locales';

z.config(es());
