# Tracking Refinement Anchors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PROJECT RULE — NO COMMITS:** `CLAUDE.md` says **never run `git commit`**. Every "Commit" step in the standard plan format is replaced here by a **Verify** step. Do not commit. Leave changes in the working tree.

**Goal:** Permitir refinar el seguimiento de un objeto re-seleccionándolo en frames posteriores (estilo SAM 3): cada re-selección agrega un *ancla* (frame+bbox) al mismo target, que el backend usa para re-bind de identidad + refresco de apariencia.

**Architecture:** Cada `TrackingTarget` pasa de un `{frame_idx, bbox}` único a una lista `anchors: [{frame_idx, bbox}]`. El frontend convierte el frame absoluto del video a índice **local al segmento** (usando `fps` + `segment.start_sec`) antes de enviar, de modo que el backend siga indexando `frames` directamente (esto además corrige un bug latente con segmentos recortados). El processor, al llegar al frame de un ancla, fuerza el binding por IoU y refresca el embedding.

**Tech Stack:** FastAPI, OpenCV, NumPy, supervision (ByteTrack), pytest; Next.js + TypeScript + Zustand, pnpm.

---

## File Structure

**Backend**
- Modify `backend/routers/services/_config.py` — `parse_targets` soporta `anchors` (+ legacy), valida, ordena.
- Modify `backend/routers/services/processors/tracking.py` — `_process_with_targets` re-bind en frames de ancla + embedding inicial desde primera ancla.
- Test `backend/tests/test_processing_config.py` — casos de anclas.
- Test `backend/tests/test_tracking_targets.py` — smoke multi-ancla.

**Frontend**
- Modify `frontend/lib/processing-config.ts` — tipos `TargetAnchor`, `TrackingTarget.anchors`, `MAX_ANCHORS_PER_TARGET`.
- Modify `frontend/app/services/[slug]/_components/DetectionOverlay.tsx` — `isSelected` por anclas.
- Modify `frontend/app/services/[slug]/_components/TargetSelectionView.tsx` — modo refinamiento + conversión a frame local.
- Modify `frontend/app/services/[slug]/_components/TargetPanel.tsx` — lista de anclas, botón "Refinar", quitar ancla.
- Modify `frontend/app/services/[slug]/_components/useServiceWorkflow.ts` — envío de `anchors`.
- Modify `docs/components-registry.md` — actualizar notas de los componentes tocados.

---

## Task 1: `parse_targets` soporta anclas multi-frame

**Files:**
- Modify: `backend/routers/services/_config.py:172-202`
- Test: `backend/tests/test_processing_config.py`

- [ ] **Step 1: Escribir tests que fallan**

Añadir a `backend/tests/test_processing_config.py`:

```python
from routers.services._config import parse_targets


def _bbox(x1, y1, x2, y2):
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}


def test_parse_targets_anchors_to_pixels_sorted():
    config = {"targets": [{
        "name": "Jugador",
        "color": "#ff0000",
        "styles": ["ellipse"],
        "anchors": [
            {"frame_idx": 30, "bbox": _bbox(0.5, 0.5, 0.75, 0.75)},
            {"frame_idx": 5, "bbox": _bbox(0.0, 0.0, 0.5, 0.5)},
        ],
    }]}
    [target] = parse_targets(config, 200, 100)
    # Ordenadas por frame_idx ascendente
    assert [a["frame_idx"] for a in target["anchors"]] == [5, 30]
    # Pixeles
    assert target["anchors"][0]["bbox"] == (0, 0, 100, 50)
    # Compat: frame_idx/bbox de nivel superior = primera ancla
    assert target["frame_idx"] == 5
    assert target["bbox"] == (0, 0, 100, 50)


def test_parse_targets_legacy_single_bbox_becomes_one_anchor():
    config = {"targets": [{"frame_idx": 7, "bbox": _bbox(0.1, 0.1, 0.2, 0.2)}]}
    [target] = parse_targets(config, 100, 100)
    assert len(target["anchors"]) == 1
    assert target["anchors"][0]["frame_idx"] == 7
    assert target["bbox"] == target["anchors"][0]["bbox"]


def test_parse_targets_too_many_anchors_raises():
    anchors = [{"frame_idx": i, "bbox": _bbox(0.1, 0.1, 0.2, 0.2)} for i in range(6)]
    config = {"targets": [{"anchors": anchors}]}
    try:
        parse_targets(config, 100, 100)
        assert False, "expected ValueError"
    except ValueError as e:
        assert "anchor" in str(e).lower()


def test_parse_targets_anchor_degenerate_bbox_raises():
    config = {"targets": [{"anchors": [{"frame_idx": 0, "bbox": _bbox(0.5, 0.5, 0.5, 0.5)}]}]}
    try:
        parse_targets(config, 100, 100)
        assert False, "expected ValueError"
    except ValueError as e:
        assert "area" in str(e).lower() or "bbox" in str(e).lower()
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd backend && python -m pytest tests/test_processing_config.py -k anchor -v`
Expected: FAIL (parse_targets aún no entiende `anchors`).

