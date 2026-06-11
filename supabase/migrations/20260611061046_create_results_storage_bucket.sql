-- Create the private Storage bucket used by the CV processing pipeline.
-- Annotated result videos are uploaded by the backend and exposed through
-- short-lived signed URLs stored in public.jobs.result_url.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'results',
  'results',
  false,
  524288000,
  array['video/mp4']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "service_role_manage_results_objects"
  on storage.objects;

create policy "service_role_manage_results_objects"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'results')
  with check (bucket_id = 'results');
