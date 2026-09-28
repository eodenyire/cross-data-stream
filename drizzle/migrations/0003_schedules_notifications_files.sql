CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  job_type text NOT NULL CHECK (job_type IN ('ingestion','mapping','conversion')),
  recurrence jsonb NOT NULL DEFAULT '{}'::jsonb,
  cron text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Nairobi',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  notify_emails text[] NOT NULL DEFAULT '{}',
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  lock_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads schedules" ON public.schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Power users add schedules" ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analyst')));
CREATE POLICY "Owner or admin updates schedules" ON public.schedules FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "Owner or admin deletes schedules" ON public.schedules FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(),'admin'));

ALTER TABLE public.etl_jobs ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS etl_jobs_created_idx ON public.etl_jobs (created_at DESC);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  level text NOT NULL DEFAULT 'error',
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.etl_jobs(id) ON DELETE SET NULL,
  emailed_to text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads notifications" ON public.notifications FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team reads datahub files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'datahub-files');
CREATE POLICY "Team uploads datahub files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'datahub-files');
CREATE POLICY "Owner or admin deletes datahub files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'datahub-files' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;