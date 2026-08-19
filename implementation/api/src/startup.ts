/**
 * Startup entrypoint that runs database migrations before starting the server.
 * Used as the Docker CMD in production.
 */
import { pool } from './db/pool';
import { logger } from './logging';

async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');

  const migration = `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
        CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'partial_success', 'failed');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
        CREATE TYPE task_status AS ENUM ('pending', 'processing', 'completed', 'failed');
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS jobs (
      job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      status job_status NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

    CREATE TABLE IF NOT EXISTS tasks (
      task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
      file_id VARCHAR(512) NOT NULL,
      destination_id VARCHAR(255) NOT NULL,
      status task_status NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      checksum VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_job_id ON tasks(job_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
    CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
    CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  `;

  await pool.query(migration);
  logger.info('Database migrations complete');
}

async function main(): Promise<void> {
  try {
    await runMigrations();
  } catch (err) {
    logger.error('Migration failed', { error: (err as Error).message });
    // Don't exit — server can still handle requests that don't need DB,
    // and health check will tell us if something is wrong
  }

  // Start the server
  await import('./server');
}

main();
