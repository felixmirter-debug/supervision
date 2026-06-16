# Object Counting (lines + zones) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PROJECT RULE — NO COMMITS:** `CLAUDE.md` says **never run `git commit`**. Every commit step is replaced by a **Verify** step. Leave changes in the working tree.

**Goal:** Mejorar el servicio `zone_counting` ("Conteo de objetos") para contar cruces de línea por clase y dirección (varias líneas, etiquetas editables) además de ocupación por zona con analítica temporal.

**Architecture:** El backend corre ByteTrack siempre y usa `sv.LineZone` (que ya trae `in_count_per_class`/`out_count_per_class`) por cada línea, más `sv.PolygonZone` por cada zona con serie temporal de ocupación. El frontend añade un editor multi-línea con etiquetas de dirección y un panel de resultados de conteo.

**Tech Stack:** FastAPI, supervision 0.28.0 (`LineZone`, `ByteTrack`, `LineZoneAnnotator`, `PolygonZone`), pytest; Next.js + TypeScript, pnpm.

---

## File Structure

**Backend**
- Modify `backend/routers/services/_config.py` — nuevo `config_lines()` (todas las líneas → px + etiquetas).
- Modify `backend/routers/services/processors/zone_counting.py` — conteo por línea (clase/dirección) + ocupación temporal por zona.
- Test `backend/tests/test_processing_config.py` — `config_lines`.
- Test `backend/tests/test_processors.py` — `process_zone_counting` (líneas + zonas).

**Frontend**
- Modify `frontend/lib/processing-config.ts` — `LineConfig.in_label`/`out_label`.
- Create `frontend/app/services/[slug]/_components/CountingLineEditor.tsx` — editor multi-línea + etiquetas.
- Modify `frontend/app/services/[slug]/_components/ConfigurationView.tsx` — toggle Líneas/Zonas en `zone_counting`.
- Create `frontend/app/services/[slug]/_components/CountingResultPanel.tsx` — métricas de conteo.
- Modify `frontend/app/services/[slug]/_components/ResultView.tsx` — render del panel.
- Modify `docs/components-registry.md` — registrar componentes nuevos.

---

## Task 1: `config_lines` en `_config.py`

**Files:**
- Modify: `backend/routers/services/_config.py` (añadir tras `first_line`, ~línea 127)
- Test: `backend/tests/test_processing_config.py`

- [ ] **Step 1: Test que falla** — APPEND a `backend/tests/test_processing_config.py`:

```python
from routers.services._config import config_lines


def test_config_lines_multiple_with_default_labels():
    config = {"lines": [
        {"label": "Puerta", "start": {"x": 0.0, "y": 0.5}, "end": {"x": 1.0, "y": 0.5}},
        {"label": "Carril", "start": {"x": 0.0, "y": 0.2}, "end": {"x": 1.0, "y": 0.2},
         "in_label": "Norte", "out_label": "Sur"},
    ]}
    lines = config_lines(config, 100, 100)
    assert len(lines) == 2
    assert lines[0]["label"] == "Puerta"
    assert lines[0]["in_label"] == "Entran"
    assert lines[0]["out_label"] == "Salen"
    assert lines[0]["start"] == (0, 50) and lines[0]["end"] == (99, 50)
    assert lines[1]["in_label"] == "Norte" and lines[1]["out_label"] == "Sur"


def test_config_lines_skips_degenerate():
    config = {"lines": [{"label": "x", "start": {"x": 0.5, "y": 0.5}, "end": {"x": 0.5, "y": 0.5}}]}
    assert config_lines(config, 100, 100) == []


def test_config_lines_empty_when_no_lines():
    assert config_lines({}, 100, 100) == []
```

- [ ] **Step 2: Verificar que falla**
Run: `cd backend && python -m pytest tests/test_processing_config.py -k config_lines -v` → FAIL (ImportError).

- [ ] **Step 3: Implementar** — añadir en `backend/routers/services/_config.py` justo después de `first_line` (que termina ~línea 126):

