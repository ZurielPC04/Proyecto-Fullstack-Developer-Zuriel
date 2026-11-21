import type { MigrationInterface } from 'typeorm';

/**
 * design.md §3.5 y DD-05: lista explícita de migraciones, en orden, nunca un glob.
 * T-API-05 agrega la primera (`Base`).
 */
export const migraciones: (new () => MigrationInterface)[] = [];
