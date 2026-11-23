#!/usr/bin/env node
/**
 * Small migration runner used by local Compose and CI.  It intentionally keeps
 * the migration files as SQL so they can be reviewed and replayed with psql.
 * The same SQL is accepted by node-pg-migrate (see db/node-pg-migrate/).
 *
 *   DATABASE_URL=postgres://... node db/migrate.mjs
 *
 * A missing DATABASE_URL is an error rather than silently using a developer's
 * default database.  The runner is idempotent and records each file only after
 * its transaction commits.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(root, 'migrations');

export async function migrationFiles() {
  return (await readdir(migrationsDir))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();
}

export async function applyMigrations(client) {
  await client.query('CREATE TABLE IF NOT EXISTS _chatisen_migrations (id varchar(255) PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await client.query('SELECT id FROM _chatisen_migrations ORDER BY id')).rows.map((row) => row.id));
  const appliedNow = [];
  for (const name of await migrationFiles()) {
    if (applied.has(name)) continue;
    const sql = await readFile(join(migrationsDir, name), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _chatisen_migrations (id) VALUES ($1)', [name]);
      await client.query('COMMIT');
      appliedNow.push(name);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${name} rolled back: ${error.message}`, { cause: error });
    }
  }
  return { applied: appliedNow, alreadyApplied: [...applied] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required (example: postgres://chatisen:chatisen@localhost:5432/chatisen)');
    process.exitCode = 2;
  } else {
    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        const first = await applyMigrations(client);
        const second = await applyMigrations(client);
        console.log(JSON.stringify({ first, second }, null, 2));
      } finally {
        await client.end();
      }
    } catch (error) {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    }
  }
}