- [ ] **Step 3: Implementar**

Reemplazar el cuerpo del bucle en `parse_targets` (`backend/routers/services/_config.py:172-202`) por:

```python
MAX_ANCHORS_PER_TARGET = 5


def _parse_bbox(bbox: Any, width: int, height: int) -> tuple[int, int, int, int]:
    if not isinstance(bbox, dict):
        raise ValueError("Target bbox must be an object")
    x1, y1 = point_to_pixel({"x": bbox.get("x1"), "y": bbox.get("y1")}, width, height)
    x2, y2 = point_to_pixel({"x": bbox.get("x2"), "y": bbox.get("y2")}, width, height)
    if x2 <= x1 or y2 <= y1:
        raise ValueError("Invalid bbox: must have positive area")
    return (x1, y1, x2, y2)


def parse_targets(config: Optional[dict[str, Any]], width: int, height: int) -> list[dict[str, Any]]:
    """Valida y normaliza config['targets'] a pixeles. Lanza ValueError si es inválido."""
    raw_targets = (config or {}).get("targets") or []
    if len(raw_targets) > MAX_TARGETS:
        raise ValueError(f"Too many targets: max {MAX_TARGETS}")

    targets: list[dict[str, Any]] = []
    for raw in raw_targets:
        if not isinstance(raw, dict):
            raise ValueError("Each target must be an object")

        styles = list(raw.get("styles") or [])
        invalid = set(styles) - ALLOWED_TARGET_STYLES
        if invalid:
            raise ValueError(f"Unknown style(s): {sorted(invalid)}")

        raw_anchors = raw.get("anchors")
        if not raw_anchors:
            # Legacy: un único bbox/frame_idx → una sola ancla
            raw_anchors = [{"frame_idx": raw.get("frame_idx"), "bbox": raw.get("bbox")}]
        if not isinstance(raw_anchors, list):
            raise ValueError("Target anchors must be a list")
        if len(raw_anchors) > MAX_ANCHORS_PER_TARGET:
            raise ValueError(f"Too many anchors: max {MAX_ANCHORS_PER_TARGET}")

        anchors: list[dict[str, Any]] = []
        for raw_anchor in raw_anchors:
            if not isinstance(raw_anchor, dict):
                raise ValueError("Each anchor must be an object")
            anchors.append({
                "frame_idx": max(0, int(raw_anchor.get("frame_idx") or 0)),
                "bbox": _parse_bbox(raw_anchor.get("bbox"), width, height),
            })
        anchors.sort(key=lambda a: a["frame_idx"])

        targets.append({
            "anchors": anchors,
            "frame_idx": anchors[0]["frame_idx"],
            "bbox": anchors[0]["bbox"],
            "name": str(raw.get("name") or f"Objeto {len(targets) + 1}"),
            "color": str(raw.get("color") or "#00ffcc"),
            "styles": styles or ["box", "label"],
        })
    return targets
```

