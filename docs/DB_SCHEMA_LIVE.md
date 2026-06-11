# DB Schema Live

Actualizado: 2026-06-11

Fuente primaria esperada: Supabase vivo. Este documento refleja el schema que el repo espera despues de aplicar las migraciones locales.

## public.jobs

Campos principales:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users on delete cascade`
- `service text not null references public.service_pricing(service)`
- `status text not null default 'pending'`
- `input_type text not null`
- `input_url text`
- `duration_sec numeric(10,2)`
- `credits_estimated integer`
- `credits_used integer`
- `confirmed_at timestamptz`
- `started_at timestamptz`
- `completed_at timestamptz`
- `result_url text`
- `metrics jsonb`
- `processing_config jsonb`
- `error_message text`
- `created_at timestamptz default now() not null`

`processing_config` guarda la configuracion visual usada para procesar el job: zonas, lineas, ROI, filtros de clases, umbral de confianza y dimensiones del frame de referencia.

## Storage

- Bucket privado `results`: videos anotados en `jobs/{job_id}/result.mp4`, servidos por signed URL.

## Migraciones Relacionadas

- `001_initial_schema.sql`
- `20260611061046_create_results_storage_bucket.sql`
- `20260611064239_add_jobs_processing_config.sql`
