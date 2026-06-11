# CV SaaS — Phase 1: Foundations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete foundation: monorepo scaffolding, Supabase schema, FastAPI backend core (auth, credits, models, jobs), and Next.js 16 frontend with Supabase auth + Zustand.

**Architecture:** Monorepo with `frontend/` (Next.js 16, App Router) and `backend/` (FastAPI). Supabase handles Postgres + Auth + Storage. Backend uses supabase-py with service_role key (bypasses RLS). Frontend uses @supabase/ssr for session management. Zustand for global auth/UI state. TanStack Query for server state.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, @supabase/ssr, FastAPI, Python 3.11+, supervision, ultralytics (YOLOv8), supabase-py, PyJWT

**Phases:**
- ✅ Phase 1 (this): Foundations — scaffolding, DB, backend core, frontend shell
- Phase 2: Backend CV services (5 services + WebSocket)
- Phase 3: Frontend pages (landing, dashboard, service pages, admin)

---

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `Makefile`
- Create: `.gitignore`
- Create: `backend/.env.example`
- Create: `frontend/.env.local.example`
- Create: `backend/core/__init__.py`
- Create: `backend/routers/__init__.py`
- Create: `backend/routers/services/__init__.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: Crear estructura de carpetas**

```bash
cd "C:\Users\feedmite\Desktop\projects\supervision"
mkdir -p backend/core backend/routers/services backend/tests
mkdir -p frontend
mkdir -p supabase/migrations
mkdir -p docs/plans docs/superpowers/specs
```

- [ ] **Step 2: Crear Makefile**

Crear `Makefile` en la raíz con este contenido exacto:

```makefile
.PHONY: dev install backend frontend

dev:
	@echo "Starting backend and frontend..."
	@start cmd /k "cd backend && uvicorn main:app --reload --port 8000"
	@start cmd /k "cd frontend && npm run dev"

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

backend:
	cd backend && uvicorn main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test-backend:
	cd backend && pytest tests/ -v

type-check-frontend:
	cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Crear .gitignore**

```
# Python
__pycache__/
*.py[cod]
.env
.venv
venv/
*.egg-info/
dist/
build/
.pytest_cache/
.mypy_cache/

# Node
node_modules/
.next/
out/
.env.local
.env.development.local
.env.test.local
.env.production.local
npm-debug.log*

# YOLO models
*.pt
*.onnx

# OS
.DS_Store
Thumbs.db

# Supabase
supabase/.branches
supabase/.temp
```

- [ ] **Step 4: Crear archivos __init__.py**

```bash
echo "" > backend/core/__init__.py
echo "" > backend/routers/__init__.py
echo "" > backend/routers/services/__init__.py
echo "" > backend/tests/__init__.py
```

- [ ] **Step 5: Crear backend/.env.example**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
ALLOWED_ORIGINS=http://localhost:3000
PPE_MODEL_PATH=yolov8n.pt
QC_MODEL_PATH=yolov8n.pt
```

- [ ] **Step 6: Crear frontend/.env.local.example**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

### Task 2: Supabase Database Migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Crear archivo de migración**

Crear `supabase/migrations/001_initial_schema.sql` con el siguiente contenido completo:

```sql
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

-- profiles: user reads/updates own row
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- service_pricing: public read for active services
create policy "service_pricing_public_read"
  on public.service_pricing for select
  using (active = true);

-- jobs: user reads own jobs
create policy "jobs_select_own"
  on public.jobs for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- credit_transactions: user reads own, no update/delete (immutable audit)
create policy "credit_transactions_select_own"
  on public.credit_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- claims: user creates and reads own
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

-- Atomic credit reservation with FOR UPDATE lock
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

-- Refund credits (used on failure, partial completion, or admin action)
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

