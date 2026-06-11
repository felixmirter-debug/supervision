# CV SaaS — Design Spec
**Date:** 2026-06-10
**Status:** Approved

---

## 1. Overview

SaaS de visión por computadora construido sobre `roboflow/supervision`. Los usuarios suben videos, imágenes o transmiten desde webcam y obtienen resultados procesados por modelos YOLOv8 con anotaciones visuales y métricas en JSON. El modelo de negocio es por créditos: 60 gratis al registrarse (equivalente a 1 minuto de video), con opción de compra posterior vía Stripe.

**Servicios ofrecidos:**
1. Conteo de personas/objetos en zonas (`zone-counting`)
2. Tracking multi-objeto (`tracking`)
3. Detección de EPP/seguridad (`ppe-detection`)
4. Análisis de tráfico (`traffic`)
5. Control de calidad industrial (`quality-control`)

---

## 2. Architecture

**Monorepo con dos aplicaciones independientes:**

```
supervision/
├── frontend/   # Next.js 14 (App Router) — puerto 3000
├── backend/    # FastAPI + supervision   — puerto 8000
├── docs/
├── docker-compose.yml
└── Makefile
```

**Comunicación:**
- Frontend → Backend: HTTP REST para jobs, WebSocket para webcam en tiempo real
- Backend → Supabase: `supabase-py` con `service_role` key (nunca expuesta al browser)
- Frontend → Supabase: `@supabase/ssr` con `anon` key para auth y lectura de perfil

**Deployment target:**
- Frontend: Vercel (gratis)
- Backend: Modal.com (pago por segundo de CPU/GPU, escala a cero)
- Base de datos: Supabase (Postgres + Auth + Storage)

---

## 3. Frontend

**Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, `@supabase/ssr`

**Rutas:**

| Ruta | Descripción |
|---|---|
| `/` | Landing page con los 5 servicios y pricing |
| `/login` | Login / registro con Supabase Auth |
| `/dashboard` | Panel del usuario: créditos, historial de jobs |
| `/services/[slug]` | Página de cada servicio (formulario + resultado) |
| `/admin` | Panel de admin: reclamos, bans, ajuste de créditos (role=admin) |

**Flujo de usuario en `/services/[slug]`:**
1. Selecciona input: archivo, URL o webcam
2. Frontend solicita estimado → backend devuelve duración y créditos estimados
3. Se muestra modal de confirmación con costo antes de procesar
4. Usuario confirma → se inicia el job
5. Polling a `GET /jobs/{id}/status` cada 2 segundos
6. Al completar: video anotado descargable + panel de métricas

**Webcam (tiempo real):**
- WebSocket a `WS /stream/{slug}`
- Se descuentan créditos cada 10 segundos de stream activo
- Si créditos llegan a 0 el stream se corta con aviso visual

---

## 4. Backend

**Stack:** FastAPI, Python 3.11+, supervision, ultralytics (YOLOv8), supabase-py

**Estructura:**

```
backend/
├── main.py                    # App FastAPI, monta routers, carga modelos al arranque
├── routers/
│   ├── auth.py                # Verificación JWT Supabase
│   ├── credits.py             # Consulta y descuento de créditos
│   ├── jobs.py                # CRUD de jobs, polling de estado
│   ├── stream.py              # WebSocket webcam
│   └── services/
│       ├── zone_counting.py
│       ├── tracking.py
│       ├── ppe_detection.py
│       ├── traffic.py
│       └── quality_control.py
├── core/
│   ├── models.py              # Carga de modelos YOLO (singleton, una vez al arrancar)
│   ├── credits.py             # Lógica: estimar costo, reservar, reembolsar
│   ├── db.py                  # Cliente supabase-py (service_role)
│   └── auth.py                # Dependency: verificar JWT + ban check
└── requirements.txt
```

**Contrato de API (igual para todos los servicios):**

```
POST /services/{slug}/estimate
  body: { input_type, input_url?, duration_hint? }
  returns: { duration_sec, credits_estimated, cost_breakdown }

POST /services/{slug}/process
  body: { job_id, confirmed: true }
  returns: { job_id, status: "processing" }

GET  /jobs/{job_id}/status
  returns: { status, progress_pct, result_url?, metrics?, error_message? }

WS   /stream/{slug}
  sends frames como base64, recibe frames anotados + métricas en tiempo real
```

**Pipeline de procesamiento:**

```
1. Recibir input (archivo temporal / URL / frame de webcam)
2. Verificar JWT y ban
3. Verificar créditos disponibles >= credits_estimated
4. INSERT job (status='estimating')
5. Detectar duración real del video
6. Calcular credits_estimated
7. Retornar estimado al frontend → esperar confirmación
8. UPDATE job (status='confirmed')
9. INSERT credit_transaction (type='job_reserve', amount=-N)
10. UPDATE profiles.credits -= N
11. Procesar: leer frames → modelo → supervision annotators → escribir video
12. Subir video anotado a Supabase Storage (bucket: results/)
13. UPDATE job (status='done', result_url, metrics, credits_used=real)
14. Si real < N: INSERT credit_transaction (type='job_refund', amount=+diff)
15. Si falla: UPDATE job (status='failed'), INSERT credit_transaction (type='job_refund', amount=+N)
```

**Modelos por servicio:**

