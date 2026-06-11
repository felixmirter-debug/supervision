alter table public.jobs
  add column if not exists processing_config jsonb;

comment on column public.jobs.processing_config is
  'User-defined visual processing configuration: zones, lines, ROIs, class filters, and thresholds.';