```python
def config_lines(config: dict[str, Any], width: int, height: int) -> list[dict[str, Any]]:
    """Devuelve todas las líneas como dicts con puntos en píxeles y etiquetas de
    dirección. Omite líneas degeneradas (start == end)."""
    out: list[dict[str, Any]] = []
    for raw in config.get("lines") or []:
        if not isinstance(raw, dict):
            continue
        start = point_to_pixel(raw.get("start"), width, height)
        end = point_to_pixel(raw.get("end"), width, height)
        if start == end:
            continue
        out.append({
            "label": str(raw.get("label") or f"Línea {len(out) + 1}"),
            "start": start,
            "end": end,
            "in_label": str(raw.get("in_label") or "Entran"),
            "out_label": str(raw.get("out_label") or "Salen"),
        })
    return out
```

- [ ] **Step 4: Verificar que pasa**
Run: `cd backend && python -m pytest tests/test_processing_config.py -v` → PASS (incluye los existentes).

- [ ] **Step 5: Verify (sin commit)**
Run: `cd backend && python -c "from routers.services._config import config_lines; print('ok')"` → `ok`.

---

## Task 2: Conteo por línea + ocupación temporal en `process_zone_counting`

**Files:**
- Modify: `backend/routers/services/processors/zone_counting.py` (reemplazo completo de la función)
- Test: `backend/tests/test_processors.py`

**Contexto — código actual** de `process_zone_counting` (referencia; lo reemplazas entero):
cuenta ocupación por polígono (`zone_max_counts`, entradas/salidas en modo `entry_exit`) y anota zonas. No cuenta líneas.

- [ ] **Step 1: Tests que fallan** — APPEND a `backend/tests/test_processors.py`.

Primero, mira el inicio del archivo para reutilizar el patrón de modelo fake ya existente (hay un test de `process_zone_counting`). Añade estos helpers + tests (si ya existe un `import numpy as np` y un fake, reutilízalos; el fake de abajo es autocontenido para no chocar — renómbralo a `_MoverModel` como aquí):

```python
import numpy as np
import supervision as sv

from routers.services.processors.zone_counting import process_zone_counting


class _MoverBoxes:
    def __init__(self, y):
        # un único 'car' que baja por la pantalla (200x100), cruzando y=50
        self.xyxy = np.array([[90.0, float(y), 110.0, float(y + 20)]], dtype=np.float32)
        self.conf = np.array([0.9], dtype=np.float32)
        self.cls = np.array([0], dtype=np.float32)
        self.id = None

    def __len__(self):
        return 1


class _MoverResult:
    def __init__(self, y):
        self.names = {0: "car"}
        self.boxes = _MoverBoxes(y)
        self.obb = None
        self.masks = None


class _MoverModel:
    """Emite un coche que desciende; al llamarse consume la siguiente posición."""
    def __init__(self):
        self._ys = iter([0, 10, 20, 30, 40, 55, 65, 75])

    def __call__(self, frame, verbose=False):
        return [_MoverResult(next(self._ys))]


def _frames(n):
    return [np.zeros((100, 200, 3), dtype=np.uint8) for _ in range(n)]


def test_zone_counting_line_counts_crossing_by_class():
    config = {
        "frame_width": 200, "frame_height": 100,
        "lines": [{"label": "Av", "start": {"x": 0.0, "y": 0.5}, "end": {"x": 1.0, "y": 0.5},
                   "in_label": "Bajan", "out_label": "Suben"}],
    }
    _, metrics = process_zone_counting(_frames(8), _MoverModel(), config)
    assert "lines" in metrics and len(metrics["lines"]) == 1
    line = metrics["lines"][0]
    assert line["label"] == "Av"
    assert line["in_label"] == "Bajan" and line["out_label"] == "Suben"
    assert (line["in_total"] + line["out_total"]) >= 1
    total_by_class = {**line["by_class_in"], **line["by_class_out"]}
    assert total_by_class.get("car", 0) >= 1


def test_zone_counting_zone_reports_occupancy_series():
    config = {
        "frame_width": 200, "frame_height": 100,
        "zones": [{"id": "z1", "label": "Entrada", "points": [
            {"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 0.0}, {"x": 1.0, "y": 1.0}, {"x": 0.0, "y": 1.0}]}],
    }
    _, metrics = process_zone_counting(_frames(8), _MoverModel(), config)
    assert "zones" in metrics and len(metrics["zones"]) == 1
    z = metrics["zones"][0]
    assert z["label"] == "Entrada"
    assert z["peak_occupancy"] >= 1
    assert "avg_occupancy" in z and "peak_at_sec" in z
```

- [ ] **Step 2: Verificar que fallan**
Run: `cd backend && python -m pytest tests/test_processors.py -k "crossing or occupancy" -v` → FAIL.

