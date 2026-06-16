# Tracking Interactivo de Objetos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Reglas del proyecto:** NUNCA hacer commits. Cada paso requiere aprobación explícita del usuario antes de implementarse. Frontend usa pnpm. Leer `frontend/node_modules/next/dist/docs/` antes de tocar código Next.js (versión con breaking changes).

**Spec:** `docs/superpowers/specs/2026-06-12-interactive-tracking-design.md`

**Goal:** El usuario selecciona hasta 5 objetos en el video (clic sobre preview de detecciones), les asigna nombre/color/estilos, y el backend los sigue con ByteTrack + Re-ID por apariencia, renderizando solo los anotadores elegidos.

**Architecture:** Dos pasadas. (1) `POST /services/tracking/detection-preview` muestrea frames y devuelve detecciones clicables. (2) `POST /services/tracking/process` recibe `targets[]` dentro de `processing_config` y el procesador de tracking usa Re-ID para mantener identidad. Se refactoriza `_processors.py` en un paquete `processors/` y se añade una factory de anotadores compartida.

**Tech Stack:** FastAPI, supervision (ByteTrack, annotators), OpenCV, NumPy, Next.js + TypeScript + Zustand, pytest.

**Nota de simplificación consciente:** el embedding de Re-ID es un histograma HSV normalizado (sin features de backbone). Es suficiente para distinguir camisetas/colores en fútbol y mantiene el procesamiento ligero; si la calidad no basta, se evalúa un modelo dedicado después (fuera de alcance según spec).

---

## Fase 1 — Backend: modelo de datos de targets

### Task 1: Parseo y validación de targets en `_config.py`

**Files:**
- Modify: `backend/routers/services/_config.py`
- Test: `backend/tests/test_processing_config.py`

- [ ] **Step 1: Escribir tests que fallan**

Añadir al final de `backend/tests/test_processing_config.py`:

```python
from routers.services._config import parse_targets, ALLOWED_TARGET_STYLES, MAX_TARGETS


def test_parse_targets_empty_config():
    assert parse_targets({}, 1920, 1080) == []
    assert parse_targets({"targets": None}, 1920, 1080) == []


def test_parse_targets_normalizes_and_validates():
    config = {"targets": [{
        "frame_idx": 12,
        "bbox": {"x1": 0.1, "y1": 0.2, "x2": 0.3, "y2": 0.5},
        "name": "Messi #10",
        "color": "#00ffcc",
        "styles": ["ellipse", "trace", "label"],
    }]}
    targets = parse_targets(config, 1000, 800)
    assert len(targets) == 1
    t = targets[0]
    assert t["frame_idx"] == 12
    assert t["bbox"] == (100, 160, 300, 400)  # pixeles, x1<x2, y1<y2
    assert t["name"] == "Messi #10"
    assert t["color"] == "#00ffcc"
    assert t["styles"] == ["ellipse", "trace", "label"]


def test_parse_targets_rejects_invalid():
    import pytest
    # más de MAX_TARGETS
    many = {"targets": [{"frame_idx": 0, "bbox": {"x1": 0, "y1": 0, "x2": 0.1, "y2": 0.1},
                         "name": f"t{i}", "color": "#fff", "styles": ["box"]}
                        for i in range(MAX_TARGETS + 1)]}
    with pytest.raises(ValueError, match="max"):
        parse_targets(many, 100, 100)
    # estilo fuera del enum
    bad_style = {"targets": [{"frame_idx": 0, "bbox": {"x1": 0, "y1": 0, "x2": 0.1, "y2": 0.1},
                              "name": "a", "color": "#fff", "styles": ["sparkles"]}]}
    with pytest.raises(ValueError, match="style"):
        parse_targets(bad_style, 100, 100)
    # bbox degenerado
    bad_bbox = {"targets": [{"frame_idx": 0, "bbox": {"x1": 0.5, "y1": 0.5, "x2": 0.5, "y2": 0.5},
                             "name": "a", "color": "#fff", "styles": ["box"]}]}
    with pytest.raises(ValueError, match="bbox"):
        parse_targets(bad_bbox, 100, 100)
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd backend && python -m pytest tests/test_processing_config.py -v -k targets`
Expected: FAIL con `ImportError: cannot import name 'parse_targets'`

- [ ] **Step 3: Implementar en `_config.py`**

Añadir al final de `backend/routers/services/_config.py`:

```python
# ── Tracking targets ──────────────────────────────────────────────────────────

MAX_TARGETS = 5

ALLOWED_TARGET_STYLES = {
    "box", "ellipse", "triangle", "halo", "color", "trace", "spotlight", "label",
}


def parse_targets(config: Optional[dict[str, Any]], width: int, height: int) -> list[dict[str, Any]]:
    """Valida y normaliza config['targets'] a pixeles. Lanza ValueError si es inválido."""
    raw_targets = (config or {}).get("targets") or []
    if len(raw_targets) > MAX_TARGETS:
        raise ValueError(f"Too many targets: max {MAX_TARGETS}")

    targets: list[dict[str, Any]] = []
    for raw in raw_targets:
        styles = list(raw.get("styles") or [])
        invalid = set(styles) - ALLOWED_TARGET_STYLES
        if invalid:
            raise ValueError(f"Unknown style(s): {sorted(invalid)}")

        bbox = raw.get("bbox") or {}
        x1, y1 = point_to_pixel({"x": bbox.get("x1"), "y": bbox.get("y1")}, width, height)
        x2, y2 = point_to_pixel({"x": bbox.get("x2"), "y": bbox.get("y2")}, width, height)
        if x2 <= x1 or y2 <= y1:
            raise ValueError("Invalid bbox: must have positive area")

        targets.append({
            "frame_idx": int(raw.get("frame_idx") or 0),
            "bbox": (x1, y1, x2, y2),
            "name": str(raw.get("name") or f"Objeto {len(targets) + 1}"),
            "color": str(raw.get("color") or "#00ffcc"),
            "styles": styles or ["box", "label"],
        })
    return targets
```

- [ ] **Step 4: Verificar que pasan**

Run: `cd backend && python -m pytest tests/test_processing_config.py -v`
Expected: PASS (todos, incluidos los preexistentes)

---

## Fase 2 — Backend: factory de anotadores

### Task 2: `_annotators.py`

**Files:**
- Create: `backend/routers/services/_annotators.py`
- Test: `backend/tests/test_annotators.py`

- [ ] **Step 1: Escribir tests que fallan**

Create `backend/tests/test_annotators.py`:

