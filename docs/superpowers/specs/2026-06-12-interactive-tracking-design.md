# Spec: Tracking interactivo de objetos

**Fecha:** 2026-06-12
**Servicio afectado:** `tracking` (mejora del servicio existente, no es un servicio nuevo)
**Estado:** Implementado (backend + frontend; 44 tests backend en verde, TypeScript sin errores)

## Objetivo

Permitir al usuario seleccionar hasta 5 objetos específicos en un video (p. ej. un jugador en un partido de fútbol), seguirlos durante todo el video con robustez ante oclusiones (Re-ID por apariencia), y personalizar por objeto: nombre, color y estilos de resaltado combinables.

## Decisiones tomadas

| Decisión | Elección |
|---|---|
| Alcance | Mejorar el servicio `tracking` existente |
| Selección | Híbrido: clic sobre el video + panel lateral de gestión |
| Robustez | Re-ID por apariencia (embedding + re-asociación automática) |
| Multi-objeto | Hasta 5 objetos simultáneos |
| Estilos | Todos combinables: ellipse, triangle, halo (aprox. glow), color overlay, trace, spotlight, label con nombre editable |
| Créditos | Costo base + `REID_COST_MULTIPLIER = 1.3` (constante ajustable tras medir costos reales en Modal); preview con costo fijo pequeño |
| Modo legado | Sin targets seleccionados, el servicio sigue todo (comportamiento actual = modo "automático") |

## Arquitectura: dos pasadas

1. **Pasada de preview** — `POST /services/tracking/preview`: muestrea frames (default 1 fps), corre YOLO y devuelve detecciones serializadas por frame: `{frame_idx, bbox, class_name, confidence, crop_b64}`.
2. **Selección en frontend** — el usuario navega el video, clica objetos sobre un overlay, y configura nombre/color/estilos en el panel lateral.
3. **Pasada completa** — `POST /services/tracking/process` con `targets[]: {frame_idx, bbox, name, color, styles[]}`. ByteTrack + Re-ID; renderiza solo los anotadores elegidos por objeto; devuelve video anotado + métricas por objeto.

## Backend

- **`routers/services/_preview.py` (nuevo):** muestreo + detección + serialización de preview.
- **`routers/services/_reid.py` (nuevo):** embedding de apariencia por target (histograma HSV + features del backbone YOLO, sin modelos adicionales pesados). Matcher con similitud coseno + gating espacial: cuando ByteTrack pierde un target y aparece un track ID nuevo, intenta re-asociar.
- **`routers/services/_annotators.py` (nuevo):** factory `styles[] → list[sv.Annotator]`. Spotlight = oscurecer el frame fuera de los bboxes de targets. Halo = glow elíptico sobre bbox si no hay máscaras de segmentación.
- **Refactor:** dividir `_processors.py` (322 líneas) en `routers/services/processors/` con un módulo por servicio. La factory de anotadores es compartida (base para mejorar los demás servicios).
- **Validación:** máx. 5 targets; bbox dentro de los límites del frame; estilos dentro del enum permitido.

## Frontend

- **`TargetSelectionView`** (nueva etapa del workflow entre preview y confirmación): reutiliza `VideoReviewPlayer` + overlay SVG con detecciones del frame actual (cajas tenues, hover, clic = seleccionar/deseleccionar).
- **`TargetPanel`** (lateral): lista de targets con thumbnail, nombre editable inline, selector de color, chips de estilos combinables, botón eliminar. Aviso al alcanzar el límite de 5.
- Estado en el store del workflow (Zustand); etapa activa persistida en query param. Los targets viven en memoria.
- Se reutiliza `ConfirmModal` antes de procesar (acción que gasta créditos).
- Todos los archivos de render ≤ 200 líneas; sub-componentes co-locados en `_components/`.
- Registrar componentes nuevos reutilizables en `docs/components-registry.md`.

## Métricas de salida

Por objeto: `tracked_coverage` (% de frames seguido), tiempo en pantalla, distancia recorrida en píxeles. Globales: frames procesados, re-asociaciones realizadas.

## Manejo de errores

- Target perdido sin re-identificar: el procesamiento continúa; `tracked_coverage` lo refleja y la UI lo señala por objeto.
- Preview sin detecciones: mensaje claro + opción de bajar umbral de confianza.
- Errores de validación → 422 con detalle por campo.

## Testing

- Backend: unit tests del matcher Re-ID (re-asociación tras oclusión simulada), de la factory de anotadores, y del endpoint preview (patrón de `test_pipeline_video.py`).
- Frontend: `tsc` sin errores + checklist de verificación manual por paso del plan.

## Fuera de alcance

- Re-ID con modelos dedicados (OSNet, etc.) — evaluar después si el approach ligero no basta en fútbol real.
- Corrección manual de tracks a mitad de video.
- Cambios de precios definitivos (se calibran tras medir costos en Modal).