- [ ] **Step 3: Implementar** — reemplazar TODO el cuerpo de `backend/routers/services/processors/zone_counting.py` por:

```python
from __future__ import annotations

from typing import Any

import numpy as np
import supervision as sv

from routers.services._config import (
    config_lines,
    config_polygons,
    filter_detections,
    summarize_config,
)

_DEFAULT_FPS = 30.0


def process_zone_counting(
    frames: list[np.ndarray],
    model: Any,
    config: dict,
) -> tuple[list[np.ndarray], dict]:
    """Conteo de objetos: cruces por línea (clase/dirección) + ocupación por zona."""
    h, w = frames[0].shape[:2] if frames else (480, 640)

    raw_zones: list = config.get("zones") or []
    if not raw_zones and not (config.get("lines")):
        # Sin nada configurado: una zona = frame completo (compat)
        raw_zones = [[[0, 0], [w, 0], [w, h], [0, h]]]

    polygons = config_polygons({"zones": raw_zones}, w, h, "zones")
    polygon_zones = [sv.PolygonZone(polygon=p) for p in polygons]
    zone_annotators = [sv.PolygonZoneAnnotator(zone=z) for z in polygon_zones]
    zone_labels = [
        str((raw_zones[i] or {}).get("label") if isinstance(raw_zones[i], dict) else f"Zona {i + 1}")
        or f"Zona {i + 1}"
        for i in range(len(polygon_zones))
    ]

    lines = config_lines(config, w, h)
    line_zones = [sv.LineZone(start=sv.Point(*ln["start"]), end=sv.Point(*ln["end"])) for ln in lines]
    line_annotator = sv.LineZoneAnnotator()

    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()
    tracker = sv.ByteTrack()  # LineZone requiere tracker_id

    track_entries = config.get("mode") == "entry_exit"
    zone_series: list[list[int]] = [[] for _ in polygon_zones]
    zone_entries = [0] * len(polygon_zones)
    zone_exits = [0] * len(polygon_zones)
    previous_inside: list[dict[int, bool]] = [dict() for _ in polygon_zones]
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        detections = tracker.update_with_detections(detections)

        for lz in line_zones:
            lz.trigger(detections=detections)

        for i, pz in enumerate(polygon_zones):
            mask = pz.trigger(detections=detections)
            zone_series[i].append(int(mask.sum()))
            if track_entries and detections.tracker_id is not None:
                for tracker_id, inside in zip(detections.tracker_id.tolist(), mask.tolist()):
                    was = previous_inside[i].get(int(tracker_id), False)
                    if inside and not was:
                        zone_entries[i] += 1
                    if was and not inside:
                        zone_exits[i] += 1
                    previous_inside[i][int(tracker_id)] = bool(inside)

        scene = frame.copy()
        scene = box_annotator.annotate(scene=scene, detections=detections)
        scene = label_annotator.annotate(scene=scene, detections=detections)
        for za in zone_annotators:
            scene = za.annotate(scene=scene)
        for lz in line_zones:
            scene = line_annotator.annotate(frame=scene, line_counter=lz)
        annotated.append(scene)

    fps = _DEFAULT_FPS
    line_metrics = []
    for ln, lz in zip(lines, line_zones):
        line_metrics.append({
            "label": ln["label"],
            "in_label": ln["in_label"],
            "out_label": ln["out_label"],
            "in_total": int(lz.in_count),
            "out_total": int(lz.out_count),
            "by_class_in": _by_class(lz.in_count_per_class, lz.class_id_to_name),
            "by_class_out": _by_class(lz.out_count_per_class, lz.class_id_to_name),
        })

    zone_metrics = []
    for i, series in enumerate(zone_series):
        peak = max(series) if series else 0
        peak_idx = series.index(peak) if series else 0
        zone_metrics.append({
            "label": zone_labels[i],
            "max_count": peak,
            "peak_occupancy": peak,
            "peak_at_sec": round(peak_idx / fps, 2),
            "avg_occupancy": round(sum(series) / len(series), 2) if series else 0.0,
            "entries": zone_entries[i],
            "exits": zone_exits[i],
        })

    metrics = {
        "lines": line_metrics,
        "zones": zone_metrics,
        "frames_processed": len(frames),
        "config": summarize_config(config),
    }
    return annotated, metrics


def _by_class(per_class: dict, id_to_name: dict) -> dict[str, int]:
    out: dict[str, int] = {}
    for class_id, count in (per_class or {}).items():
        name = (id_to_name or {}).get(class_id, str(class_id))
        out[name] = out.get(name, 0) + int(count)
    return out
```