```python
import numpy as np
import supervision as sv

from routers.services._annotators import annotate_target, hex_to_bgr


def _detections(bbox=(10, 10, 50, 80), tid=1):
    return sv.Detections(
        xyxy=np.array([bbox], dtype=np.float32),
        class_id=np.array([0]),
        confidence=np.array([0.9], dtype=np.float32),
        tracker_id=np.array([tid]),
    )


def test_hex_to_bgr():
    assert hex_to_bgr("#ff0000") == (0, 0, 255)
    assert hex_to_bgr("#00ffcc") == (204, 255, 0)
    assert hex_to_bgr("invalid") == (204, 255, 0)  # fallback


def test_annotate_target_all_styles_run_without_error():
    frame = np.zeros((120, 120, 3), dtype=np.uint8)
    dets = _detections()
    for style in ["box", "ellipse", "triangle", "halo", "color", "trace", "label"]:
        target = {"name": "Test", "color": "#ff0000", "styles": [style]}
        out = annotate_target(frame.copy(), dets, target)
        assert out.shape == frame.shape


def test_spotlight_darkens_outside_bbox():
    from routers.services._annotators import apply_spotlight
    frame = np.full((100, 100, 3), 200, dtype=np.uint8)
    out = apply_spotlight(frame, [(20, 20, 60, 60)])
    assert out[0, 0, 0] < 200      # fuera: oscurecido
    assert out[40, 40, 0] == 200   # dentro: intacto
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd backend && python -m pytest tests/test_annotators.py -v`
Expected: FAIL con `ModuleNotFoundError`

- [ ] **Step 3: Implementar**

Create `backend/routers/services/_annotators.py`:

```python
"""
Factory de anotadores por estilo, compartida por los servicios CV.
Cada target trae styles[] y color; se renderiza solo lo elegido.
"""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np
import supervision as sv

_DEFAULT_BGR = (204, 255, 0)  # #00ffcc


def hex_to_bgr(value: str) -> tuple[int, int, int]:
    raw = (value or "").lstrip("#")
    if len(raw) != 6:
        return _DEFAULT_BGR
    try:
        r, g, b = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    except ValueError:
        return _DEFAULT_BGR
    return (b, g, r)


def _color(target: dict[str, Any]) -> sv.Color:
    b, g, r = hex_to_bgr(target.get("color", ""))
    return sv.Color(r=r, g=g, b=b)


def build_annotators(target: dict[str, Any]) -> dict[str, Any]:
    """Crea los anotadores supervision para un target. Uno por target para
    que cada uno conserve su color y su propio buffer de trace."""
    color = _color(target)
    palette = sv.ColorPalette(colors=[color])
    return {
        "box": sv.BoxAnnotator(color=palette),
        "ellipse": sv.EllipseAnnotator(color=palette),
        "triangle": sv.TriangleAnnotator(color=palette),
        "color": sv.ColorAnnotator(color=palette, opacity=0.4),
        "trace": sv.TraceAnnotator(color=palette, trace_length=60),
        "label": sv.LabelAnnotator(color=palette),
    }


def apply_spotlight(frame: np.ndarray, bboxes: list[tuple[int, int, int, int]],
                    dim_factor: float = 0.35) -> np.ndarray:
    """Oscurece el frame fuera de los bboxes (efecto foco)."""
    dimmed = (frame.astype(np.float32) * dim_factor).astype(np.uint8)
    for x1, y1, x2, y2 in bboxes:
        dimmed[y1:y2, x1:x2] = frame[y1:y2, x1:x2]
    return dimmed


def apply_halo(frame: np.ndarray, bbox: tuple[int, int, int, int],
               bgr: tuple[int, int, int]) -> np.ndarray:
    """Glow elíptico aproximado sobre el bbox (sin máscaras de segmentación)."""
    x1, y1, x2, y2 = bbox
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    axes = (max(8, (x2 - x1) * 2 // 3), max(8, (y2 - y1) * 2 // 3))
    overlay = np.zeros_like(frame)
    cv2.ellipse(overlay, (cx, cy), axes, 0, 0, 360, bgr, -1)
    overlay = cv2.GaussianBlur(overlay, (0, 0), sigmaX=max(axes) / 3)
    return cv2.addWeighted(frame, 1.0, overlay, 0.55, 0)


def annotate_target(frame: np.ndarray, detections: sv.Detections,
                    target: dict[str, Any],
                    annotators: dict[str, Any] | None = None) -> np.ndarray:
    """Aplica al frame los estilos del target sobre sus detecciones.
    spotlight se aplica aparte (a nivel de escena, ver processors/tracking.py)."""
    if len(detections) == 0:
        return frame
    annotators = annotators or build_annotators(target)
    styles = target.get("styles") or ["box", "label"]

    if "halo" in styles:
        bbox = tuple(int(v) for v in detections.xyxy[0])
        frame = apply_halo(frame, bbox, hex_to_bgr(target.get("color", "")))
    for style in ("box", "ellipse", "triangle", "color", "trace"):
        if style in styles:
            frame = annotators[style].annotate(scene=frame, detections=detections)
    if "label" in styles:
        labels = [target.get("name", "")] * len(detections)
        frame = annotators["label"].annotate(scene=frame, detections=detections, labels=labels)
    return frame
```

- [ ] **Step 4: Verificar que pasan**

Run: `cd backend && python -m pytest tests/test_annotators.py -v`
Expected: PASS
Nota: si la API de `sv.ColorPalette`/`sv.Color` difiere en la versión instalada de supervision, ajustar a la firma real (verificar con `python -c "import supervision; print(supervision.__version__)"`).

---

## Fase 3 — Backend: Re-ID por apariencia

### Task 3: `_reid.py`

**Files:**
- Create: `backend/routers/services/_reid.py`
- Test: `backend/tests/test_reid.py`

- [ ] **Step 1: Escribir tests que fallan**

Create `backend/tests/test_reid.py`:

```python
import numpy as np

from routers.services._reid import appearance_embedding, TargetMatcher


def _patch(color):
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    frame[20:80, 20:60] = color
    return frame


def test_embedding_is_normalized():
    emb = appearance_embedding(_patch((0, 0, 255)), (20, 20, 60, 80))
    assert emb.ndim == 1
    assert abs(float(np.linalg.norm(emb)) - 1.0) < 1e-5


def test_matcher_reassociates_lost_target_by_appearance():
    red_frame = _patch((0, 0, 255))
    blue_frame = _patch((255, 0, 0))
    bbox = (20, 20, 60, 80)

    matcher = TargetMatcher()
    # target 0 registrado como rojo, asociado al track 7
    matcher.register(0, appearance_embedding(red_frame, bbox))
    matcher.bind(0, track_id=7, bbox=bbox)
    # track 7 desaparece
    matcher.mark_lost(track_id=7)
    # aparece track 99 rojo cerca → debe re-asociarse al target 0
    tid = matcher.match_new_track(
        appearance_embedding(red_frame, bbox), bbox=bbox, track_id=99
    )
    assert tid == 0
    # un track azul no debe matchear con nada
    matcher2 = TargetMatcher()
    matcher2.register(0, appearance_embedding(red_frame, bbox))
    matcher2.bind(0, track_id=7, bbox=bbox)
    matcher2.mark_lost(track_id=7)
    assert matcher2.match_new_track(
        appearance_embedding(blue_frame, bbox), bbox=bbox, track_id=99
    ) is None


def test_matcher_spatial_gating_rejects_far_candidates():
    red_frame = _patch((0, 0, 255))
    bbox = (20, 20, 60, 80)
    matcher = TargetMatcher(max_center_dist_ratio=0.2)
    matcher.register(0, appearance_embedding(red_frame, bbox))
    matcher.bind(0, track_id=7, bbox=bbox)
    matcher.mark_lost(track_id=7)
    far_bbox = (900, 900, 940, 960)  # mismo aspecto, muy lejos
    assert matcher.match_new_track(
        appearance_embedding(red_frame, bbox), bbox=far_bbox, track_id=99,
        frame_diag=141.4,  # diagonal del frame 100x100
    ) is None
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd backend && python -m pytest tests/test_reid.py -v`
Expected: FAIL con `ModuleNotFoundError`

- [ ] **Step 3: Implementar**

Create `backend/routers/services/_reid.py`:

```python
"""
Re-identificación ligera por apariencia para tracking de targets.
Embedding = histograma HSV normalizado del recorte. Matcher con similitud
coseno + gating espacial para re-asociar tracks perdidos.
"""
from __future__ import annotations

from typing import Optional

import cv2
import numpy as np

SIMILARITY_THRESHOLD = 0.80
EMBEDDING_ALPHA = 0.3  # actualización exponencial del embedding por frame


def appearance_embedding(frame: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray:
    x1, y1, x2, y2 = (max(0, int(v)) for v in bbox)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return np.zeros(512, dtype=np.float32)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [8, 8, 8], [0, 180, 0, 256, 0, 256])
    emb = hist.flatten().astype(np.float32)
    norm = float(np.linalg.norm(emb))
    return emb / norm if norm > 0 else emb


def _center(bbox: tuple[int, int, int, int]) -> tuple[float, float]:
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


class TargetMatcher:
    """Mantiene el vínculo target_idx ↔ track_id y re-asocia tracks perdidos."""

    def __init__(self, similarity_threshold: float = SIMILARITY_THRESHOLD,
                 max_center_dist_ratio: float = 0.5):
        self.similarity_threshold = similarity_threshold
        self.max_center_dist_ratio = max_center_dist_ratio
        self._embeddings: dict[int, np.ndarray] = {}
        self._track_to_target: dict[int, int] = {}
        self._lost_targets: dict[int, tuple[int, int, int, int]] = {}  # target → último bbox
        self.reassociations = 0

    def register(self, target_idx: int, embedding: np.ndarray) -> None:
        self._embeddings[target_idx] = embedding

    def bind(self, target_idx: int, track_id: int, bbox: tuple[int, int, int, int]) -> None:
        self._track_to_target[track_id] = target_idx
        self._lost_targets.pop(target_idx, None)
        self._last_bbox = bbox

    def target_for_track(self, track_id: int) -> Optional[int]:
        return self._track_to_target.get(track_id)

    def update_embedding(self, target_idx: int, embedding: np.ndarray) -> None:
        current = self._embeddings.get(target_idx)
        if current is None:
            self._embeddings[target_idx] = embedding
            return
        blended = (1 - EMBEDDING_ALPHA) * current + EMBEDDING_ALPHA * embedding
        norm = float(np.linalg.norm(blended))
        self._embeddings[target_idx] = blended / norm if norm > 0 else blended

    def update_last_bbox(self, target_idx: int, bbox: tuple[int, int, int, int]) -> None:
        self._last_seen_bbox = self._lost_targets.get(target_idx)
        self._last_position = bbox
        self._positions = getattr(self, "_positions", {})
        self._positions[target_idx] = bbox

    def mark_lost(self, track_id: int) -> None:
        target_idx = self._track_to_target.pop(track_id, None)
        if target_idx is not None:
            last = getattr(self, "_positions", {}).get(target_idx, getattr(self, "_last_bbox", (0, 0, 0, 0)))
            self._lost_targets[target_idx] = last

    def match_new_track(self, embedding: np.ndarray, bbox: tuple[int, int, int, int],
                        track_id: int, frame_diag: Optional[float] = None) -> Optional[int]:
        """Si el nuevo track se parece a un target perdido (y está cerca), lo re-asocia."""
        best_target, best_sim = None, self.similarity_threshold
        for target_idx, last_bbox in self._lost_targets.items():
            if frame_diag:
                cx1, cy1 = _center(last_bbox)
                cx2, cy2 = _center(bbox)
                dist = ((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2) ** 0.5
                if dist > frame_diag * self.max_center_dist_ratio:
                    continue
            sim = float(np.dot(self._embeddings[target_idx], embedding))
            if sim > best_sim:
                best_target, best_sim = target_idx, sim
        if best_target is not None:
            self.bind(best_target, track_id, bbox)
            self.reassociations += 1
        return best_target
```

- [ ] **Step 4: Verificar que pasan**

Run: `cd backend && python -m pytest tests/test_reid.py -v`
Expected: PASS

- [ ] **Step 5: Limpieza de estado interno**

Revisar que `TargetMatcher` no acumule atributos ad-hoc (`_last_bbox`, `_positions`): consolidar en un único `self._positions: dict[int, tuple]` inicializado en `__init__`, actualizado por `bind`/`update_last_bbox`. Re-correr los tests.

---

## Fase 4 — Backend: refactor de processors + tracking nuevo

### Task 4: Dividir `_processors.py` en paquete `processors/`

**Files:**
- Create: `backend/routers/services/processors/__init__.py`
- Create: `backend/routers/services/processors/zone_counting.py`
- Create: `backend/routers/services/processors/tracking.py`
- Create: `backend/routers/services/processors/ppe_detection.py`
- Create: `backend/routers/services/processors/traffic.py`
- Create: `backend/routers/services/processors/quality_control.py`
- Delete: `backend/routers/services/_processors.py`
- Modify: `backend/routers/services/_pipeline.py:20` (import)