| Servicio | Modelo | supervision tools |
|---|---|---|
| zone-counting | YOLOv8n | PolygonZone, BoxAnnotator, LabelAnnotator |
| tracking | YOLOv8n + ByteTrack | ByteTrack, TraceAnnotator, LabelAnnotator |
| ppe-detection | YOLOv8m (fine-tuned PPE) | BoxAnnotator, LabelAnnotator |
| traffic | YOLOv8n | LineZone, ByteTrack, SpeedEstimator |
| quality-control | YOLOv8m (fine-tuned defects) | BoxAnnotator, HeatMapAnnotator |

---

## 5. Database (Supabase)

### Tables

```sql
-- Perfil del usuario
create table public.profiles (
  id              uuid references auth.users primary key,
  role            text not null default 'user',    -- 'user' | 'admin'
  credits         integer not null default 60,
  plan            text not null default 'free',
  total_spent     integer not null default 0,
  total_jobs      integer not null default 0,
  banned_at       timestamptz,
  banned_reason   text,
  banned_by       uuid references auth.users,
  created_at      timestamptz default now()
);

-- Precios por servicio (configurable sin redeploy)
create table public.service_pricing (
  service           text primary key,
  credits_per_sec   numeric(5,2) not null,
  label             text not null,
  description       text,
  active            boolean default true
);

-- Jobs de procesamiento
create table public.jobs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  service           text references public.service_pricing not null,
  status            text not null default 'pending',
  input_type        text not null,
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
  created_at        timestamptz default now()
);

-- Auditoría inmutable de créditos
create table public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  amount      integer not null,
  type        text not null,
  job_id      uuid references public.jobs,
  description text,
  created_at  timestamptz default now()
);

-- Reclamos de usuarios
create table public.claims (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  job_id           uuid references public.jobs,
  type             text not null,
  description      text not null,
  status           text not null default 'open',
  admin_notes      text,
  resolved_by      uuid references auth.users,
  credits_returned integer default 0,
  created_at       timestamptz default now(),
  resolved_at      timestamptz
);
```

### Credit transaction types
- `signup_bonus` — créditos iniciales al registrarse
- `job_reserve` — reserva antes de procesar
- `job_charge` — cargo final real
- `job_refund` — reembolso por diferencia o fallo
- `admin_refund` — reembolso manual por admin al resolver reclamo
- `purchase` — compra de créditos vía Stripe (futuro)
- `manual_adjustment` — ajuste manual por admin con razón obligatoria

### Job statuses
`pending` → `estimating` → `confirmed` → `processing` → `done` | `failed` | `refunded`

### RLS Policies
- `profiles`: usuario lee/edita su fila; admin lee todas; backend (service_role) escribe
- `jobs`: usuario lee sus jobs; admin lee todos; backend escribe
- `credit_transactions`: usuario solo lectura de sus filas; sin UPDATE/DELETE (inmutable)
- `claims`: usuario crea y lee las suyas; admin lee y actualiza todas
- `service_pricing`: lectura pública; escritura solo service_role

### Supabase Storage buckets
- `uploads/` — videos subidos temporalmente (TTL: 24h)
- `results/` — videos anotados (acceso firmado por URL)

---

## 6. Credits & Pricing

### Precios iniciales (ajustables en `service_pricing`)

| Servicio | Créditos/seg |
|---|---|
| zone-counting | 0.5 |
| tracking | 0.8 |
| ppe-detection | 1.0 |
| traffic | 0.8 |
| quality-control | 1.0 |

### Signup bonus
60 créditos = ~1 minuto del servicio más económico (zone-counting a 0.5/seg)

### Webcam billing
Créditos descontados cada 10 segundos de stream activo. Si saldo < créditos de 10 segundos, stream se corta con modal de aviso.

---

## 7. Admin Panel

Ruta `/admin`, protegida por `role='admin'` verificado en middleware de Next.js y en cada endpoint del backend.

**Funcionalidades:**
- Lista de reclamos abiertos con filtro por status
- Resolver reclamo: elegir acción (reembolsar créditos / sin acción / rechazar) + nota obligatoria
- Banear / desbanear usuarios con razón obligatoria
- Ajuste manual de créditos con descripción obligatoria
- Vista de jobs fallidos del sistema

---

## 8. Local Development

```bash
# Requisitos
# Python 3.11+, Node 20+, cuenta Supabase

make dev        # arranca frontend (3000) + backend (8000)
make install    # instala dependencias de ambos
```

Variables de entorno requeridas:
```
# backend/.env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 9. Modal.com Migration Path

La migración del backend a Modal requiere cambios mínimos:

1. Instalar `modal` en `requirements.txt`
2. Envolver el procesamiento pesado de cada servicio en `@app.function(gpu="T4")`
3. FastAPI sigue siendo el entrypoint vía `modal serve`
4. Variables de entorno se pasan como `modal.Secret`
5. El frontend solo cambia `NEXT_PUBLIC_API_URL` al dominio de Modal

El código de supervision y los routers FastAPI no cambian.

---

## 10. Out of Scope (v1)

- Pagos reales con Stripe (solo créditos gratis y admin manual por ahora)
- Entrenamiento de modelos custom por el usuario
- API keys para acceso programático
- Multi-idioma
- Notificaciones por email al completar un job