> Nota sobre `zone_labels`: `raw_zones` puede contener dicts (`{label, points}`) o listas de puntos. El acceso `(raw_zones[i] or {}).get(...)` falla si es lista — protégelo: usa el helper inline mostrado sólo cuando `isinstance(raw_zones[i], dict)`, con fallback `f"Zona {i+1}"`. (Ya está así en el código de arriba.)

- [ ] **Step 4: Verificar que pasan**
Run: `cd backend && python -m pytest tests/test_processors.py -v` → PASS. Si el test de cruce falla por activación tardía de ByteTrack, ajusta el fake para empezar con 2 frames del coche arriba (y=0,0) antes de descender.

- [ ] **Step 5: Verify (sin commit)**
Run: `cd backend && python -m pytest -q` → suite completa verde.

---

## Task 3: Tipos frontend (`LineConfig` etiquetas)

**Files:**
- Modify: `frontend/lib/processing-config.ts` (`LineConfig`, ~líneas 12-18)

- [ ] **Step 1: Editar el tipo**

```typescript
export type LineConfig = {
  id: string
  label: string
  start: NormalizedPoint
  end: NormalizedPoint
  direction?: 'in_out' | 'out_in'
  in_label?: string
  out_label?: string
}
```

- [ ] **Step 2: Verificar TypeScript**
Run: `cd frontend && pnpm exec tsc --noEmit` → 0 errores (campos opcionales, no rompe nada).

---

## Task 4: `CountingLineEditor` + toggle Líneas/Zonas

**Files:**
- Create: `frontend/app/services/[slug]/_components/CountingLineEditor.tsx`
- Modify: `frontend/app/services/[slug]/_components/ConfigurationView.tsx` (rama `zone_counting`)

**Contexto:** `ZoneEditor` ya soporta múltiples zonas dibujando sobre `VideoFrameCanvas` (que renderiza `config.zones` y `config.lines`, con `activeShapeId` y `onMovePoint`/`DragTarget`). El editor de líneas sigue ese patrón pero para `config.lines`, y añade inputs de etiqueta por línea.

- [ ] **Step 1: Crear `CountingLineEditor.tsx`**

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { LineConfig, ProcessingConfig } from '@/lib/processing-config'
import { VideoFrameCanvas, type DragTarget } from './VideoFrameCanvas'

interface Props {
  imageSrc: string
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
}

function newLine(n: number): LineConfig {
  return {
    id: `line-${n + 1}-${Date.now()}`,
    label: `Línea ${n + 1}`,
    start: { x: 0.08, y: 0.5 },
    end: { x: 0.92, y: 0.5 },
    direction: 'in_out',
    in_label: 'Entran',
    out_label: 'Salen',
  }
}

export function CountingLineEditor({ imageSrc, config, onChange }: Props) {
  const lines = config.lines ?? []
  const activeLine = lines[lines.length - 1] ?? null

  function updateLines(next: LineConfig[]) {
    onChange({ ...config, lines: next })
  }

  function patchLine(id: string, patch: Partial<LineConfig>) {
    updateLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function handleMovePoint(target: DragTarget, point: { x: number; y: number }) {
    if (target.kind !== 'line') return
    patchLine(target.shapeId, { [target.pointKey]: point } as Partial<LineConfig>)
  }

  function addLine() {
    updateLines([...lines, newLine(lines.length)])
  }

  function deleteLast() {
    updateLines(lines.slice(0, -1))
  }

  return (
    <div className="space-y-3">
      <VideoFrameCanvas
        imageSrc={imageSrc}
        config={config}
        activeShapeId={activeLine?.id}
        onMovePoint={handleMovePoint}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">
          {lines.length} línea{lines.length === 1 ? '' : 's'}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addLine}>
            <Plus className="h-4 w-4" /> Nueva línea
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={deleteLast} disabled={lines.length === 0}>
            <Trash2 className="h-4 w-4" /> Borrar última
          </Button>
        </div>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.id} className="rounded-lg border border-border/70 p-2">
            <input
              value={line.label}
              onChange={(e) => patchLine(line.id, { label: e.target.value })}
              className="w-full rounded border bg-background px-2 py-1 text-sm"
              aria-label="Nombre de la línea"
            />
            <div className="mt-2 flex gap-2">
              <input
                value={line.in_label ?? 'Entran'}
                onChange={(e) => patchLine(line.id, { in_label: e.target.value })}
                className="flex-1 rounded border bg-background px-2 py-1 text-xs"
                aria-label="Etiqueta dirección entra"
              />
              <input
                value={line.out_label ?? 'Salen'}
                onChange={(e) => patchLine(line.id, { out_label: e.target.value })}
                className="flex-1 rounded border bg-background px-2 py-1 text-xs"
                aria-label="Etiqueta dirección sale"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => patchLine(line.id, { start: line.end, end: line.start, direction: line.direction === 'out_in' ? 'in_out' : 'out_in' })}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Wire en `ConfigurationView.tsx`**