- [ ] **Step 4: Verificar que pasan**

Run: `cd backend && python -m pytest tests/test_processing_config.py -v`
Expected: PASS (incluidos los tests existentes — el formato legacy sigue funcionando).

- [ ] **Step 5: Verify (sin commit)**

Run: `cd backend && python -c "from routers.services._config import parse_targets; print('ok')"`
Expected: `ok`. No ejecutar `git commit`.

---

## Task 2: Re-bind por ancla en `_process_with_targets`

**Files:**
- Modify: `backend/routers/services/processors/tracking.py` (`_process_with_targets`)
- Test: `backend/tests/test_tracking_targets.py`

**Contexto:** `parse_targets` ahora entrega `target["anchors"]` (índices locales al segmento, ordenados). El embedding inicial debe tomarse de la **primera** ancla. En cada frame `i` que coincida con `anchor["frame_idx"]`, buscar la detección con mayor IoU al `anchor["bbox"]` (> 0.3) y forzar `matcher.bind(...)` + `matcher.update_embedding(...)`, reseteando `missed`/`last_bbox`.

- [ ] **Step 1: Escribir test que falla**

Añadir a `backend/tests/test_tracking_targets.py` (reutiliza los fakes ya existentes en el archivo):

```python
def test_tracking_with_multi_anchor_target_runs_and_reports_metrics():
    frames = [_blank_frame() for _ in range(4)]
    config = {
        "frame_width": 200,
        "frame_height": 100,
        "targets": [{
            "name": "Jugador",
            "color": "#00ffcc",
            "styles": ["ellipse", "label"],
            "anchors": [
                {"frame_idx": 0, "bbox": {"x1": 0.05, "y1": 0.1, "x2": 0.25, "y2": 0.8}},
                {"frame_idx": 2, "bbox": {"x1": 0.05, "y1": 0.1, "x2": 0.25, "y2": 0.8}},
            ],
        }],
    }
    annotated, metrics = process_tracking(frames, _FakeModel(), config)
    assert len(annotated) == 4
    assert metrics["targets"][0]["name"] == "Jugador"
    assert "tracked_coverage" in metrics["targets"][0]
```

> Nota: si `_blank_frame()` no existe en el archivo, definirlo junto a los fakes:
> ```python
> def _blank_frame():
>     return np.zeros((100, 200, 3), dtype=np.uint8)
> ```
> y asegurar `from routers.services.processors.tracking import process_tracking` está importado.

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && python -m pytest tests/test_tracking_targets.py -k multi_anchor -v`
Expected: FAIL (o KeyError) porque aún no se procesan `anchors`.

- [ ] **Step 3: Implementar el re-bind por ancla**

En `backend/routers/services/processors/tracking.py`, dentro de `_process_with_targets`, **(a)** cambiar el registro inicial para usar la primera ancla con índice local clampeado, y **(b)** construir el mapa de anclas y aplicarlo en el loop.

(a) Reemplazar el bloque de registro inicial:

```python
    # Registrar embedding inicial de cada target desde su primera ancla
    for idx, target in enumerate(targets):
        first = target["anchors"][0]
        local = min(max(0, first["frame_idx"]), len(frames) - 1)
        matcher.register(idx, appearance_embedding(frames[local], first["bbox"]))

    # Mapa de anclas por frame local: {idx_local: [(target_idx, bbox), ...]}
    anchors_by_frame: dict[int, list[tuple[int, tuple[int, int, int, int]]]] = {}
    for idx, target in enumerate(targets):
        for anchor in target["anchors"]:
            local = min(max(0, anchor["frame_idx"]), len(frames) - 1)
            anchors_by_frame.setdefault(local, []).append((idx, anchor["bbox"]))
