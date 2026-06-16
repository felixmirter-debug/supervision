"""Re-identificación por apariencia basada en histogramas HSV.

Proporciona embeddings de color y un matcher que reasocía tracks perdidos
con nuevos tracks usando similitud coseno y gating espacial.
"""
from __future__ import annotations

from typing import Optional

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Constantes públicas
# ---------------------------------------------------------------------------

SIMILARITY_THRESHOLD: float = 0.80
EMBEDDING_ALPHA: float = 0.3

# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

BBox = tuple[int, int, int, int]  # x1, y1, x2, y2


def appearance_embedding(frame: np.ndarray, bbox: BBox) -> np.ndarray:
    """Genera un embedding L2-normalizado de histograma HSV 8×8×8 del crop.

    Parámetros
    ----------
    frame:
        Imagen BGR uint8 (H×W×3).
    bbox:
        Coordenadas (x1, y1, x2, y2) del recorte.  Se clampean a ≥ 0.

    Retorna
    -------
    np.ndarray de forma (512,) float32, L2-normalizado.
    Devuelve zeros(512) si el crop es vacío.
    """
    x1, y1, x2, y2 = (max(0, int(v)) for v in bbox)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return np.zeros(512, dtype=np.float32)

    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist(
        [hsv], [0, 1, 2], None, [8, 8, 8], [0, 180, 0, 256, 0, 256]
    )
    flat = hist.flatten().astype(np.float32)
    norm = np.linalg.norm(flat)
    if norm < 1e-8:
        return np.zeros(512, dtype=np.float32)
    return flat / norm


# ---------------------------------------------------------------------------
# TargetMatcher
# ---------------------------------------------------------------------------


class TargetMatcher:
    """Asocia targets de negocio con track IDs de ByteTrack.

    Cuando un track se pierde y reaparece con un nuevo ID, ``match_new_track``
    busca entre los targets perdidos el que mejor coincida por apariencia,
    con gating espacial opcional.

    Parámetros
    ----------
    similarity_threshold:
        Umbral mínimo de similitud coseno para aceptar una reasociación.
    max_center_dist_ratio:
        Fracción máxima de la diagonal del frame permitida entre centros de
        bounding boxes.  Solo se aplica cuando se proporciona ``frame_diag``.
    """

    def __init__(
        self,
        similarity_threshold: float = SIMILARITY_THRESHOLD,
        max_center_dist_ratio: float = 0.5,
    ) -> None:
        self._similarity_threshold = similarity_threshold
        self._max_center_dist_ratio = max_center_dist_ratio

        # target_idx → embedding
        self._embeddings: dict[int, np.ndarray] = {}
        # track_id → target_idx
        self._track_to_target: dict[int, int] = {}
        # target_idx → track_id
        self._target_to_track: dict[int, int] = {}
        # target_idx → last seen bbox
        self._positions: dict[int, BBox] = {}
        # target_idx de targets sin track activo
        self._lost_targets: set[int] = set()

        self.reassociations: int = 0

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def register(self, target_idx: int, embedding: np.ndarray) -> None:
        """Registra un nuevo target con su embedding inicial."""
        self._embeddings[target_idx] = embedding.copy()

    def bind(self, target_idx: int, track_id: int, bbox: BBox) -> None:
        """Vincula un target con un track_id y actualiza su posición.

        Enforce 1:1 invariant:
        - If the target was previously bound to a different track, remove that
          stale track→target entry.
        - If the track was previously bound to a different target, remove that
          stale target→track entry.
        """
        # Evict old track bound to this target
        old_track = self._target_to_track.get(target_idx)
        if old_track is not None and old_track != track_id:
            self._track_to_target.pop(old_track, None)

        # Evict old target bound to this track
        old_target = self._track_to_target.get(track_id)
        if old_target is not None and old_target != target_idx:
            self._target_to_track.pop(old_target, None)

        self._track_to_target[track_id] = target_idx
        self._target_to_track[target_idx] = track_id
        self._positions[target_idx] = bbox
        self._lost_targets.discard(target_idx)

    def target_for_track(self, track_id: int) -> Optional[int]:
        """Retorna el target_idx vinculado al track_id, o None."""
        return self._track_to_target.get(track_id)

    def update_embedding(self, target_idx: int, embedding: np.ndarray) -> None:
        """Actualiza el embedding con blend exponencial (alpha=EMBEDDING_ALPHA)."""
        if target_idx not in self._embeddings:
            self._embeddings[target_idx] = embedding.copy()
            return
        blended = (
            (1 - EMBEDDING_ALPHA) * self._embeddings[target_idx]
            + EMBEDDING_ALPHA * embedding
        )
        norm = np.linalg.norm(blended)
        self._embeddings[target_idx] = blended / norm if norm > 1e-8 else blended

    def update_last_bbox(self, target_idx: int, bbox: BBox) -> None:
        """Actualiza la última posición conocida del target."""
        self._positions[target_idx] = bbox

    def mark_lost(self, track_id: int) -> None:
        """Desvincula el track_id; mueve su target al conjunto de perdidos."""
        target_idx = self._track_to_target.pop(track_id, None)
        if target_idx is None:
            return
        self._target_to_track.pop(target_idx, None)
        self._lost_targets.add(target_idx)

    def match_new_track(
        self,
        embedding: np.ndarray,
        bbox: BBox,
        track_id: int,
        frame_diag: Optional[float] = None,
    ) -> Optional[int]:
        """Busca entre los targets perdidos el más similar al embedding dado.

        Aplica gating espacial si se proporciona ``frame_diag``.  Si
        encuentra un candidato sobre el umbral, lo vincula con ``track_id``
        e incrementa ``self.reassociations``.

        Retorna
        -------
        target_idx del match o None si no hay candidato válido.
        """
        best_idx: Optional[int] = None
        best_sim: float = self._similarity_threshold - 1e-9  # por debajo del umbral

        cx, cy = _center(bbox)
        max_dist = (
            frame_diag * self._max_center_dist_ratio
            if frame_diag is not None
            else None
        )

        for target_idx in self._lost_targets:
            # Gating espacial
            if max_dist is not None and target_idx in self._positions:
                lx, ly = _center(self._positions[target_idx])
                dist = ((cx - lx) ** 2 + (cy - ly) ** 2) ** 0.5
                if dist > max_dist:
                    continue

            # Similitud coseno (embeddings ya normalizados)
            ref = self._embeddings.get(target_idx)
            if ref is None:
                continue
            sim = float(np.dot(embedding, ref))
            if sim > best_sim:
                best_sim = sim
                best_idx = target_idx

        if best_idx is not None and best_sim >= self._similarity_threshold:
            self.bind(best_idx, track_id, bbox)
            self.reassociations += 1
            return best_idx
        return None


# ---------------------------------------------------------------------------
# Helpers privados
# ---------------------------------------------------------------------------


def _center(bbox: BBox) -> tuple[float, float]:
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0