Añadir estado local de sub-modo y el import. Tras los imports existentes:
```tsx
import { CountingLineEditor } from './CountingLineEditor'
```
Dentro del componente, junto a los otros `useState`:
```tsx
  const [countMode, setCountMode] = useState<'lines' | 'zones'>('lines')
```
Reemplazar EXACTAMENTE el bloque `service.apiSlug === 'zone_counting' ? ( ... ) :` (líneas ~144-165) por:
```tsx
          {service.apiSlug === 'zone_counting' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={countMode === 'lines' ? 'default' : 'outline'} onClick={() => setCountMode('lines')}>
                  Conteo por línea
                </Button>
                <Button type="button" size="sm" variant={countMode === 'zones' ? 'default' : 'outline'} onClick={() => setCountMode('zones')}>
                  Ocupación por zona
                </Button>
              </div>
              {countMode === 'zones' && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={config.mode === 'entry_exit' ? 'default' : 'outline'} onClick={() => updateZoneMode('entry_exit')}>
                    Entrada/salida
                  </Button>
                  <Button type="button" size="sm" variant={config.mode !== 'entry_exit' ? 'default' : 'outline'} onClick={() => updateZoneMode('inside')}>
                    Dentro de zona
                  </Button>
                </div>
              )}
              {countMode === 'lines' ? (
                <CountingLineEditor imageSrc={source} config={config} onChange={updateConfig} />
              ) : (
                <ZoneEditor imageSrc={source} config={config} onChange={updateConfig} />
              )}
            </div>
          ) : service.apiSlug === 'traffic' ? (
```
(El resto de la cadena `: service.apiSlug === 'traffic' ? (...)` queda igual.)

- [ ] **Step 3: Verificar TypeScript**
Run: `cd frontend && pnpm exec tsc --noEmit` → 0 errores.

---

## Task 5: `CountingResultPanel` en `ResultView`

**Files:**
- Create: `frontend/app/services/[slug]/_components/CountingResultPanel.tsx`
- Modify: `frontend/app/services/[slug]/_components/ResultView.tsx`

- [ ] **Step 1: Crear `CountingResultPanel.tsx`**

