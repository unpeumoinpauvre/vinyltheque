import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL manquant. Ajoute une base Postgres (Railway) ou un .env local.');
}

const needsSsl = /railway|render|supabase|neon|amazonaws/i.test(connectionString || '')
  && !/sslmode=disable/.test(connectionString || '');

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 5
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_public     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS vinyls (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      artist     TEXT DEFAULT '',
      year       TEXT DEFAULT '',
      label      TEXT DEFAULT '',
      notes      TEXT DEFAULT '',
      tracks     JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS images (
      id        SERIAL PRIMARY KEY,
      vinyl_id  INTEGER NOT NULL REFERENCES vinyls(id) ON DELETE CASCADE,
      kind      TEXT NOT NULL CHECK (kind IN ('front','back')),
      mime      TEXT NOT NULL DEFAULT 'image/jpeg',
      data      BYTEA NOT NULL,
      UNIQUE (vinyl_id, kind)
    );

    CREATE INDEX IF NOT EXISTS idx_vinyls_user ON vinyls(user_id);
  `);
  console.log('Schéma de base de données prêt.');
}