-- Increment total_jobs counter
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
```

- [ ] **Step 2: Aplicar migración via Supabase MCP**

Usar la herramienta `mcp__plugin_supabase_supabase__apply_migration` con el SQL completo del archivo anterior.

- [ ] **Step 3: Verificar tablas creadas**

Ejecutar via MCP `execute_sql`:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
```
Resultado esperado: `claims`, `credit_transactions`, `jobs`, `profiles`, `service_pricing`

- [ ] **Step 4: Verificar seed de service_pricing**

```sql
select service, credits_per_sec, label from public.service_pricing order by service;
```
Resultado esperado: 5 filas con los 5 servicios.

- [ ] **Step 5: Verificar RPC functions**

```sql
select proname from pg_proc
where proname in ('reserve_credits', 'refund_credits', 'increment_total_jobs', 'handle_new_user')
order by proname;
```
Resultado esperado: 4 funciones.

- [ ] **Step 6: Actualizar docs/DB_SCHEMA_LIVE.md**

Crear `docs/DB_SCHEMA_LIVE.md` con el schema aplicado (copiar la sección de tablas del SQL anterior como referencia).

---

### Task 3: Backend — requirements.txt y main.py

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/main.py`
- Create: `backend/pytest.ini`

- [ ] **Step 1: Crear backend/requirements.txt**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
python-multipart==0.0.17
PyJWT==2.10.1
supabase==2.10.0
supervision==0.24.0
ultralytics==8.3.50
opencv-python-headless==4.10.0.84
numpy==1.26.4
httpx==0.28.0
python-dotenv==1.0.1
aiofiles==24.1.0
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Instalar dependencias**

```bash
cd backend
pip install -r requirements.txt
```

Verificar sin errores de instalación.

- [ ] **Step 3: Crear backend/main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

load_dotenv()

from core.models import load_all_models
from routers import jobs

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_all_models()
    yield

app = FastAPI(
    title="CV SaaS API",
    version="1.0.0",
    lifespan=lifespan,
)

origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Crear backend/pytest.ini**

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

- [ ] **Step 5: Verificar que FastAPI arranca**

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Visitar `http://localhost:8000/health`. Respuesta esperada: `{"status": "ok"}`

Detener el servidor con Ctrl+C.

---

### Task 4: Backend Core — db.py y auth.py

**Files:**
- Create: `backend/core/db.py`
- Create: `backend/core/auth.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Crear backend/core/db.py**

```python
from supabase import create_client, Client
from functools import lru_cache
import os


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)
```

- [ ] **Step 2: Crear backend/core/auth.py**

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os
from core.db import get_supabase

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            os.environ["SUPABASE_JWT_SECRET"],
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    supabase = get_supabase()
    result = (
        supabase.table("profiles")
        .select("banned_at, role, credits")
        .eq("id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="User profile not found")

    profile = result.data
    if profile.get("banned_at"):
        raise HTTPException(status_code=403, detail="Account suspended")

    return {
        "user_id": user_id,
        "role": profile["role"],
        "credits": profile["credits"],
    }


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
```

- [ ] **Step 3: Escribir tests para auth**

Crear `backend/tests/test_auth.py`:

```python
import pytest
import jwt
import time
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

SECRET = "test-secret-32-chars-long-padding!!"


def make_token(user_id: str, expired: bool = False) -> str:
    exp = time.time() - 100 if expired else time.time() + 3600
    return jwt.encode(
        {"sub": user_id, "aud": "authenticated", "exp": int(exp)},
        SECRET,
        algorithm="HS256",
    )


@patch.dict("os.environ", {"SUPABASE_JWT_SECRET": SECRET})
@patch("core.auth.get_supabase")
@pytest.mark.asyncio
async def test_valid_token_returns_user(mock_get_supabase):
    mock_client = MagicMock()
    mock_get_supabase.return_value = mock_client
    (
        mock_client.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
        .data
    ) = {"banned_at": None, "role": "user", "credits": 60}

    from core.auth import get_current_user

    token = make_token("user-abc")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    result = await get_current_user(creds)

    assert result["user_id"] == "user-abc"
    assert result["role"] == "user"
    assert result["credits"] == 60


@patch.dict("os.environ", {"SUPABASE_JWT_SECRET": SECRET})
@pytest.mark.asyncio
async def test_expired_token_raises_401():
    from core.auth import get_current_user

    token = make_token("user-abc", expired=True)
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(creds)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


@patch.dict("os.environ", {"SUPABASE_JWT_SECRET": SECRET})
@pytest.mark.asyncio
async def test_invalid_token_raises_401():
    from core.auth import get_current_user

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not.a.token")

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(creds)
    assert exc_info.value.status_code == 401


@patch.dict("os.environ", {"SUPABASE_JWT_SECRET": SECRET})
@patch("core.auth.get_supabase")
@pytest.mark.asyncio
async def test_banned_user_raises_403(mock_get_supabase):
    mock_client = MagicMock()
    mock_get_supabase.return_value = mock_client
    (
        mock_client.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
        .data
    ) = {"banned_at": "2026-01-01T00:00:00Z", "role": "user", "credits": 0}

    from core.auth import get_current_user

    token = make_token("banned-user")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(creds)
    assert exc_info.value.status_code == 403
```

- [ ] **Step 4: Correr tests**

```bash
cd backend
pytest tests/test_auth.py -v
```

Resultado esperado:
```
PASSED tests/test_auth.py::test_valid_token_returns_user
PASSED tests/test_auth.py::test_expired_token_raises_401
PASSED tests/test_auth.py::test_invalid_token_raises_401
PASSED tests/test_auth.py::test_banned_user_raises_403
4 passed
```

---

### Task 5: Backend Core — credits.py y models.py

**Files:**
- Create: `backend/core/credits.py`
- Create: `backend/core/models.py`
- Create: `backend/tests/test_credits.py`

- [ ] **Step 1: Escribir test de credits primero (TDD)**

Crear `backend/tests/test_credits.py`:

```python
import pytest
from core.credits import estimate_cost


def test_estimate_basic():
    assert estimate_cost(30.0, 0.5) == 15


def test_estimate_ceiling():
    # 11 * 0.8 = 8.8 → ceil = 9
    assert estimate_cost(11.0, 0.8) == 9


def test_estimate_exact():
    # 10 * 0.8 = 8.0 → ceil = 8
    assert estimate_cost(10.0, 0.8) == 8


def test_estimate_zero():
    assert estimate_cost(0.0, 1.0) == 0


def test_estimate_one_second():
    assert estimate_cost(1.0, 1.0) == 1


def test_estimate_ppe():
    # 60 seconds * 1.0 = 60 credits (free tier exact)
    assert estimate_cost(60.0, 1.0) == 60


def test_estimate_large():
    # 1 hour at cheapest rate
    assert estimate_cost(3600.0, 0.5) == 1800
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd backend
pytest tests/test_credits.py -v
```

Resultado esperado: `ModuleNotFoundError` o `ImportError` porque `core/credits.py` no existe.

- [ ] **Step 3: Crear backend/core/credits.py**

```python
import math
from core.db import get_supabase


def estimate_cost(duration_sec: float, credits_per_sec: float) -> int:
    """Returns the ceiling of duration * rate. Pure function, no DB access."""
    return math.ceil(duration_sec * credits_per_sec)


def get_service_pricing(service: str) -> dict:
    """Fetch pricing for a service from DB. Raises ValueError if not found/inactive."""
    supabase = get_supabase()
    result = (
        supabase.table("service_pricing")
        .select("service, credits_per_sec, label, description")
        .eq("service", service)
        .eq("active", True)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError(f"Service '{service}' not found or inactive")
    return result.data


def reserve_credits(user_id: str, job_id: str, amount: int) -> None:
    """Atomically deducts credits via RPC. Raises ValueError if insufficient."""
    supabase = get_supabase()
    result = supabase.rpc(
        "reserve_credits",
        {"p_user_id": user_id, "p_job_id": job_id, "p_amount": amount},
    ).execute()
    if result.data is False:
        raise ValueError("Insufficient credits")


def refund_credits(
    user_id: str,
    job_id: str,
    amount: int,
    reason: str = "job_refund",
) -> None:
    """Returns credits to user. Used on failure or partial completion."""
    supabase = get_supabase()
    supabase.rpc(
        "refund_credits",
        {
            "p_user_id": user_id,
            "p_job_id": job_id,
            "p_amount": amount,
            "p_type": reason,
        },
    ).execute()
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
cd backend
pytest tests/test_credits.py -v
```