- [ ] **Step 1: Mover código sin cambios funcionales**

Movimiento mecánico: cada `process_*` va a su módulo homónimo con sus imports y constantes (`_PPE_VIOLATION_CLASSES` → `ppe_detection.py`, `_VEHICLE_CLASSES` → `traffic.py`). El docstring de cabecera de `_processors.py` va a `__init__.py`.

`backend/routers/services/processors/__init__.py`:

```python
"""
Service-specific frame processors.
Each function takes (frames, model, config) and returns (annotated_frames, metrics).
"""
from routers.services.processors.zone_counting import process_zone_counting
from routers.services.processors.tracking import process_tracking
from routers.services.processors.ppe_detection import process_ppe_detection
from routers.services.processors.traffic import process_traffic
from routers.services.processors.quality_control import process_quality_control

_PROCESSOR_MAP = {
    "zone_counting": process_zone_counting,
    "tracking": process_tracking,
    "ppe_detection": process_ppe_detection,
    "traffic": process_traffic,
    "quality_control": process_quality_control,
}


def get_processor(service: str):
    fn = _PROCESSOR_MAP.get(service)
    if fn is None:
        raise ValueError(f"No processor for service '{service}'")
    return fn
```

En `_pipeline.py` cambiar:
```python
from routers.services._processors import get_processor
```
por:
```python
from routers.services.processors import get_processor
```

Buscar otros imports de `_processors` con `grep -rn "_processors" backend/` y actualizarlos igual. Borrar `_processors.py` al final.

- [ ] **Step 2: Verificar que nada se rompió**

Run: `cd backend && python -m pytest tests/ -v`
Expected: PASS (suite completa, mismos resultados que antes del refactor)

### Task 5: `process_tracking` con targets + Re-ID

**Files:**
- Modify: `backend/routers/services/processors/tracking.py`
- Test: `backend/tests/test_tracking_targets.py`

- [ ] **Step 1: Escribir test que falla**

Create `backend/tests/test_tracking_targets.py`:

```python
import numpy as np

from routers.services.processors.tracking import process_tracking


class _FakeBoxes:
    def __init__(self, xyxy, conf, cls):
        self.xyxy, self.conf, self.cls = xyxy, conf, cls
        self.id = None


class _FakeResult:
    """Imita la interfaz mínima de ultralytics Results para sv.Detections.from_ultralytics."""
    def __init__(self, bboxes):
        self.names = {0: "person"}
        n = len(bboxes)
        self.boxes = _FakeBoxes(
            xyxy=np.array(bboxes, dtype=np.float32),
            conf=np.array([0.9] * n, dtype=np.float32),
            cls=np.array([0] * n, dtype=np.float32),
        )
        self.obb = None


class _FakeModel:
    """Un objeto rojo moviéndose de izquierda a derecha."""
    def __init__(self, n_frames):
        self._i = 0

    def __call__(self, frame, verbose=False):
        x = 10 + self._i * 5
        self._i += 1
        return [_FakeResult([[x, 20, x + 30, 80]])]


def _frames(n=8):
    frames = []
    for i in range(n):
        f = np.zeros((120, 200, 3), dtype=np.uint8)
        x = 10 + i * 5
        f[20:80, x:x + 30] = (0, 0, 255)
        frames.append(f)
    return frames


def test_tracking_with_targets_produces_per_target_metrics():
    config = {"targets": [{
        "frame_idx": 0,
        "bbox": {"x1": 10 / 200, "y1": 20 / 120, "x2": 40 / 200, "y2": 80 / 120},
        "name": "Jugador 1",
        "color": "#ff0000",
        "styles": ["ellipse", "label", "trace"],
    }]}
    annotated, metrics = process_tracking(_frames(), _FakeModel(8), config)
    assert len(annotated) == 8
    assert "targets" in metrics
    t = metrics["targets"][0]
    assert t["name"] == "Jugador 1"
    assert t["tracked_coverage"] > 0.5
    assert t["frames_visible"] > 4
    assert "distance_px" in t
    assert "reassociations" in metrics


def test_tracking_without_targets_keeps_legacy_behavior():
    annotated, metrics = process_tracking(_frames(), _FakeModel(8), {})
    assert len(annotated) == 8
    assert "unique_tracks" in metrics
    assert "targets" not in metrics
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && python -m pytest tests/test_tracking_targets.py -v`
Expected: el primer test FAIL (`KeyError: 'targets'` o similar); el segundo PASS (comportamiento actual).
Nota: si `sv.Detections.from_ultralytics` exige más atributos del fake, ampliar `_FakeResult` hasta que el test legacy pase — sin tocar código de producción todavía.

- [ ] **Step 3: Implementar el modo targets**

Reemplazar `backend/routers/services/processors/tracking.py` por:

```python
"""Multi-object tracking. Modo automático (todo) o modo targets (objetos
seleccionados por el usuario, con Re-ID por apariencia y estilos por target)."""
from __future__ import annotations

from typing import Any

import numpy as np
import supervision as sv

from routers.services._annotators import annotate_target, apply_spotlight, build_annotators
from routers.services._config import filter_detections, parse_targets, summarize_config
from routers.services._reid import TargetMatcher, appearance_embedding


def _iou(a: np.ndarray, b: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return float(inter / union) if union > 0 else 0.0


def process_tracking(frames: list[np.ndarray], model: Any, config: dict) -> tuple[list[np.ndarray], dict]:
    h, w = frames[0].shape[:2] if frames else (480, 640)
    targets = parse_targets(config, w, h)
    if targets:
        return _process_with_targets(frames, model, config, targets)
    return _process_legacy(frames, model, config)


def _process_legacy(frames, model, config):
    tracker = sv.ByteTrack()
    trace_annotator = sv.TraceAnnotator()
    label_annotator = sv.LabelAnnotator()
    box_annotator = sv.BoxAnnotator()

    all_track_ids: set[int] = set()
    max_simultaneous = 0
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        detections = tracker.update_with_detections(detections)

        if detections.tracker_id is not None:
            ids = set(detections.tracker_id.tolist())
            all_track_ids.update(ids)
            max_simultaneous = max(max_simultaneous, len(ids))

        scene = frame.copy()
        scene = box_annotator.annotate(scene=scene, detections=detections)
        scene = trace_annotator.annotate(scene=scene, detections=detections)
        scene = label_annotator.annotate(scene=scene, detections=detections)
        annotated.append(scene)

    metrics = {
        "unique_tracks": len(all_track_ids),
        "max_simultaneous": max_simultaneous,
        "frames_processed": len(frames),
        "config": summarize_config(config),
    }
    return annotated, metrics


def _process_with_targets(frames, model, config, targets):
    h, w = frames[0].shape[:2]
    frame_diag = float((w ** 2 + h ** 2) ** 0.5)
    tracker = sv.ByteTrack()
    matcher = TargetMatcher()
    annotators = [build_annotators(t) for t in targets]

    # Registrar embedding inicial de cada target desde su frame de selección
    for idx, target in enumerate(targets):
        ref_frame = frames[min(target["frame_idx"], len(frames) - 1)]
        matcher.register(idx, appearance_embedding(ref_frame, target["bbox"]))

    stats = [{"frames_visible": 0, "distance_px": 0.0, "last_center": None} for _ in targets]
    pending_init = {i: t["bbox"] for i, t in enumerate(targets)}
    active_tracks: set[int] = set()
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        detections = tracker.update_with_detections(detections)

        current_ids = set(detections.tracker_id.tolist()) if detections.tracker_id is not None else set()
        for lost_id in active_tracks - current_ids:
            matcher.mark_lost(lost_id)
        active_tracks = current_ids

        target_boxes: list[tuple[int, int, int, int]] = []
        scene = frame.copy()
        per_target_detections: dict[int, sv.Detections] = {}

        if detections.tracker_id is not None:
            for det_i, track_id in enumerate(detections.tracker_id.tolist()):
                bbox = tuple(int(v) for v in detections.xyxy[det_i])
                target_idx = matcher.target_for_track(int(track_id))

                # Asociación inicial por IoU con el bbox clicado
                if target_idx is None and pending_init:
                    for cand_idx, init_bbox in list(pending_init.items()):
                        if _iou(detections.xyxy[det_i], init_bbox) > 0.3:
                            matcher.bind(cand_idx, int(track_id), bbox)
                            pending_init.pop(cand_idx)
                            target_idx = cand_idx
                            break

                # Re-ID de tracks nuevos contra targets perdidos
                if target_idx is None:
                    emb = appearance_embedding(frame, bbox)
                    target_idx = matcher.match_new_track(emb, bbox, int(track_id), frame_diag)

                if target_idx is None:
                    continue

                matcher.update_embedding(target_idx, appearance_embedding(frame, bbox))
                matcher.update_last_bbox(target_idx, bbox)
                per_target_detections[target_idx] = detections[det_i:det_i + 1]
                target_boxes.append(bbox)

                s = stats[target_idx]
                cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
                if s["last_center"] is not None:
                    s["distance_px"] += float(((cx - s["last_center"][0]) ** 2 + (cy - s["last_center"][1]) ** 2) ** 0.5)
                s["last_center"] = (cx, cy)
                s["frames_visible"] += 1

        if target_boxes and any("spotlight" in t["styles"] for t in targets):
            scene = apply_spotlight(scene, target_boxes)
        for target_idx, dets in per_target_detections.items():
            scene = annotate_target(scene, dets, targets[target_idx], annotators[target_idx])
        annotated.append(scene)

    n = max(1, len(frames))
    fps_meta = {"frames_processed": len(frames), "config": summarize_config(config)}
    metrics = {
        **fps_meta,
        "reassociations": matcher.reassociations,
        "targets": [
            {
                "name": t["name"],
                "color": t["color"],
                "styles": t["styles"],
                "frames_visible": s["frames_visible"],
                "tracked_coverage": round(s["frames_visible"] / n, 3),
                "distance_px": round(s["distance_px"], 1),
            }
            for t, s in zip(targets, stats)
        ],
    }
    return annotated, metrics
```

- [ ] **Step 4: Verificar que pasan**

Run: `cd backend && python -m pytest tests/test_tracking_targets.py tests/test_pipeline_video.py -v`
Expected: PASS

---

## Fase 5 — Backend: endpoint de preview de detecciones + créditos

### Task 6: `POST /services/{slug}/detection-preview`

**Files:**
- Create: `backend/routers/services/_preview.py`
- Modify: `backend/routers/services/router.py` (nuevo endpoint)
- Test: `backend/tests/test_detection_preview.py`

- [ ] **Step 1: Escribir tests que fallan**

Create `backend/tests/test_detection_preview.py`:

```python
import numpy as np

from routers.services._preview import sample_detections


class _FakeBoxes:
    def __init__(self, xyxy, conf, cls):
        self.xyxy, self.conf, self.cls = xyxy, conf, cls
        self.id = None


class _FakeResult:
    def __init__(self):
        self.names = {0: "person"}
        self.boxes = _FakeBoxes(
            xyxy=np.array([[10, 20, 40, 80]], dtype=np.float32),
            conf=np.array([0.9], dtype=np.float32),
            cls=np.array([0], dtype=np.float32),
        )
        self.obb = None


class _FakeModel:
    def __call__(self, frame, verbose=False):
        return [_FakeResult()]


def test_sample_detections_returns_normalized_bboxes_and_crops():
    frames = [(0, np.zeros((120, 200, 3), dtype=np.uint8)) for _ in range(3)]
    out = sample_detections(frames, _FakeModel(), config={})
    assert len(out) == 3
    entry = out[0]
    assert entry["frame_idx"] == 0
    det = entry["detections"][0]
    assert det["class_name"] == "person"
    assert 0 <= det["bbox"]["x1"] < det["bbox"]["x2"] <= 1
    assert det["crop_b64"].startswith("/9j/") or len(det["crop_b64"]) > 0
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && python -m pytest tests/test_detection_preview.py -v`
Expected: FAIL con `ModuleNotFoundError`

- [ ] **Step 3: Implementar `_preview.py`**

Create `backend/routers/services/_preview.py`:

```python
"""Preview de detecciones: muestrea frames del video y devuelve detecciones
serializadas (bbox normalizado + crop en base64) para la selección de targets."""
from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np
import supervision as sv

from routers.services._config import filter_detections

DEFAULT_SAMPLE_FPS = 1.0
MAX_SAMPLED_FRAMES = 60
CROP_MAX_SIZE = 96


def sample_frames(path: str, sample_fps: float = DEFAULT_SAMPLE_FPS,
                  max_frames: int = MAX_SAMPLED_FRAMES) -> tuple[list[tuple[int, np.ndarray]], float]:
    """Devuelve [(frame_idx, frame)] muestreados y el fps del video."""
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(fps / sample_fps)))
    sampled: list[tuple[int, np.ndarray]] = []
    idx = 0
    while cap.isOpened() and len(sampled) < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            sampled.append((idx, frame))
        idx += 1
    cap.release()
    return sampled, fps


def _crop_b64(frame: np.ndarray, bbox: tuple[int, int, int, int]) -> str:
    x1, y1, x2, y2 = (max(0, int(v)) for v in bbox)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return ""
    h, w = crop.shape[:2]
    scale = CROP_MAX_SIZE / max(h, w)
    if scale < 1:
        crop = cv2.resize(crop, (max(1, int(w * scale)), max(1, int(h * scale))))
    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return base64.b64encode(buf).decode() if ok else ""


def sample_detections(frames: list[tuple[int, np.ndarray]], model: Any,
                      config: dict) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for frame_idx, frame in frames:
        h, w = frame.shape[:2]
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        entries = []
        for i in range(len(detections)):
            x1, y1, x2, y2 = (float(v) for v in detections.xyxy[i])
            class_id = int(detections.class_id[i]) if detections.class_id is not None else -1
            entries.append({
                "bbox": {"x1": x1 / w, "y1": y1 / h, "x2": x2 / w, "y2": y2 / h},
                "class_name": (result.names or {}).get(class_id, "object"),
                "confidence": float(detections.confidence[i]) if detections.confidence is not None else 0.0,
                "crop_b64": _crop_b64(frame, (int(x1), int(y1), int(x2), int(y2))),
            })
        out.append({"frame_idx": frame_idx, "detections": entries})
    return out
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd backend && python -m pytest tests/test_detection_preview.py -v`
Expected: PASS

- [ ] **Step 5: Añadir el endpoint en `router.py`**

Añadir después de `ProcessResponse` (`backend/routers/services/router.py:53`):

```python
class DetectionPreviewRequest(BaseModel):
    job_id: str
    sample_fps: float = 1.0
    confidence: Optional[float] = None
    class_filter: Optional[list[str]] = None


class DetectionPreviewResponse(BaseModel):
    job_id: str
    fps: float
    frames: list[dict[str, Any]]
```

Y al final del archivo:

```python
@router.post("/{slug}/detection-preview", response_model=DetectionPreviewResponse)
async def detection_preview(
    slug: str,
    body: DetectionPreviewRequest,
    user: dict = Depends(get_current_user),
):
    service = _resolve_slug(slug)
    if service != "tracking":
        raise HTTPException(status_code=400, detail="detection-preview only supports 'tracking'")

    supabase = get_supabase()
    result = (
        supabase.table("jobs").select("*")
        .eq("id", body.job_id).eq("user_id", user["user_id"])
        .single().execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    if result.data["status"] != "estimating":
        raise HTTPException(status_code=409, detail="Job already processed")

    from core.models import get_model
    from routers.services._preview import sample_detections, sample_frames

    sampled, fps = sample_frames(result.data["input_url"], body.sample_fps)
    if not sampled:
        raise HTTPException(status_code=422, detail="No frames decoded from input video")

    config = {"confidence": body.confidence, "class_filter": body.class_filter}
    frames = sample_detections(sampled, get_model(service), config)
    return DetectionPreviewResponse(job_id=body.job_id, fps=fps, frames=frames)
```

- [ ] **Step 6: Verificación manual del endpoint**

Run: `cd backend && python -c "from routers.services.router import router; print('ok')"`
Expected: `ok` (sin errores de import). Verificación end-to-end queda en el checklist de UI de la Fase 6.

### Task 7: Recargo de créditos por Re-ID

**Files:**
- Modify: `backend/core/credits.py` (constante + helper)
- Modify: `backend/routers/services/router.py:176-183` (aplicar multiplicador en `process`)
- Test: `backend/tests/test_credits_reid.py`

- [ ] **Step 1: Escribir test que falla**

Create `backend/tests/test_credits_reid.py`:

```python
from core.credits import REID_COST_MULTIPLIER, apply_reid_multiplier


def test_multiplier_applied_only_with_targets():
    assert apply_reid_multiplier(100, has_targets=False) == 100
    assert apply_reid_multiplier(100, has_targets=True) == int(round(100 * REID_COST_MULTIPLIER))
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && python -m pytest tests/test_credits_reid.py -v`
Expected: FAIL con ImportError

- [ ] **Step 3: Implementar**

Añadir en `backend/core/credits.py`:

```python
# Recargo por Re-ID de apariencia en tracking interactivo.
# Ajustar tras medir costos reales de cómputo en Modal.
REID_COST_MULTIPLIER = 1.3


def apply_reid_multiplier(credits: int, has_targets: bool) -> int:
    if not has_targets:
        return credits
    return int(round(credits * REID_COST_MULTIPLIER))
```

En `router.py`, dentro de `process` después de calcular `credits_estimated` (línea ~178):

```python
    has_targets = bool((body.processing_config or {}).get("targets"))
    credits_estimated = apply_reid_multiplier(credits_estimated, has_targets)
```

(e importar `apply_reid_multiplier` junto a los imports de `core.credits` existentes).

Además, validar los targets temprano para devolver 422 (la spec lo exige) en vez de fallar en background. En `process`, antes de `reserve_credits`:

```python
    if has_targets:
        from routers.services._config import parse_targets
        cfg = body.processing_config or {}
        try:
            parse_targets(cfg, int(cfg.get("frame_width") or 1920), int(cfg.get("frame_height") or 1080))
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
```

- [ ] **Step 4: Verificar**

Run: `cd backend && python -m pytest tests/ -v`
Expected: PASS (suite completa)

---

## Fase 6 — Frontend: selección de targets

### Task 8: Tipos y cliente API

**Files:**
- Modify: `frontend/lib/processing-config.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Tipos en `processing-config.ts`**

Añadir tras `RoiConfig`:

```typescript
export type TargetStyle =
  | 'box'
  | 'ellipse'
  | 'triangle'
  | 'halo'
  | 'color'
  | 'trace'
  | 'spotlight'
  | 'label'

export type TrackingTarget = {
  id: string
  frame_idx: number
  bbox: { x1: number; y1: number; x2: number; y2: number }
  name: string
  color: string
  styles: TargetStyle[]
  cropB64?: string
}

export const MAX_TRACKING_TARGETS = 5
```

Y en `ProcessingConfig` añadir el campo:

```typescript
  targets?: TrackingTarget[]
```

(El backend ignora `id` y `cropB64`; se envían tal cual sin problema, pero para mantener el payload limpio, `useServiceWorkflow` los eliminará antes de enviar — ver Task 10.)

- [ ] **Step 2: Cliente API en `api.ts`**

Añadir tipos junto a `PreviewResult`:

```typescript
export type DetectionPreviewEntry = {
  bbox: { x1: number; y1: number; x2: number; y2: number }
  class_name: string
  confidence: number
  crop_b64: string
}

