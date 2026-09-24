CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE public.db_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  db_type text NOT NULL,
  host text,
  port integer,
  database_name text,
  username text,
  use_ssl boolean NOT NULL DEFAULT true,
  is_internal boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'untested',
  status_message text,
  last_tested_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.db_connections TO authenticated;
GRANT ALL ON public.db_connections TO service_role;
ALTER TABLE public.db_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads connections" ON public.db_connections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users add connections" ON public.db_connections FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND is_internal = false);
CREATE POLICY "Owner or admin updates connections" ON public.db_connections FOR UPDATE TO authenticated USING ((created_by = auth.uid() OR public.has_role(auth.uid(),'admin')) AND is_internal = false);
CREATE POLICY "Owner or admin deletes connections" ON public.db_connections FOR DELETE TO authenticated USING ((created_by = auth.uid() OR public.has_role(auth.uid(),'admin')) AND is_internal = false);

CREATE TABLE public.db_connection_secrets (
  connection_id uuid PRIMARY KEY REFERENCES public.db_connections(id) ON DELETE CASCADE,
  password text NOT NULL
);
GRANT ALL ON public.db_connection_secrets TO service_role;
ALTER TABLE public.db_connection_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.table_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_connection_id uuid NOT NULL REFERENCES public.db_connections(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_columns text NOT NULL DEFAULT '*',
  where_clause text,
  dest_connection_id uuid NOT NULL REFERENCES public.db_connections(id) ON DELETE CASCADE,
  dest_table text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_source_count bigint,
  last_dest_count bigint,
  last_message text,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_mappings TO authenticated;
GRANT ALL ON public.table_mappings TO service_role;
ALTER TABLE public.table_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads mappings" ON public.table_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users add mappings" ON public.table_mappings FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owner or admin deletes mappings" ON public.table_mappings FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.etl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  title text NOT NULL,
  connection_id uuid REFERENCES public.db_connections(id) ON DELETE SET NULL,
  target text,
  status text NOT NULL DEFAULT 'running',
  source_count bigint,
  dest_count bigint,
  message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.etl_jobs TO authenticated;
GRANT ALL ON public.etl_jobs TO service_role;
ALTER TABLE public.etl_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads jobs" ON public.etl_jobs FOR SELECT TO authenticated USING (true);

INSERT INTO public.db_connections (name, db_type, is_internal, status, database_name)
VALUES ('Data Hub Staging', 'PostgreSQL', true, 'connected', 'staging');