Resultado esperado: `7 passed`

- [ ] **Step 5: Crear backend/core/models.py**

```python
from ultralytics import YOLO
import os

_models: dict[str, YOLO] = {}

MODEL_MAP = {
    "zone_counting": "yolov8n.pt",
    "tracking": "yolov8n.pt",
    "traffic": "yolov8n.pt",
    "ppe_detection": os.getenv("PPE_MODEL_PATH", "yolov8n.pt"),
    "quality_control": os.getenv("QC_MODEL_PATH", "yolov8n.pt"),
}


def load_all_models() -> None:
    """Load all YOLO models at startup. YOLO auto-downloads .pt files on first use."""
    for service, model_path in MODEL_MAP.items():
        print(f"  Loading model for '{service}': {model_path}")
        _models[service] = YOLO(model_path)
    print(f"✓ {len(_models)} models ready")


def get_model(service: str) -> YOLO:
    if service not in _models:
        raise RuntimeError(
            f"Model '{service}' not loaded. Ensure load_all_models() ran at startup."
        )
    return _models[service]
```

---

### Task 6: Backend — Jobs Router

**Files:**
- Create: `backend/routers/jobs.py`
- Create: `backend/tests/test_jobs.py`

- [ ] **Step 1: Crear backend/routers/jobs.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from core.auth import get_current_user
from core.db import get_supabase

router = APIRouter()

JOB_SELECT = (
    "id, status, service, input_type, duration_sec, "
    "credits_estimated, credits_used, result_url, metrics, "
    "error_message, created_at, completed_at"
)