export type DetectionPreviewFrame = {
  frame_idx: number
  detections: DetectionPreviewEntry[]
}

export type DetectionPreviewResult = {
  job_id: string
  fps: number
  frames: DetectionPreviewFrame[]
}
```

Y la función en la sección Services:

```typescript
export function getDetectionPreview(
  slug: string,
  body: { job_id: string; sample_fps?: number; confidence?: number },
  token: string
): Promise<DetectionPreviewResult> {
  return apiFetch<DetectionPreviewResult>(
    `/services/${slug}/detection-preview`,
    { method: 'POST', body: JSON.stringify(body) },
    token
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 errores

### Task 9: Componentes `TargetSelectionView`, `DetectionOverlay`, `TargetPanel`

**Files:**
- Create: `frontend/app/services/[slug]/_components/TargetSelectionView.tsx`
- Create: `frontend/app/services/[slug]/_components/DetectionOverlay.tsx`
- Create: `frontend/app/services/[slug]/_components/TargetPanel.tsx`
- Modify: `docs/components-registry.md` (registrar los 3)

Antes de empezar: leer `frontend/node_modules/next/dist/docs/` (guía de componentes cliente) y revisar `VideoReviewPlayer.tsx` para reutilizar su API de reproducción/seek. Todos los archivos ≤ 200 líneas; sin ternarios anidados; Tailwind only.

- [ ] **Step 1: `DetectionOverlay.tsx`**

Overlay SVG absoluto sobre el player. Recibe las detecciones del frame muestreado más cercano al tiempo actual y los targets ya seleccionados:

```tsx
'use client'

import type { DetectionPreviewEntry } from '@/lib/api'
import type { TrackingTarget } from '@/lib/processing-config'

interface Props {
  detections: DetectionPreviewEntry[]
  targets: TrackingTarget[]
  frameIdx: number
  onToggle: (detection: DetectionPreviewEntry, frameIdx: number) => void
}

function isSelected(det: DetectionPreviewEntry, targets: TrackingTarget[]): boolean {
  return targets.some(
    (t) =>
      Math.abs(t.bbox.x1 - det.bbox.x1) < 0.02 && Math.abs(t.bbox.y1 - det.bbox.y1) < 0.02
  )
}

export function DetectionOverlay({ detections, targets, frameIdx, onToggle }: Props) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      role="listbox"
      aria-label="Objetos detectados"
    >
      {detections.map((det, i) => {
        const selected = isSelected(det, targets)
        const stroke = selected ? '#00ffcc' : 'rgba(255,255,255,0.6)'
        return (
          <rect
            key={`${frameIdx}-${i}`}
            x={det.bbox.x1}
            y={det.bbox.y1}
            width={det.bbox.x2 - det.bbox.x1}
            height={det.bbox.y2 - det.bbox.y1}
            fill={selected ? 'rgba(0,255,204,0.15)' : 'transparent'}
            stroke={stroke}
            strokeWidth={selected ? 0.006 : 0.003}
            strokeDasharray={selected ? undefined : '0.01 0.006'}
            className="cursor-pointer"
            role="option"
            aria-selected={selected}
            onClick={() => onToggle(det, frameIdx)}
          />
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 2: `TargetPanel.tsx`**

Panel lateral: lista de targets con thumbnail (`cropB64`), input de nombre inline, `<input type="color">`, chips de estilos toggleables y botón eliminar. Estilos disponibles con etiquetas en español:

```tsx
'use client'

import { MAX_TRACKING_TARGETS, type TargetStyle, type TrackingTarget } from '@/lib/processing-config'

const STYLE_LABELS: Record<TargetStyle, string> = {
  box: 'Caja',
  ellipse: 'Elipse',
  triangle: 'Flecha',
  halo: 'Halo',
  color: 'Tinte',
  trace: 'Estela',
  spotlight: 'Foco',
  label: 'Etiqueta',
}

interface Props {
  targets: TrackingTarget[]
  onUpdate: (id: string, patch: Partial<TrackingTarget>) => void
  onRemove: (id: string) => void
}

function toggleStyle(styles: TargetStyle[], style: TargetStyle): TargetStyle[] {
  if (styles.includes(style)) return styles.filter((s) => s !== style)
  return [...styles, style]
}

export function TargetPanel({ targets, onUpdate, onRemove }: Props) {
  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Haz clic sobre un objeto del video para seguirlo. Máximo {MAX_TRACKING_TARGETS}.
      </p>
    )
  }
  return (
    <ul className="space-y-3" aria-label="Objetos seleccionados">
      {targets.map((target) => (
        <li key={target.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2">
            {target.cropB64 && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`data:image/jpeg;base64,${target.cropB64}`}
                alt={target.name}
                className="h-10 w-10 rounded object-cover"
              />
            )}
            <input
              value={target.name}
              onChange={(e) => onUpdate(target.id, { name: e.target.value })}
              className="flex-1 rounded border bg-background px-2 py-1 text-sm"
              aria-label="Nombre del objeto"
              maxLength={40}
            />
            <input
              type="color"
              value={target.color}
              onChange={(e) => onUpdate(target.id, { color: e.target.value })}
              className="h-8 w-8 cursor-pointer rounded"
              aria-label="Color del resaltado"
            />
            <button
              onClick={() => onRemove(target.id)}
              className="text-sm text-destructive hover:underline"
              aria-label={`Quitar ${target.name}`}
            >
              Quitar
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(STYLE_LABELS) as TargetStyle[]).map((style) => {
              const active = target.styles.includes(style)
              const base = 'rounded-full border px-2 py-0.5 text-xs transition-colors'
              const cls = active
                ? `${base} border-primary bg-primary/15 text-primary`
                : `${base} text-muted-foreground hover:border-primary/50`
              return (
                <button
                  key={style}
                  className={cls}
                  aria-pressed={active}
                  onClick={() => onUpdate(target.id, { styles: toggleStyle(target.styles, style) })}
                >
                  {STYLE_LABELS[style]}
                </button>
              )
            })}
          </div>
        </li>
      ))}
      {targets.length >= MAX_TRACKING_TARGETS && (
        <p className="text-xs text-amber-500">Límite de {MAX_TRACKING_TARGETS} objetos alcanzado.</p>
      )}
    </ul>
  )
}
```

- [ ] **Step 3: `TargetSelectionView.tsx`**

Orquesta: carga `getDetectionPreview` al montar (estado loading/error con opción de bajar confianza y reintentar), muestra `VideoReviewPlayer` con `DetectionOverlay` posicionado encima (contenedor `relative`), mapea el tiempo actual del player al frame muestreado más cercano (`Math.round(currentTimeSec * fps)` vs `frame_idx` disponible), y `TargetPanel` al costado (layout `grid lg:grid-cols-[2fr,1fr]`). Botones "Volver" y "Continuar" (deshabilitado sin targets... permitir continuar sin targets = modo automático, con texto que lo aclare).

Comportamiento de `onToggle`: si la detección ya está seleccionada → quitar; si no y hay < 5 → añadir `{ id: crypto.randomUUID(), frame_idx, bbox, name: class_name + ' ' + (n+1), color: paleta rotativa ['#00ffcc','#ff3366','#ffd700','#3399ff','#aaff44'], styles: ['ellipse','label'], cropB64: crop_b64 }`.

Si el archivo supera 200 líneas, extraer el hook de datos a `useDetectionPreview.ts` en la misma carpeta.

- [ ] **Step 4: Verificar TypeScript y registrar componentes**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 errores.
Añadir entradas para `TargetSelectionView`, `DetectionOverlay` y `TargetPanel` en `docs/components-registry.md` siguiendo el formato existente del archivo.

### Task 10: Integrar etapa `selecting` en el workflow

**Files:**
- Modify: `frontend/app/services/[slug]/_components/ServiceStagePanel.tsx` (nuevo stage + render)
- Modify: `frontend/app/services/[slug]/_components/useServiceWorkflow.ts`
- Modify: `frontend/app/services/[slug]/_components/ServiceStageRail.tsx` (mostrar la etapa)
- Modify: `frontend/app/services/[slug]/_components/ConfirmModal.tsx` (desglose de recargo)

- [ ] **Step 1: Añadir el stage**

En `ServiceStagePanel.tsx` ampliar el union type:

```typescript
export type ServiceStage =
  | 'idle'
  | 'estimating'
  | 'reviewing'
  | 'selecting'   // selección de targets (solo tracking)
  | 'configuring'
  | 'confirming'
  | 'processing'
  | 'done'
  | 'failed'
