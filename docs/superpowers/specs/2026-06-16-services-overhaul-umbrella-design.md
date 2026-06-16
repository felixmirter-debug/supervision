# Spec umbrella: Mejora full de los 4 servicios CV restantes

**Fecha:** 2026-06-16
**Servicios afectados:** `traffic`, `ppe_detection`, `zone_counting`, `quality_control`
**Estado:** Aprobado (alcance). Cada servicio recibe su propia spec → plan → implementación.
**Relacionado:** [`2026-06-12-interactive-tracking-design.md`](2026-06-12-interactive-tracking-design.md) (patrón de referencia)

## Objetivo

Llevar los 4 servicios restantes al mismo nivel de profundidad que el tracking interactivo:
analítica CV nueva en backend + etapa/configuración interactiva en frontend + visualización
de métricas dedicada. Se implementan **en orden de atractivo (1→4), de corrido**, cada uno con
su propio ciclo spec→plan→implementación y la misma disciplina TDD + reviews.

## Decisiones globales

| Decisión | Elección |
|---|---|
| Profundidad | Full (backend + frontend + métricas), igual que tracking |
| Orden | 1 Tráfico · 2 EPP · 3 Zonas · 4 Calidad |
| Calibración velocidad (tráfico) | Homografía de 4 puntos sobre el video + dimensiones reales en metros |
| Créditos | Recargo por features pesadas (tunable tras medir costos en Modal), patrón `apply_*_multiplier` como Re-ID |
| Persistencia | Toda la config viaja en `processing_config` (columna JSON existente de `jobs`). Sin migraciones de BD salvo que un servicio lo exija explícitamente |
| Modelos | `yolov8n.pt` (COCO) por defecto. EPP y Calidad asumen modelo de dominio vía `PPE_MODEL_PATH`/`QC_MODEL_PATH`; degradan con claridad si faltan las clases esperadas |
| Reutilización | Etapas, anotadores y componentes del workflow existente; nuevos componentes registrados en `docs/components-registry.md` |

## Restricción de modelos (importante)

Hoy todos los servicios cargan `yolov8n.pt`. PPE y QC sólo usan un modelo custom si se
define la env var correspondiente. Por tanto:

- **EPP**: la asociación equipo↔persona requiere un modelo con clases de persona + equipo
  (p. ej. `person`, `helmet`, `vest`, `no-helmet`, `no-vest`). Si el modelo activo no las
  expone, el servicio debe degradar a su comportamiento actual y avisar en métricas.
- **Calidad**: requiere un modelo con clases buenas/defecto. Sin clases-defecto configuradas,
  degrada a "todo detectado = ítem" como hoy.

---

## Servicio 1 — Tráfico: velocidad real + conteo direccional + únicos

**Problema actual:** `by_class` cuenta cada vehículo visible *por frame* (infla el total); no hay
velocidad; el conteo de línea no distingue dirección por clase.

**Backend (`processors/traffic.py`):**
- Conteo de vehículos **únicos por `tracker_id`** (corrige el doble-conteo); totales únicos por clase.
- Conteo direccional in/out por la línea (ya existe `LineZone`; exponer por dirección).
- **Velocidad**: `sv.ViewTransformer` con homografía de 4 puntos (origen en píxeles → destino en
  metros a partir de ancho/alto reales). Velocidad por vehículo = distancia transformada / Δt,
  suavizada sobre una ventana de N frames. Métricas: velocidad media, máxima, y **excesos** sobre
  `speed_limit_kmh` configurable.
- Anotación: etiqueta con km/h por vehículo; infractores resaltados en rojo.
- Métricas: `unique_by_class`, `direction_in/out`, `avg_speed_kmh`, `max_speed_kmh`,
  `speeding_count`, `speed_limit_kmh`.
- Recargo de créditos ~×1.2 por la homografía.

**Frontend:** nueva etapa `calibrating` (sólo tráfico): el usuario marca 4 puntos en el suelo
(reutilizar editor de puntos tipo `RoiEditor`/`LineEditor`), ingresa ancho/alto reales (m) y el
límite de velocidad. `ConfirmModal` desglosa el recargo. `ResultView` muestra velocidad media/máx,
excesos, únicos por clase y direccional.

## Servicio 2 — EPP: cumplimiento por persona

**Problema actual:** sólo cuenta detecciones de clases-violación; no asocia equipo a personas.

**Backend (`processors/ppe_detection.py`):**
- Detectar personas + equipo; **asociar equipo a cada persona** por contención/IoU del bbox.
- Estado por persona: cumple / incumple con lista de faltantes (casco/chaleco/máscara según
  `required_equipment` configurable).
- Métricas: `compliance_rate` = personas que cumplen / total personas; `violations_by_person`,
  frames de alerta, desglose de equipo faltante.
- Anotación: caja verde (cumple) / roja (incumple) + etiqueta de faltantes.
- Degradación documentada si el modelo no expone clases de equipo.

**Frontend:** config para elegir equipo requerido. `ResultView`: tasa de cumplimiento, infracciones
por persona, línea de tiempo de alertas.

## Servicio 3 — Zonas: analítica de ocupación

**Problema actual:** sólo máximos y entradas/salidas; sin dimensión temporal.

**Backend (`processors/zone_counting.py`):**
- Serie temporal de ocupación por zona (conteo por frame muestreado + timestamp).
- Pico de ocupación + momento; ocupación media; **tiempo de permanencia (dwell)** por objeto
  (frames dentro / fps) en modo `entry_exit`.
- Métricas: `occupancy_series` (por zona), `peak_occupancy`, `peak_at_sec`, `avg_occupancy`,
  `avg_dwell_sec`.

**Frontend:** `ResultView` con gráfico de ocupación en el tiempo por zona. (Decidir lib de gráficos
en la spec individual; preferir una ligera o SVG propio.) Config reutiliza las zonas existentes.

## Servicio 4 — Calidad: umbrales y aprobado/rechazado

**Problema actual:** cuenta *toda* detección como defecto; sin distinción bueno/defecto ni umbral.

**Backend (`processors/quality_control.py`):**
- Distinguir **clases-defecto** (lista configurable) vs buenas; umbral de confianza mínimo.
- Aprobado/rechazado por ítem; tasa de aprobación; desglose por tipo de defecto.
- **Muestras de frames con fallo** (índices/crops base64) para galería.
- Métricas: `pass_rate`, `pass_count`, `fail_count`, `by_defect_type`, `failing_samples`.

**Frontend:** config de clases-defecto + umbral. `ResultView`: tasa de aprobación, desglose y
galería de muestras con fallo.

---

## Orden de implementación

1. **Tráfico** — spec → plan → implementación → reviews.
2. **EPP** — íd.
3. **Zonas** — íd.
4. **Calidad** — íd.

Cada servicio sigue el mismo patrón validado en tracking: TDD en backend, `pnpm exec tsc --noEmit`
limpio en frontend, componentes registrados, sin commits (regla del proyecto), sin migraciones de
BD salvo necesidad explícita.

## Fuera de alcance (YAGNI)

- Re-entrenar o empaquetar modelos de dominio (EPP/Calidad): se asume modelo provisto vía env var.
- Dashboards históricos cross-job (las métricas viven por job).
- Exportaciones/reportes PDF.