```

(Eliminar el `pending_init` basado en `t["bbox"]` y sustituir su inicialización por la primera ancla:)

```python
    pending_init = {i: t["anchors"][0]["bbox"] for i, t in enumerate(targets)}
```

(b) Al inicio del cuerpo del `for frame_i, frame in enumerate(frames):` (cambiar el `for frame in frames:` por `for frame_i, frame in enumerate(frames):`), después de `detections = tracker.update_with_detections(detections)` y del manejo de `active_tracks`, insertar el re-bind por ancla:

```python
        # Re-bind dirigido por anclas en este frame
        for target_idx, anchor_bbox in anchors_by_frame.get(frame_i, []):
            best_det, best_iou = None, 0.3
            if detections.tracker_id is not None:
                for det_i, track_id in enumerate(detections.tracker_id.tolist()):
                    iou = _iou(detections.xyxy[det_i], anchor_bbox)
                    if iou > best_iou:
                        best_iou = iou
                        best_det = (det_i, int(track_id))
            if best_det is not None:
                det_i, track_id = best_det
                bbox = tuple(int(v) for v in detections.xyxy[det_i])
                matcher.bind(target_idx, track_id, bbox)
                matcher.update_embedding(target_idx, appearance_embedding(frame, bbox))
                pending_init.pop(target_idx, None)
                stats[target_idx]["missed"] = 0
                stats[target_idx]["last_bbox"] = bbox
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd backend && python -m pytest tests/test_tracking_targets.py -v`
Expected: PASS (incluido el test existente de targets de una sola ancla).

- [ ] **Step 5: Verify (sin commit)**

Run: `cd backend && python -m pytest -q`
Expected: toda la suite en verde. No ejecutar `git commit`.

---

## Task 3: Tipos frontend y overlay por anclas

**Files:**
- Modify: `frontend/lib/processing-config.ts`
- Modify: `frontend/app/services/[slug]/_components/DetectionOverlay.tsx`

- [ ] **Step 1: Tipos**

En `frontend/lib/processing-config.ts` reemplazar el tipo `TrackingTarget` y añadir `TargetAnchor` + constante:

```typescript
export type TargetAnchor = {
  frame_idx: number
  bbox: { x1: number; y1: number; x2: number; y2: number }
}

export type TrackingTarget = {
  id: string
  anchors: TargetAnchor[]
  name: string
  color: string
  styles: TargetStyle[]
  cropB64?: string
}

