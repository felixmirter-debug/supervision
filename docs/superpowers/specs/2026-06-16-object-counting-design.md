# Spec: Conteo de objetos — líneas (cruces por clase/dirección) + zonas (ocupación)

**Fecha:** 2026-06-16
**Servicio afectado:** `zone_counting` (se reposiciona como "Conteo de objetos")
**Estado:** Aprobado (diseño). Pendiente de plan de implementación.
**Relacionado:** [`2026-06-16-services-overhaul-umbrella-design.md`](2026-06-16-services-overhaul-umbrella-design.md) — refina el servicio #3 absorbiendo el conteo por línea; `traffic` queda enfocado en velocidad.

## Objetivo

Permitir contar objetos de dos formas combinables:
1. **Líneas de conteo (cruces):** cuántos objetos de cada clase cruzan una línea y en qué
   dirección (p. ej. carros/motos/camiones por una avenida; personas que entran/salen de un mall).
2. **Zonas (ocupación):** cuántos objetos hay dentro de un polígono a lo largo del tiempo
   (pico, promedio, momento del pico), además de las entradas/salidas ya existentes.

## Hallazgo clave de supervision (0.28.0, verificado)

`sv.LineZone(start, end)` ya trae conteo **por clase y dirección integrado**:
- `trigger(detections) -> (crossed_in, crossed_out)` (arrays booleanos) y actualiza
  `in_count`/`out_count`, `in_count_per_class`/`out_count_per_class` (dicts `{class_id: count}`)
  y `class_id_to_name`.
- **Requiere `detections.tracker_id`** → hay que correr ByteTrack antes de `trigger`.
- `sv.LineZoneAnnotator` dibuja la línea con los conteos.

Esto elimina el doble-conteo del servicio `traffic` actual (que tallaba `by_class` por frame).

## Decisiones

| Decisión | Elección |
|---|---|
| Modos | Líneas (cruces por clase/dirección) **y** zonas (ocupación) |
| Múltiples | Varias líneas y varias zonas por video, cada una con nombre |
| Etiquetas de dirección | Por línea, editables (`in_label`/`out_label`; default "Entran"/"Salen") |
| Clases a contar | Reutiliza `class_filter` existente (car, motorcycle, truck, bus, person, …) |
| Tracker | ByteTrack **siempre** (las líneas lo requieren; hoy sólo se crea en modo `entry_exit`) |
| Créditos | Sin recargo (conteo es ligero) |
| BD | Sin migración (config en `processing_config`, métricas en `metrics` JSON) |
| Slug | Se mantiene `zone_counting` (clave de pricing/BD); cambia sólo la etiqueta visible a "Conteo de objetos" |

## Modelo de datos

**Frontend (`processing-config.ts`)** — extender `LineConfig`:
```ts
export type LineConfig = {
  id: string
  label: string
  start: NormalizedPoint
  end: NormalizedPoint
  direction?: 'in_out' | 'out_in'
  in_label?: string   // default "Entran"
  out_label?: string  // default "Salen"
}
```
`ZoneConfig` sin cambios. `class_filter?: string[]` ya existe en `ProcessingConfig`.

**Backend (`_config.py`)** — nuevo helper que devuelve todas las líneas (hoy sólo `first_line`):
```python
def config_lines(config, width, height) -> list[dict]:
    # [{label, start: Point, end: Point, in_label, out_label}]
    # default in_label="Entran", out_label="Salen"
```

## Backend — `processors/zone_counting.py`

1. Construir `polygon_zones` (como hoy) y `line_zones = [sv.LineZone(start, end) for ...]` desde
   `config_lines`.
2. Crear `tracker = sv.ByteTrack()` **siempre** (no sólo en `entry_exit`).
3. Por frame: detectar → `filter_detections` → `tracker.update_with_detections` → para cada
   `LineZone`, `trigger(detections)`; para cada `PolygonZone`, contar ocupación y registrar la
   serie temporal.
4. Anotar: `LineZoneAnnotator` por línea, `PolygonZoneAnnotator` por zona, `BoxAnnotator` +
   `LabelAnnotator`.
5. Mapear `class_id → name` con `result.names` para los desgloses por clase.

**Métricas:**
```python
{
  "lines": [
    {"label", "in_label", "out_label", "in_total", "out_total",
     "by_class_in": {"car": n, ...}, "by_class_out": {...}}
  ],
  "zones": [
    {"label", "max_count", "peak_occupancy", "peak_at_sec", "avg_occupancy",
     "entries", "exits"}
  ],
  "frames_processed": int,
  "config": summarize_config(config),
}
```
`peak_at_sec` se calcula con el índice de frame del pico y un fps por defecto de 30 si no se
dispone (consistente con el resto del pipeline).

## Frontend

- **Config (`ConfigurationView`/editores):** reutilizar `LineEditor` añadiendo dos inputs por
  línea (`in_label`/`out_label`) y `ZoneEditor` para zonas; selección de clases a contar mediante
  el control de `class_filter` existente. Las líneas requieren al menos una para el modo cruces;
  las zonas son opcionales.
- **Resultados:** nuevo componente `CountingResultPanel` (registrado en `components-registry.md`)
  renderizado en `ResultView` cuando `metrics.lines`/`metrics.zones` existen:
  - Por línea: totales `in_total`/`out_total` con las etiquetas del usuario + **desglose por clase**
    (lista o mini-barras) usando formatters globales.
  - Por zona: pico de ocupación (con timestamp), promedio y máximo.

## Edge cases

- Sin líneas ni zonas → comportamiento por defecto actual (una zona = frame completo).
- Línea degenerada (start == end) → se ignora con aviso en métricas.
- Modelo COCO no detecta una clase pedida → su conteo queda en 0 (sin error).
- `class_filter` vacío → cuenta todas las clases detectadas.

## Verificación

- Backend TDD: `config_lines` (múltiples, etiquetas default, degeneradas) y `process_zone_counting`
  (líneas por clase/dirección con un `_FakeModel` que mueve un objeto a través de la línea; zonas
  con serie temporal/pico).
- Frontend: `pnpm exec tsc --noEmit` limpio; checklist manual (avenida con clases; mall con
  etiquetas Entran/Salen).
- Sin commits (regla del proyecto). Sin migración de BD.

## Fuera de alcance (YAGNI)

- Velocidad (vive en el servicio `traffic`).
- Heatmaps de densidad.
- Reportes/exportaciones agregadas cross-job.
