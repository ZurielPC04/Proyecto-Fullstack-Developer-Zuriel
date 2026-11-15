# Proyecto Fullstack Developer Zuriel

## Base de datos local

```sh
npm run db:up
```

Levanta PostgreSQL 17 en Docker, en `localhost:5433`, con las bases `billetera` y `billetera_test`.

Si el puerto `5433` está ocupado, cámbialo con la variable `POSTGRES_PORT`, en el shell o en un archivo `.env` en la raíz (por ejemplo, `POSTGRES_PORT=5434`), y usa el mismo puerto en las URL de `api/.env`.
