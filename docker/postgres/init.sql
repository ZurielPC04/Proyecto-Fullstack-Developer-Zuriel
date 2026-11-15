-- Roles y bases de la billetera (design.md §3.4, DD-06).
-- Se ejecuta una sola vez al crear el volumen, y en CI con el mismo archivo.
-- Las contraseñas son solo de desarrollo local.
-- Los permisos sobre tablas los conceden las migraciones, no este archivo.

CREATE ROLE billetera_owner WITH LOGIN PASSWORD 'billetera_owner_dev';
CREATE ROLE billetera_app WITH LOGIN PASSWORD 'billetera_app_dev';

CREATE DATABASE billetera OWNER billetera_owner;
CREATE DATABASE billetera_test OWNER billetera_owner;

-- billetera_app no puede crear objetos en el esquema (RNF-11).
-- En PostgreSQL ≥ 15 ya es el valor por defecto; se deja explícito.
\connect billetera
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

\connect billetera_test
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