```

Y renderizar `TargetSelectionView` cuando `stage === 'selecting'`, pasando `jobId`, `token`, `reviewSource`, targets actuales y callbacks.

- [ ] **Step 2: Flujo en `useServiceWorkflow.ts`**

- Estado nuevo: `const [targets, setTargets] = useState<TrackingTarget[]>([])`.
- `handleReviewed` (línea 177): si `service.apiSlug === 'tracking'`, ir a `'selecting'` en vez de `'configuring'` (con `updateUrl('selecting', ...)`).
- Nuevos handlers: `handleTargetsSelected(next: TrackingTarget[])` → guarda targets, pasa a `'configuring'`; `handleBackToSelection()` → vuelve a `'selecting'`.
- En `handleConfirm`, antes de llamar `processService`, inyectar targets sin campos de UI:

```typescript
const apiTargets = targets.map(({ id: _id, cropB64: _crop, ...rest }) => rest)
const configWithTargets = targets.length > 0 && processingConfig
  ? { ...processingConfig, targets: apiTargets }
  : processingConfig
```

- En `restoreJob`, tratar `queryStage === 'selecting'` como `'reviewing'` (las detecciones de preview no se persisten; el usuario re-selecciona).
- `reset()` limpia `targets`.

- [ ] **Step 3: ConfirmModal y rail**

- `ConfirmModal.tsx`: si hay targets, mostrar línea extra: «Seguimiento personalizado de N objeto(s) — recargo Re-ID ×1.3» y el total ajustado (`Math.round(credits * 1.3)`); usar formatters globales de `frontend/src/lib/formatters.ts` para los números.
- `ServiceStageRail.tsx`: añadir la etapa «Selección» entre Revisión y Configuración, visible solo para tracking.

- [ ] **Step 4: Verificar TypeScript**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 errores

- [ ] **Step 5: Checklist de verificación manual (UI)**

Con `make dev` corriendo:

1. **Ruta:** `/services/tracking` → subir un video con personas (p. ej. `backend/temp/uploads/*.mp4` existentes).
2. **Acción:** completar la revisión de segmento → debe aparecer la etapa «Selección» con el video y cajas punteadas sobre los objetos detectados.
3. **Acción:** clicar 2 objetos → aparecen en el panel lateral con thumbnail; renombrar uno a "Jugador 10", cambiar color, activar Elipse + Estela + Etiqueta.
4. **Acción:** intentar seleccionar 6 objetos → al 6º no permite y muestra aviso de límite.
5. **Acción:** continuar → configurar → en el modal de confirmación se ve el recargo ×1.3 → confirmar.
6. **Resultado esperado:** video resultante con elipse/estela/etiqueta del color elegido SOLO sobre los objetos seleccionados; nombre personalizado visible; métricas muestran `targets[]` con `tracked_coverage`.
7. **Edge cases:** continuar sin seleccionar nada → procesa en modo automático (comportamiento anterior); video sin detecciones → mensaje claro con opción de bajar confianza; recargar la página en etapa `selecting` → vuelve a `reviewing` sin romper.

### Task 11: Métricas por target en ResultView

**Files:**
- Modify: `frontend/app/services/[slug]/_components/ResultView.tsx` (o `PreviewMetricsPanel.tsx`, donde se rendericen las métricas del job)

- [ ] **Step 1: Render de `metrics.targets`**

Si `metrics.targets` existe, renderizar una tarjeta por target: swatch de color, nombre, `tracked_coverage` como porcentaje (usar formatters globales), `frames_visible` y `distance_px`. Si `tracked_coverage < 0.6`, mostrar badge de advertencia «Seguimiento parcial». Si el archivo se acerca a 200 líneas, extraer `TargetMetricsCard.tsx` en `_components/` y registrarlo en el registry.

- [ ] **Step 2: Verificación**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 errores. Verificación visual incluida en el checklist del Task 10 (punto 6).

---

## Fase 7 — Cierre

### Task 12: Suite completa y documentación

- [ ] **Step 1: Suite backend completa**

Run: `cd backend && python -m pytest tests/ -v`
Expected: PASS total

- [ ] **Step 2: TypeScript limpio**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 errores

- [ ] **Step 3: Documentación**

- Verificar que `docs/components-registry.md` incluye los componentes nuevos (Tasks 9 y 11).
- Marcar la spec como implementada (`Estado: Implementado`).
- No hay cambios de BD en este plan (los targets viajan en `processing_config`, columna JSON existente de `jobs`) — no se toca `DB_SCHEMA_LIVE.md`.
