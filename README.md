# Proyecto Fullstack Developer Zuriel

## Base de datos local

```sh
npm run db:up
```

Levanta PostgreSQL 17 en Docker, en `localhost:5433`, con las bases `billetera` y `billetera_test`.

Si el puerto `5433` está ocupado, cámbialo con la variable `POSTGRES_PORT`, en el shell o en un archivo `.env` en la raíz (por ejemplo, `POSTGRES_PORT=5434`), y usa el mismo puerto en las URL de `api/.env`.

## Pruebas en Windows

En Windows, alguna corrida completa de `npm run test:integracion -w api` puede terminar con un worker de Vitest en `0xC0000409` ("during started state"), sin mensaje en stderr y cada vez en un archivo distinto. Es un problema del entorno, no de las pruebas: al repetir la corrida pasa. La integración usa `pool: 'forks'`, así que el reporte dice en qué archivo ocurrió.
