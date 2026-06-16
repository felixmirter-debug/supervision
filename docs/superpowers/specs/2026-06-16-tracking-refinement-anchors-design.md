# Spec: Refinamiento de tracking con anclas multi-frame (estilo SAM 3)

**Fecha:** 2026-06-16
**Servicio afectado:** `tracking` (extensión del tracking interactivo existente)
**Estado:** Aprobado (diseño). Pendiente de plan de implementación.
**Relacionado:** [`2026-06-12-interactive-tracking-design.md`](2026-06-12-interactive-tracking-design.md)

## Objetivo

Permitir al usuario **afinar** el seguimiento de un objeto volviendo a seleccionarlo en
frames posteriores (como en SAM 3). Cada re-selección agrega un **ancla** al mismo target,
que el backend usa para corregir saltos de identidad (re-bind duro) y enriquecer el modelo
de apariencia (multi-vista), mejorando la robustez del Re-ID a lo largo del video.

## Motivación

El tracking pierde o confunde objetos ante oclusiones largas, cambios de pose/iluminación o
jugadores del mismo equipo (descriptor de apariencia por histograma HSV). Las mejoras de
robustez ya aplicadas (detector `yolov8m`, ByteTrack endurecido, hold-through-gaps) reducen
el problema pero no permiten **corrección dirigida por el usuario**. Las anclas dan ese control.

## Decisiones

| Decisión | Elección |
|---|---|
| Alcance | Anclas multi-frame: re-bind de identidad **+** refresco de apariencia en cada ancla |
| Corrección manual de box (redibujar a mano) | Fuera de alcance (se ancla a la detección más cercana al clic) |
| Máx. anclas por target | 5 |
| Retrocompatibilidad | `parse_targets` acepta el formato legacy `{frame_idx, bbox}` además de `{anchors}` |
| Índice de frame | Las anclas usan frame **absoluto** del video; el backend lo convierte a índice local al segmento usando el fps real |
| Persistencia | Las anclas viajan en `processing_config.targets[].anchors` (columna JSON existente). Sin migración de BD |

## Modelo de datos

**Frontend (`processing-config.ts`):**

```ts
export type TargetAnchor = { frame_idx: number; bbox: { x1: number; y1: number; x2: number; y2: number } }

export type TrackingTarget = {
  id: string
  anchors: TargetAnchor[]   // >= 1; la primera es el clic inicial
  name: string
  color: string
  styles: TargetStyle[]
  cropB64?: string          // thumbnail de la primera ancla
}
```

`bbox` normalizado (0..1) como hoy. `frame_idx` absoluto respecto al video completo.

**Backend (`parse_targets`):** cada target devuelve:

```python
{
  "anchors": [ {"frame_idx": int, "bbox": (x1,y1,x2,y2)_px}, ... ],  # ordenadas por frame_idx
  "frame_idx": int,   # = anchors[0].frame_idx  (compat con código existente)
  "bbox": tuple,       # = anchors[0].bbox       (compat)
  "name": str, "color": str, "styles": list,
}
```

Validación: mismas reglas actuales por bbox; `len(anchors) <= 5` o `ValueError("anchors")`;
acepta `{frame_idx, bbox}` legacy creando `anchors=[{...}]`.

## Comportamiento del backend (`_process_with_targets`)

1. **Mapeo de frame absoluto → local.** El pipeline conoce el fps y el `start_sec` del segmento.
   Se expone el offset al processor para convertir `anchor.frame_idx_absoluto → idx_local =
   frame_idx - round(start_sec * fps)`, clampeado a `[0, len(frames)-1]`. Esto **también corrige**
   el bug actual donde `frame_idx` se usaba como índice directo con segmentos recortados.
2. **Embedding inicial** desde la primera ancla (como hoy, pero con índice local correcto).
3. **Mapa `anchors_by_local_frame`**: `{idx_local: [(target_idx, bbox), ...]}`.
4. En cada frame `i` que tenga anclas: para cada `(target_idx, anchor_bbox)`, elegir la detección
   con mayor IoU al `anchor_bbox` (umbral > 0.3); si existe, `matcher.bind(target_idx, track_id,
   bbox)` (override de identidad) y `matcher.update_embedding(target_idx, emb_de_esa_vista)`;
   resetear `missed`/`last_bbox`. Si no hay detección que solape, se mantiene el estado previo.
5. El resto (Re-ID, hold-through-gaps, anotación con ID estable por target, métricas) sin cambios.

**Mecanismo de offset (decisión de implementación, se concreta en el plan):** pasar el offset y
fps al processor sin romper la firma `(frames, model, config)` — p. ej. inyectando
`config["analysis_segment"]` (ya presente) + fps vía un parámetro opcional del pipeline, o
precomputando los índices locales en el pipeline. Se elige la opción menos invasiva en el plan.

## Comportamiento del frontend

- **`TargetPanel`:** cada target muestra la lista de sus anclas con timestamp (`frame_idx / fps`),
  un botón **"Refinar"** que activa el modo refinamiento para ese target, y permite **quitar** un
  ancla. Quitar la última ancla = quitar el target.
- **`TargetSelectionView`:** estado `refiningTargetId`. Si está activo, un clic sobre una detección
  **agrega un ancla** a ese target (en el frame actual) en vez de crear un target nuevo; si no, el
  clic crea/quita target como hoy. El modo se desactiva al elegir otro target, al quitar el target
  o al pulsar "Listo".
- El overlay marca como seleccionadas las detecciones que coinciden con **cualquier** ancla del
  frame actual.

## Edge cases

- Clic sin detección bajo el cursor → se ancla a la detección más cercana (igual que selección inicial).
- Dos anclas en el mismo frame para el mismo target → se conserva la última.
- Ancla cuyo frame cae fuera del segmento recortado → se clampa al rango; se avisa en UI si queda fuera.
- Máx. 5 anclas: el botón "Refinar" se deshabilita al alcanzarlo.

## Fuera de alcance (YAGNI)

- Redibujar/ajustar el box a mano (sólo clic sobre detección).
- Interpolación densa entre anclas (la guía es por re-bind puntual + Re-ID existente).
- Propagación bidireccional tipo SAM de máscaras de segmentación.

## Verificación

- Backend: TDD para `parse_targets` (anclas, legacy, límite, orden) y `_process_with_targets`
  (re-bind en frame de ancla, mapeo absoluto→local).
- Frontend: `pnpm exec tsc --noEmit` limpio; checklist manual de refinamiento.
- Sin commits (regla del proyecto). Sin migración de BD.