@router.get("/{job_id}")
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("jobs")
        .select(JOB_SELECT)
        .eq("id", job_id)
        .eq("user_id", user["user_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return result.data


@router.get("/")
async def list_jobs(
    limit: int = 20,
    offset: int = 0,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("jobs")
        .select(JOB_SELECT)
        .eq("user_id", user["user_id"])
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"jobs": result.data or [], "limit": limit, "offset": offset}
```

- [ ] **Step 2: Crear backend/tests/test_jobs.py**

```python
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import jwt, time, os

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-32-chars-long-padding!!")

from main import app

SECRET = "test-secret-32-chars-long-padding!!"


def auth_header(user_id: str = "user-123") -> dict:
    token = jwt.encode(
        {"sub": user_id, "aud": "authenticated", "exp": int(time.time() + 3600)},
        SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@patch("core.auth.get_supabase")
@patch("core.db.get_supabase")
def test_get_job_returns_job(mock_db, mock_auth):
    profile_mock = MagicMock()
    profile_mock.data = {"banned_at": None, "role": "user", "credits": 60}
    mock_auth.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = profile_mock

    job_mock = MagicMock()
    job_mock.data = {
        "id": "job-xyz",
        "status": "done",
        "service": "zone_counting",
        "input_type": "upload",
        "duration_sec": 30.0,
        "credits_estimated": 15,
        "credits_used": 15,
        "result_url": "https://example.com/result.mp4",
        "metrics": {"count": 5},
        "error_message": None,
        "created_at": "2026-06-10T00:00:00Z",
        "completed_at": "2026-06-10T00:00:35Z",
    }
    mock_db.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = job_mock

    client = TestClient(app)
    response = client.get("/jobs/job-xyz", headers=auth_header())

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "job-xyz"
    assert data["status"] == "done"


@patch("core.auth.get_supabase")
@patch("core.db.get_supabase")
def test_get_job_not_found_returns_404(mock_db, mock_auth):
    profile_mock = MagicMock()
    profile_mock.data = {"banned_at": None, "role": "user", "credits": 60}
    mock_auth.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = profile_mock

    not_found_mock = MagicMock()
    not_found_mock.data = None
    mock_db.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = not_found_mock

    client = TestClient(app)
    response = client.get("/jobs/nonexistent", headers=auth_header())

    assert response.status_code == 404
```

- [ ] **Step 3: Correr todos los tests del backend**

```bash
cd backend
pytest tests/ -v
```

Resultado esperado: todos los tests pasan (auth + credits + jobs).

---

### Task 7: Frontend — Scaffolding con Next.js 16

**Files:**
- Create: `frontend/` (via create-next-app)
- Modify: `frontend/package.json` (añadir dependencias extra)

- [ ] **Step 1: Crear la app Next.js**

```bash
cd "C:\Users\feedmite\Desktop\projects\supervision"
npx create-next-app@latest frontend --yes
```

Esto crea `frontend/` con TypeScript, Tailwind, ESLint, App Router y Turbopack activados.

- [ ] **Step 2: Instalar dependencias adicionales**

```bash
cd frontend
npm install @supabase/supabase-js @supabase/ssr zustand @tanstack/react-query lucide-react sonner class-variance-authority clsx tailwind-merge
```

- [ ] **Step 3: Instalar shadcn/ui**

```bash
cd frontend
npx shadcn@latest init -d
```

Cuando pregunte el tema, seleccionar `slate` o aceptar el default.

- [ ] **Step 4: Añadir componentes shadcn/ui necesarios para la Fase 1**

```bash
cd frontend
npx shadcn@latest add button card dialog input label badge progress tabs
```

- [ ] **Step 5: Crear frontend/.env.local**

Copiar `frontend/.env.local.example` a `frontend/.env.local` y completar con los valores de Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

- [ ] **Step 6: Verificar que el frontend arranca**

```bash
cd frontend
npm run dev
```

Visitar `http://localhost:3000`. Debe mostrar la página default de Next.js. Detener con Ctrl+C.

---

### Task 8: Frontend — Supabase Auth Setup

**Files:**
- Create: `frontend/lib/supabase/client.ts`
- Create: `frontend/lib/supabase/server.ts`
- Create: `frontend/middleware.ts`
- Create: `frontend/lib/formatters.ts`
- Create: `frontend/lib/api.ts`

- [ ] **Step 1: Crear frontend/lib/supabase/client.ts**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

- [ ] **Step 2: Crear frontend/lib/supabase/server.ts**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Crear frontend/middleware.ts**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const protectedPaths = ['/dashboard', '/services', '/admin']
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  )

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (request.nextUrl.pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 4: Crear frontend/lib/formatters.ts**

```typescript
export function formatCredits(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount) + ' cr'
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}
```

- [ ] **Step 5: Crear frontend/lib/api.ts**

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {}

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, error.detail || 'Request failed')
  }

  return res.json() as Promise<T>
}

