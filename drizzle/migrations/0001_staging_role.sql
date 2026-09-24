DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'datahub_staging') THEN
    CREATE ROLE datahub_staging NOLOGIN;
  END IF;
END $$;
GRANT USAGE, CREATE ON SCHEMA staging TO datahub_staging;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging GRANT ALL ON TABLES TO datahub_staging;
GRANT datahub_staging TO postgres;