export const MAX_TRACKING_TARGETS = 5
export const MAX_ANCHORS_PER_TARGET = 5
```

(Si ya existe `export const MAX_TRACKING_TARGETS = 5`, no duplicarlo: sólo añadir `MAX_ANCHORS_PER_TARGET` y el tipo `TargetAnchor`, y actualizar `TrackingTarget`.)

- [ ] **Step 2: Overlay usa anclas**

En `frontend/app/services/[slug]/_components/DetectionOverlay.tsx` cambiar `isSelected` para comparar contra cualquier ancla:

```tsx
function isSelected(det: DetectionPreviewEntry, targets: TrackingTarget[]): boolean {
  return targets.some((t) =>
    t.anchors.some(
      (a) =>
        Math.abs(a.bbox.x1 - det.bbox.x1) < 0.02 && Math.abs(a.bbox.y1 - det.bbox.y1) < 0.02
    )
  )
}
```

- [ ] **Step 3: Verificar TypeScript (fallará en otros archivos aún)**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: errores SÓLO en `TargetSelectionView.tsx`, `TargetPanel.tsx`, `useServiceWorkflow.ts` (se arreglan en Tasks 4-6). `DetectionOverlay.tsx` y `processing-config.ts` sin errores.

---

## Task 4: Modo refinamiento en `TargetSelectionView`

**Files:**
- Modify: `frontend/app/services/[slug]/_components/TargetSelectionView.tsx`

**Contexto:** El clic entrega `frameIdx` **absoluto** (del frame muestreado). Hay que convertirlo a índice **local al segmento**: `local = frameIdx - round(start_sec * fps)`. Si `refiningTargetId` está activo, el clic agrega un ancla a ese target; si no, crea/quita target.

- [ ] **Step 1: Estado, helpers y nueva firma de toggle**

Reemplazar el cuerpo de `TargetSelectionView` (de `const [currentTime...` hasta el cierre de `removeTarget`) por:

```tsx
  const { loading, error, fps, frames, confidence, retryWithConfidence } =
    useDetectionPreview(slug, jobId, token, segment)
  const [currentTime, setCurrentTime] = useState(segment?.start_sec ?? 0)
  const [refiningTargetId, setRefiningTargetId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  function handleLoadedMetadata() {
    const video = videoRef.current
    if (video && segment && segment.start_sec > 0) {
      video.currentTime = segment.start_sec
    }
  }

  const frame = nearestFrame(frames, fps, currentTime)
  const startFrame = Math.round((segment?.start_sec ?? 0) * fps)

  function localFrameIdx(absoluteFrameIdx: number): number {
    return Math.max(0, absoluteFrameIdx - startFrame)
  }

  function anchorFromDetection(det: DetectionPreviewEntry, absoluteFrameIdx: number): TargetAnchor {
    return { frame_idx: localFrameIdx(absoluteFrameIdx), bbox: det.bbox }
  }

  function handleToggle(det: DetectionPreviewEntry, frameIdx: number) {
    // Modo refinamiento: agrega un ancla al target activo
    if (refiningTargetId) {
      const target = targets.find((t) => t.id === refiningTargetId)
      if (!target || target.anchors.length >= MAX_ANCHORS_PER_TARGET) return
      const anchor = anchorFromDetection(det, frameIdx)
      onChange(
        targets.map((t) =>
          t.id === refiningTargetId ? { ...t, anchors: [...t.anchors, anchor] } : t
        )
      )
      return
    }

    // Modo normal: si la detección ya es ancla de algún target, quitar ese target
    const existing = targets.find((t) =>
      t.anchors.some(
        (a) => Math.abs(a.bbox.x1 - det.bbox.x1) < 0.02 && Math.abs(a.bbox.y1 - det.bbox.y1) < 0.02
      )
    )
    if (existing) {
      onChange(targets.filter((t) => t.id !== existing.id))
      return
    }
    if (targets.length >= MAX_TRACKING_TARGETS) return
    const next: TrackingTarget = {
      id: crypto.randomUUID(),
      anchors: [anchorFromDetection(det, frameIdx)],
      name: `${det.class_name} ${targets.length + 1}`,
      color: PALETTE[targets.length % PALETTE.length],
      styles: ['ellipse', 'label'],
      cropB64: det.crop_b64,
    }
    onChange([...targets, next])
  }

  function updateTarget(id: string, patch: Partial<TrackingTarget>) {
    onChange(targets.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function removeTarget(id: string) {
    if (refiningTargetId === id) setRefiningTargetId(null)
    onChange(targets.filter((t) => t.id !== id))
  }

  function removeAnchor(targetId: string, anchorIndex: number) {
    const target = targets.find((t) => t.id === targetId)
    if (!target) return
    const nextAnchors = target.anchors.filter((_, i) => i !== anchorIndex)
    if (nextAnchors.length === 0) {
      removeTarget(targetId)
      return
    }
    onChange(targets.map((t) => (t.id === targetId ? { ...t, anchors: nextAnchors } : t)))
  }
```

- [ ] **Step 2: Imports y banner de refinamiento**

Actualizar el import de `processing-config` para incluir los nuevos símbolos:

```tsx
import {
  MAX_ANCHORS_PER_TARGET,
  MAX_TRACKING_TARGETS,
  type AnalysisSegment,
  type TargetAnchor,
  type TrackingTarget,
} from '@/lib/processing-config'
```

Pasar `fps` y los handlers de refinamiento al panel y mostrar un aviso cuando el modo está activo. Cambiar el render de `<TargetPanel .../>` por:

```tsx
          {refiningTargetId && (
            <p className="text-sm text-brand">
              Modo refinamiento: haz clic sobre el mismo objeto en este frame para añadir un ancla.
            </p>
          )}
          <TargetPanel
            targets={targets}
            fps={fps}
            refiningTargetId={refiningTargetId}
            onUpdate={updateTarget}
            onRemove={removeTarget}
            onRemoveAnchor={removeAnchor}
            onToggleRefine={(id) => setRefiningTargetId((cur) => (cur === id ? null : id))}
          />
```

- [ ] **Step 3: Verificar TypeScript (TargetPanel aún pendiente)**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: errores SÓLO en `TargetPanel.tsx` (props nuevas) y posiblemente `useServiceWorkflow.ts`.

---

## Task 5: `TargetPanel` con anclas y botón "Refinar"

**Files:**
- Modify: `frontend/app/services/[slug]/_components/TargetPanel.tsx`

- [ ] **Step 1: Nueva interfaz de props y helpers de tiempo**

Reemplazar la `interface Props` (añadir las props nuevas a la importación existente de `processing-config`):

```tsx
import { MAX_ANCHORS_PER_TARGET, MAX_TRACKING_TARGETS, type TargetStyle, type TrackingTarget } from '@/lib/processing-config'

interface Props {
  targets: TrackingTarget[]
  fps: number
  refiningTargetId: string | null
  onUpdate: (id: string, patch: Partial<TrackingTarget>) => void
  onRemove: (id: string) => void
  onRemoveAnchor: (targetId: string, anchorIndex: number) => void
  onToggleRefine: (id: string) => void
}
```

> El timestamp de cada ancla se renderiza con la fórmula inline `+{(anchor.frame_idx / (fps || 30)).toFixed(1)}s` (Step 2), por lo que no se necesita importar ningún formatter adicional. `MAX_TRACKING_TARGETS` se mantiene en el import porque el aviso de límite al final del componente lo usa.

- [ ] **Step 2: Render de anclas + botón Refinar**

Dentro del `<li>` de cada target, después del bloque de chips de estilos (antes de cerrar el `</li>`), añadir la sección de anclas:

```tsx
          <div className="mt-3 border-t border-border/60 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Anclas ({target.anchors.length}/{MAX_ANCHORS_PER_TARGET})
              </span>
              <button
                type="button"
                className={
                  refiningTargetId === target.id
                    ? 'rounded-full border border-brand bg-brand/15 px-2 py-0.5 text-xs text-brand'
                    : 'rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:border-brand/50'
                }
                aria-pressed={refiningTargetId === target.id}
                disabled={refiningTargetId !== target.id && target.anchors.length >= MAX_ANCHORS_PER_TARGET}
                onClick={() => onToggleRefine(target.id)}
              >
                {refiningTargetId === target.id ? 'Refinando…' : 'Refinar'}
              </button>
            </div>
            <ul className="mt-1.5 space-y-1">
              {target.anchors.map((anchor, i) => (
                <li key={`${anchor.frame_idx}-${i}`} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">
                    +{(anchor.frame_idx / (fps || 30)).toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    className="text-destructive hover:underline"
                    aria-label={`Quitar ancla ${i + 1}`}
                    onClick={() => onRemoveAnchor(target.id, i)}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          </div>
```

> Nota: el thumbnail/nombre/color/estilos del target se mantienen igual; sólo se añade esta sección. La línea de aviso de límite `targets.length >= MAX_TRACKING_TARGETS` al final se conserva.

- [ ] **Step 3: Verificar TypeScript**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: errores SÓLO en `useServiceWorkflow.ts` (Task 6) si los hubiera.

---

## Task 6: Envío de `anchors` en `useServiceWorkflow`

**Files:**
- Modify: `frontend/app/services/[slug]/_components/useServiceWorkflow.ts`

**Contexto:** `handleConfirm` ya elimina `id`/`cropB64` y envía el resto. Como `TrackingTarget` ahora lleva `anchors` (planos, sin campos de UI), el payload ya queda limpio. Sólo hay que confirmar que el `map` sigue tipando bien.

- [ ] **Step 1: Confirmar el stripping**

Verificar que el bloque en `handleConfirm` es:

```typescript
      // El backend ignora `id` y `cropB64`; se omiten para enviar un payload limpio.
      const apiTargets = targets.map(({ id: _id, cropB64: _crop, ...rest }) => rest)
      const configToSend: ProcessingConfig | undefined = targets.length > 0 && processingConfig
        ? { ...processingConfig, targets: apiTargets as ProcessingConfig['targets'] }
        : processingConfig ?? undefined
```

`...rest` ahora incluye `anchors`, `name`, `color`, `styles` — correcto. No requiere cambios salvo que TypeScript marque el cast; si lo hace, mantener `as ProcessingConfig['targets']`.

- [ ] **Step 2: Verificar TypeScript limpio**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 errores en todo el frontend.

---

## Task 7: Suite completa, registry y verificación manual

**Files:**
- Modify: `docs/components-registry.md`

- [ ] **Step 1: Suite backend**

Run: `cd backend && python -m pytest -q`
Expected: PASS total.

- [ ] **Step 2: TypeScript**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Actualizar registry**

En `docs/components-registry.md`, actualizar las notas de `TargetSelectionView`, `TargetPanel` y `DetectionOverlay` para mencionar las **anclas de refinamiento** (modo "Refinar", lista de anclas por target, selección por anclas).

- [ ] **Step 4: Checklist de verificación manual (UI)**

Con `make dev` corriendo y el backend reiniciado (carga `yolov8m`):

1. **Ruta:** `/services/tracking` → subir un video con personas y recortar el segmento dejando fuera cualquier intro en negro.
2. **Acción:** en Selección, clicar un objeto → aparece como target con 1 ancla (+0.0s).
3. **Acción:** avanzar el video unos segundos → pulsar **Refinar** en ese target → clicar el mismo objeto → se añade una 2ª ancla con su timestamp (+N.Ns).
4. **Acción:** quitar una ancla desde el panel → se elimina; quitar la última → se elimina el target.
5. **Acción:** continuar → configurar → confirmar (con recargo Re-ID ×1.3) → procesar.
6. **Resultado esperado:** el objeto se sigue de forma más estable a lo largo del video; el re-bind en el frame de la 2ª ancla corrige la identidad si se había saltado a otro objeto.
7. **Edge cases:** intentar añadir una 6ª ancla → botón "Refinar" deshabilitado; recortar segmento y verificar que las cajas de selección caen sobre el segmento correcto (bug de índice corregido).

---

## Self-Review (completado por el autor del plan)

- **Cobertura de spec:** modelo de datos (Task 3) · `parse_targets` anclas+legacy+límite+orden (Task 1) · re-bind por ancla + embedding inicial + mapeo local (Task 2 + conversión en Task 4) · UI modo refinamiento (Task 4) · panel de anclas + Refinar + quitar (Task 5) · envío (Task 6) · edge cases (checklist Task 7). ✔
- **Mecanismo de offset:** resuelto como conversión absoluto→local en el frontend (Task 4), evitando tocar la firma del processor; corrige además el bug de índice con segmentos recortados. ✔
- **Sin commits:** todos los pasos "Commit" sustituidos por "Verify" por la regla del proyecto. ✔
- **Consistencia de tipos:** `TargetAnchor`/`anchors` usados igual en types (Task 3), overlay (Task 3), view (Task 4), panel (Task 5), envío (Task 6); backend `anchors` con `frame_idx`/`bbox` (Tasks 1-2). ✔
```