export type Job = {
  id: string
  status: 'pending' | 'estimating' | 'confirmed' | 'processing' | 'done' | 'failed' | 'refunded'
  service: string
  input_type: string
  duration_sec: number | null
  credits_estimated: number | null
  credits_used: number | null
  result_url: string | null
  metrics: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export type EstimateResponse = {
  job_id: string
  duration_sec: number
  credits_estimated: number
  credits_available: number
}

export async function getJob(jobId: string, token: string): Promise<Job> {
  return apiFetch<Job>(`/jobs/${jobId}`, {}, token)
}

export async function listJobs(
  token: string,
  limit = 20,
  offset = 0
): Promise<{ jobs: Job[]; limit: number; offset: number }> {
  return apiFetch(`/jobs/?limit=${limit}&offset=${offset}`, {}, token)
}

export { ApiError }
```

---

### Task 9: Frontend — Zustand Stores + Providers + Root Layout

**Files:**
- Create: `frontend/stores/auth-store.ts`
- Create: `frontend/app/providers.tsx`
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/app/globals.css`
- Create: `frontend/components/nav.tsx`

- [ ] **Step 1: Crear frontend/stores/auth-store.ts**

```typescript
import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'

export interface Profile {
  id: string
  role: 'user' | 'admin'
  credits: number
  plan: string
  banned_at: string | null
}

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () =>
    set({ user: null, session: null, profile: null, isLoading: false }),
}))
```

- [ ] **Step 2: Crear frontend/app/providers.tsx**

```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { Toaster } from 'sonner'

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setSession, setProfile, setLoading, reset } = useAuthStore()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (!session) setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('id, role, credits, plan, banned_at')
          .eq('id', session.user.id)
          .single()
        setProfile(data)
      } else {
        reset()
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClientRef = useRef<QueryClient | null>(null)
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 60 * 1000, retry: 1 },
      },
    })
  }

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <AuthProvider>
        {children}
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 3: Reemplazar frontend/app/layout.tsx**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CV SaaS — Computer Vision Services',
  description:
    'Professional computer vision: zone counting, object tracking, PPE detection, traffic analysis, quality control.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Crear frontend/components/nav.tsx**

```tsx
'use client'

import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatCredits } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, LayoutDashboard, LogOut } from 'lucide-react'

export function Nav() {
  const { user, profile } = useAuthStore()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <Eye className="h-5 w-5 text-violet-400" />
          <span>CV SaaS</span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {profile && (
                <Badge variant="secondary" className="font-mono">
                  {formatCredits(profile.credits)}
                </Badge>
              )}
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">
                  <LayoutDashboard className="h-4 w-4 mr-1" />
                  Dashboard
                </Link>
              </Button>
              {profile?.role === 'admin' && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin">Admin</Link>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link href="/login">Iniciar sesión</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}
```

- [ ] **Step 5: Crear página temporal app/page.tsx para verificar**

```tsx
import { Nav } from '@/components/nav'

export default function Home() {
  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold mb-4">CV SaaS</h1>
        <p className="text-muted-foreground text-lg">
          Computer Vision as a Service — Phase 1 foundation complete
        </p>
      </main>
    </>
  )
}
```

- [ ] **Step 6: TypeScript check**

```bash
cd frontend
npx tsc --noEmit
```

Resultado esperado: sin errores.

- [ ] **Step 7: Arrancar y verificar visualmente**

```bash
cd frontend
npm run dev
```

Verificar en `http://localhost:3000`:
- Página carga sin errores en consola
- Fondo oscuro, navbar visible con "CV SaaS" y botón "Iniciar sesión"
- Sin errores TypeScript o hydration en consola del browser

---

### Verificación Final de Fase 1

- [ ] **Checklist backend:**
  - `pytest tests/ -v` pasa todos los tests
  - `uvicorn main:app` arranca sin errores
  - `GET /health` retorna `{"status": "ok"}`
  - `GET /docs` muestra los endpoints en Swagger UI

- [ ] **Checklist Supabase:**
  - 5 tablas presentes en Supabase dashboard
  - 5 registros en `service_pricing`
  - RPC functions `reserve_credits`, `refund_credits`, `increment_total_jobs` existen
  - Trigger `on_auth_user_created` existe
  - Registrar un usuario de prueba y verificar que se crea perfil con 60 créditos y transacción `signup_bonus`

- [ ] **Checklist frontend:**
  - `npm run dev` arranca sin errores
  - `npx tsc --noEmit` sin errores
  - Página carga con navbar y fondo oscuro
  - No hay errores en consola del browser

---

**Fase 1 completa.** La Fase 2 implementa los 5 endpoints de servicios CV en el backend. La Fase 3 implementa las páginas de frontend.