```tsx
'use client'

export type CountingLineMetric = {
  label: string
  in_label: string
  out_label: string
  in_total: number
  out_total: number
  by_class_in: Record<string, number>
  by_class_out: Record<string, number>
}

export type CountingZoneMetric = {
  label: string
  peak_occupancy: number
  peak_at_sec: number
  avg_occupancy: number
  max_count: number
}

interface Props {
  lines: CountingLineMetric[]
  zones: CountingZoneMetric[]
}

function classBreakdown(byClass: Record<string, number>): string {
  const entries = Object.entries(byClass)
  if (entries.length === 0) return '—'
  return entries.map(([name, n]) => `${name}: ${n}`).join(' · ')
}

export function CountingResultPanel({ lines, zones }: Props) {
  return (
    <div className="space-y-3">
      {lines.length > 0 && (
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <p className="text-sm font-semibold">Cruces por línea</p>
          <ul className="mt-3 space-y-3">
            {lines.map((line, i) => (
              <li key={`${line.label}-${i}`} className="rounded-md border border-border/70 p-2.5">
                <p className="text-sm font-medium">{line.label}</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-muted/50 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-muted-foreground">{line.in_label}</p>
                    <p className="mt-0.5 font-mono text-base">{line.in_total}</p>
                    <p className="mt-0.5 text-muted-foreground">{classBreakdown(line.by_class_in)}</p>
                  </div>
                  <div className="rounded bg-muted/50 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-muted-foreground">{line.out_label}</p>
                    <p className="mt-0.5 font-mono text-base">{line.out_total}</p>
                    <p className="mt-0.5 text-muted-foreground">{classBreakdown(line.by_class_out)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {zones.length > 0 && (
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <p className="text-sm font-semibold">Ocupación por zona</p>
          <ul className="mt-3 space-y-2">
            {zones.map((zone, i) => (
              <li key={`${zone.label}-${i}`} className="flex items-center justify-between rounded-md border border-border/70 p-2.5 text-xs">
                <span className="font-medium">{zone.label}</span>
                <span className="font-mono text-muted-foreground">
                  pico {zone.peak_occupancy} @ {zone.peak_at_sec}s · prom {zone.avg_occupancy}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render en `ResultView.tsx`**

Tras el import de `TargetMetricsCard`, añadir:
```tsx
import {
  CountingResultPanel,
  type CountingLineMetric,
  type CountingZoneMetric,
} from './CountingResultPanel'
```
Dentro de `ResultView`, junto a `const targetMetrics = ...`, añadir extractores:
```tsx
  const countingLines = Array.isArray(job.metrics?.lines)
    ? (job.metrics?.lines as CountingLineMetric[])
    : []
  const countingZones = Array.isArray(job.metrics?.zones)
    ? (job.metrics?.zones as CountingZoneMetric[])
    : []
```
Antes del bloque genérico de métricas (`{job.metrics && (`), añadir:
```tsx
        {(countingLines.length > 0 || countingZones.length > 0) && (
          <CountingResultPanel lines={countingLines} zones={countingZones} />
        )}
```
Y en el `.filter(([key]) => key !== 'targets')` del bloque genérico, ampliar para no duplicar:
```tsx
                .filter(([key]) => key !== 'targets' && key !== 'lines' && key !== 'zones')
```

- [ ] **Step 3: Verificar TypeScript**
Run: `cd frontend && pnpm exec tsc --noEmit` → 0 errores.

---

## Task 6: Suite completa, registry y verificación manual

**Files:**
- Modify: `docs/components-registry.md`

- [ ] **Step 1: Backend**
Run: `cd backend && python -m pytest -q` → PASS total.

- [ ] **Step 2: Frontend**
Run: `cd frontend && pnpm exec tsc --noEmit` → 0 errores.

- [ ] **Step 3: Registry** — en `docs/components-registry.md` registrar `CountingLineEditor` (editor multi-línea con etiquetas de dirección) y `CountingResultPanel` (métricas de cruces por línea/clase y ocupación por zona).

- [ ] **Step 4: Checklist manual** (con `make dev`):
1. `/services/zone-counting` → subir video de una avenida → en config, **Conteo por línea** → dibujar una línea cruzando la calzada → etiquetas "Bajan"/"Suben" → en clases, filtrar `car, motorcycle, truck`.
2. Procesar → en resultados, tarjeta por línea con totales por dirección y desglose por clase.
3. Repetir con video de entrada a un local → línea en la puerta, clase `person`, etiquetas "Entran"/"Salen".
4. Probar **Ocupación por zona**: dibujar una zona → resultados muestran pico/promedio de ocupación.
5. Edge: sin líneas ni zonas → procesa con zona = frame completo (compat).

---

## Self-Review (autor del plan)

- **Cobertura de spec:** `config_lines` (Task 1) · conteo por línea clase/dirección + ocupación temporal + métricas (Task 2) · tipos `in_label`/`out_label` (Task 3) · editor multi-línea + toggle (Task 4) · panel de resultados (Task 5) · suite/registry/manual (Task 6). ✔
- **Placeholders:** ninguno; todo el código está explícito. ✔
- **Consistencia de tipos:** `config_lines` devuelve `{label,start,end,in_label,out_label}` usado igual en Task 2; métricas `lines[]`/`zones[]` con las mismas claves en backend (Task 2) y `CountingResultPanel`/`ResultView` (Task 5). `LineConfig.in_label/out_label` (Task 3) usados en `CountingLineEditor` (Task 4). ✔
- **Sin commits:** pasos "Verify" en vez de commit. ✔
```
