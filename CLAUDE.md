# Claude Code Instructions — CV SaaS (supervision)

## Project Context

SaaS de visión por computadora construido sobre [roboflow/supervision](https://github.com/roboflow/supervision). Ofrece 5 servicios (conteo en zonas, tracking, EPP, tráfico, control de calidad) con un modelo de créditos: 60 gratis al registro, compra de más créditos vía Stripe.

**_DO NEVER MAKE COMMITS_**

---

## Project Structure

```
supervision/
├── frontend/                  # Next.js 14 (App Router)
│   ├── app/
│   │   ├── page.tsx           # Landing con los 5 servicios
│   │   ├── dashboard/         # Panel del usuario (créditos, historial)
│   │   ├── services/[slug]/   # Página de cada servicio
│   │   └── api/auth/          # NextAuth
│   ├── components/
│   └── lib/
├── backend/                   # FastAPI + supervision
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── credits.py
│   │   ├── services/          # Un router por servicio CV
│   │   └── stream.py          # WebSocket webcam
│   ├── core/
│   │   ├── models.py          # Carga de modelos YOLO
│   │   ├── credits.py         # Lógica de cálculo de costo
│   │   └── db.py              # Cliente supabase-py
│   └── requirements.txt
├── docs/
│   ├── superpowers/specs/     # Specs de diseño
│   ├── DB_SCHEMA_LIVE.md      # Schema actual de Supabase (fuente secundaria)
│   └── components-registry.md # Componentes reutilizables del frontend
├── docker-compose.yml
├── Makefile                   # `make dev` arranca frontend + backend
└── CLAUDE.md
```

---

## Key Technologies

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand
- **Package manager:** `pnpm` — usar siempre pnpm para instalar, agregar y ejecutar paquetes del frontend. Nunca usar npm o yarn.
- **Backend:** FastAPI, Python 3.11+, supervision, ultralytics (YOLOv8), supabase-py
- **Database:** Supabase (Postgres + Auth + Storage)
- **Auth:** Supabase Auth en frontend (`@supabase/ssr`), JWT verificado en backend
- **Deployment target:** Modal.com (backend), Vercel (frontend)

---

## Code Style Guidelines

1. **TypeScript:** Strict typing, nunca `any`
2. **Components:** Función con hooks, nunca clases
3. **Styling:** Tailwind utility classes, nunca CSS inline
4. **Naming:** camelCase variables/funciones, PascalCase componentes, kebab-case archivos
5. **File Organization:** Agrupado por feature/dominio
6. **Max render file length:** Ningún archivo de renderizado (`page.tsx`, `layout.tsx`, componentes JSX/TSX) debe superar **200 líneas**. Overflow máximo de 10 líneas (210 total) solo si un split inmediato perjudica la legibilidad.
7. **Co-located splits:** Al dividir un componente, los sub-componentes viven en la misma carpeta (`_components/`), salvo que sean claramente globales.
8. **No nested ternaries:** Nunca ternarios anidados (`a ? b : c ? d : e`). Usar early returns, `if/else`, o funciones helper.
9. **Confirmation modals:** Toda acción destructiva o irreversible (cancelar job, usar créditos, banear usuario) DEBE mostrar un modal de confirmación antes de ejecutar.
10. **URL State Persistence:** Persistir estado relevante de UI (filtros, tabs, paginación) en URL query params para que recargar la página mantenga el contexto.

---

## Formatters (frontend)

- **Créditos y moneda:** usar funciones globales desde `frontend/src/lib/formatters.ts`
- **Nunca** instanciar `new Intl.NumberFormat` o `new Intl.DateTimeFormat` directamente en componentes
- **Nunca** usar `.toLocaleDateString()`, `.toLocaleString()` en componentes

---

## Security & Permissions

- **Roles:** `user` (default) y `admin`. No hay roles intermedios.
- **`admin`** tiene acceso a panel de administración: reclamos, bans, ajuste manual de créditos
- **RLS obligatorio** en todas las tablas públicas de Supabase
- **Nunca exponer `service_role` key** en el frontend ni en variables `NEXT_PUBLIC_`
- El backend FastAPI verifica JWT de Supabase en cada request protegido
- Ban check en cada request: si `profiles.banned_at IS NOT NULL` → 403
- **Cualquier cambio de permisos o RLS DEBE actualizarse en `docs/DB_SCHEMA_LIVE.md`**

---

## Database Migrations

- **Todas las migraciones de Supabase se aplican via MCP** (`mcp__supabase__apply_migration`). Nunca pedir al usuario que las ejecute manualmente.
- Archivos SQL de migración viven en `supabase/migrations/`
- **Después de todo cambio de BD** (tabla, columna, trigger, índice, RLS), actualizar `docs/DB_SCHEMA_LIVE.md`
- La BD viva (Supabase MCP `execute_sql`) es la fuente de verdad — más confiable que los docs

### Verificación previa (antes de cualquier cambio de BD)

```sql
-- Confirmar que una columna existe antes de referenciarla
select column_name, data_type from information_schema.columns
where table_name = 'nombre_tabla';

-- Confirmar triggers
select * from information_schema.triggers where event_object_table = 'nombre_tabla';

-- Confirmar funciones/RPCs
select proname, prosrc from pg_proc where proname = 'nombre_funcion';
```

---

## Components Registry

Antes de crear un componente compartido, hacer `Grep` en `docs/components-registry.md` por concepto/keyword. Si existe uno que cubra la necesidad, reutilizarlo o extenderlo. Al introducir uno nuevo, registrarlo inmediatamente en el registry.

---

## Planning Workflow (Mandatory)

Cuando el usuario pide un "plan" o planificación de cualquier feature:

1. Crear documento de plan en `docs/plans/` con fases y pasos numerados
2. Cada paso requiere aprobación explícita del usuario antes de implementar
3. Antes de cada paso, explicar: qué se hizo en el anterior, qué hace el siguiente, cómo se implementará
4. Marcar pasos como completados con checkbox en el documento
5. Si un paso deja algo testeable en la UI, proveer checklist de verificación manual:
   - Ruta o sección a abrir
   - Acción a realizar
   - Resultado esperado
   - Edge cases relevantes
6. Nunca saltear pasos ni combinar múltiples sin aprobación

---

## Development Workflow

1. Verificar errores TypeScript antes de cualquier entrega
2. El backend corre en `http://localhost:8000`, el frontend en `http://localhost:3000`
3. `make dev` arranca ambos servidores simultáneamente
4. Para servicios CV pesados, el modelo YOLO se carga una sola vez al iniciar el backend (no por request)
5. Seguir WCAG 2.1 para accesibilidad

---

## Context Efficiency

- Preferir `Grep` y `Read` por rangos acotados en vez de leer archivos grandes completos
- Usar `execute_sql` vía MCP para verificar estado real de la BD antes de asumir schema
- Al buscar componentes, Grep en el registry primero; probar sinónimos antes de concluir que no existe

---

## Additional Documentation

- **Database Schema:** `docs/DB_SCHEMA_LIVE.md`
- **Components Registry:** `docs/components-registry.md`
- **Design Specs:** `docs/superpowers/specs/`
- **Plans:** `docs/plans/`

---

**Last Updated:** 2026-06-10
