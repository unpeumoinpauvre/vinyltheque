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
      is_public     BOOLEAN NOT NULL DEFAULT FALSE,
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

    -- vérification d'adresse et réinitialisation de mot de passe.
    -- On ne stocke que le SHA-256 des jetons, jamais le jeton lui-même.
    ALTER TABLE users ALTER COLUMN is_public SET DEFAULT FALSE;
    UPDATE users SET is_public = FALSE WHERE is_public;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_hash    TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_hash     TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires  TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_users_verify ON users(verify_hash);
    CREATE INDEX IF NOT EXISTS idx_users_reset  ON users(reset_hash);

    -- abonnement : 'free' jusqu'au plafond, 'pro' sans limite.
    -- plan_renews_at sert de filet : si un webhook Stripe se perd, l'accès
    -- reste ouvert jusqu'à cette date au lieu de se couper brutalement.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan               TEXT NOT NULL DEFAULT 'free';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id    TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_interval      TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_renews_at     TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_cancels       BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);
  `);
  console.log('Schéma de base de données prêt.');
}
