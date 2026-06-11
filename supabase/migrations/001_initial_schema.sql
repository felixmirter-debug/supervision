-- ============================================================
-- TABLES
-- ============================================================

create table public.profiles (
  id              uuid references auth.users on delete cascade primary key,
  role            text not null default 'user' check (role in ('user', 'admin')),
  credits         integer not null default 60 check (credits >= 0),
  plan            text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  total_spent     integer not null default 0,
  total_jobs      integer not null default 0,
  banned_at       timestamptz,
  banned_reason   text,
  banned_by       uuid references auth.users on delete set null,
  created_at      timestamptz default now() not null
);

create table public.service_pricing (
  service           text primary key,
  credits_per_sec   numeric(5,2) not null check (credits_per_sec > 0),
  label             text not null,
  description       text,
  active            boolean not null default true
);

create table public.jobs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users on delete cascade not null,
  service           text references public.service_pricing(service) not null,
  status            text not null default 'pending'
    check (status in ('pending','estimating','confirmed','processing','done','failed','refunded')),
  input_type        text not null check (input_type in ('upload','url','webcam')),
  input_url         text,
  duration_sec      numeric(10,2),
  credits_estimated integer,
  credits_used      integer,
  confirmed_at      timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  result_url        text,
  metrics           jsonb,
  error_message     text,
  created_at        timestamptz default now() not null
);

create table public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  amount      integer not null,
  type        text not null
    check (type in ('signup_bonus','job_reserve','job_charge','job_refund',
                    'admin_refund','purchase','manual_adjustment')),
  job_id      uuid references public.jobs on delete set null,
  description text,
  created_at  timestamptz default now() not null
);

create table public.claims (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users on delete cascade not null,
  job_id           uuid references public.jobs on delete set null,
  type             text not null
    check (type in ('wrong_charge','job_failed','poor_quality','other')),
  description      text not null,
  status           text not null default 'open'
    check (status in ('open','reviewing','resolved_refund','resolved_no_action','rejected')),
  admin_notes      text,
  resolved_by      uuid references auth.users on delete set null,
  credits_returned integer not null default 0,
  created_at       timestamptz default now() not null,
  resolved_at      timestamptz
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_jobs_user_id on public.jobs(user_id);
create index idx_jobs_status on public.jobs(status);
create index idx_jobs_created_at on public.jobs(created_at desc);
create index idx_credit_transactions_user_id on public.credit_transactions(user_id);
create index idx_credit_transactions_job_id on public.credit_transactions(job_id);
create index idx_claims_user_id on public.claims(user_id);
create index idx_claims_status on public.claims(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.service_pricing enable row level security;
alter table public.jobs enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.claims enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "service_pricing_public_read"
  on public.service_pricing for select
  using (active = true);

create policy "jobs_select_own"
  on public.jobs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "credit_transactions_select_own"
  on public.credit_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "claims_select_own"
  on public.claims for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "claims_insert_own"
  on public.claims for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- TRIGGER: auto-create profile + signup bonus on new user
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  insert into public.credit_transactions (user_id, amount, type, description)
  values (new.id, 60, 'signup_bonus', 'Welcome credits — 1 free minute of processing');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

create or replace function public.reserve_credits(
  p_user_id uuid,
  p_job_id  uuid,
  p_amount  integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_credits integer;
begin
  select credits into current_credits
  from public.profiles
  where id = p_user_id
  for update;

  if current_credits < p_amount then
    return false;
  end if;

  update public.profiles
  set
    credits     = credits - p_amount,
    total_spent = total_spent + p_amount
  where id = p_user_id;

  insert into public.credit_transactions (user_id, job_id, amount, type, description)
  values (p_user_id, p_job_id, -p_amount, 'job_reserve', 'Processing reservation');

  return true;
end;
$$;

create or replace function public.refund_credits(
  p_user_id uuid,
  p_job_id  uuid,
  p_amount  integer,
  p_type    text default 'job_refund'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    credits     = credits + p_amount,
    total_spent = greatest(0, total_spent - p_amount)
  where id = p_user_id;

  insert into public.credit_transactions (user_id, job_id, amount, type, description)
  values (p_user_id, p_job_id, p_amount, p_type, 'Credit refund');
end;
$$;

create or replace function public.increment_total_jobs(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set total_jobs = total_jobs + 1
  where id = p_user_id;
end;
$$;

-- ============================================================
-- SEED: service_pricing
-- ============================================================

insert into public.service_pricing (service, credits_per_sec, label, description) values
  ('zone_counting',   0.5,  'Zone Counting',
   'Count people or objects entering/exiting defined polygon zones'),
  ('tracking',        0.8,  'Multi-Object Tracking',
   'Track objects across video frames with persistent unique IDs'),
  ('ppe_detection',   1.0,  'PPE Detection',
   'Detect safety equipment compliance: helmets, vests, gloves'),
  ('traffic',         0.8,  'Traffic Analysis',
   'Count vehicles by type and estimate speed on roads'),
  ('quality_control', 1.0,  'Quality Control',
   'Detect defects and anomalies in products on production lines');
