# Components Registry

## ThemeToggle

- Path: `frontend/components/theme-toggle.tsx`
- Purpose: Compact visual-theme selector for the product shell and standalone auth screens.
- Variants: blue, red, yellow accents in both light and dark color modes.
- Notes: Persists accent and color mode in `localStorage`; applies root `data-accent-theme`, `data-color-mode`, and `.dark`.

## VisionPreview

- Path: `frontend/components/vision-preview.tsx`
- Purpose: Reusable computer-vision product visual for hero and auth surfaces.
- Notes: Uses theme tokens and code-rendered detection overlays so it follows all accent themes.

## TargetSelectionView

- Path: `frontend/app/services/[slug]/_components/TargetSelectionView.tsx`
- Purpose: Orquesta la etapa `selecting` del servicio tracking — reproduce el video, superpone las detecciones y gestiona los targets seleccionados.
- Notes: Carga `getDetectionPreview` vía `useDetectionPreview`; mapea el tiempo del player al frame muestreado más cercano; permite continuar sin targets (modo automático). Soporta **anclas de refinamiento** (estilo SAM 3): con un target en modo "Refinar", clicar el mismo objeto en un frame posterior añade un ancla a ese target. Convierte el frame absoluto a índice local al segmento antes de guardar. Específico de tracking.

## SelectionPlayer

- Path: `frontend/app/services/[slug]/_components/SelectionPlayer.tsx`
- Purpose: Reproductor de la etapa de selección de tracking con controles propios (play/pausa, ±5s, barra de tiempo) y el `DetectionOverlay` encima — sólo activo al pausar.
- Notes: Al pausar/seek llama `onFrameSettled(atSec)` para que el padre pida detección **de ese frame exacto** (`detection-at`); muestra "Detectando…" mientras carga. Controles propios (no `controls` nativos) para que el overlay no bloquee el play. Específico de tracking.

## DetectionOverlay

- Path: `frontend/app/services/[slug]/_components/DetectionOverlay.tsx`
- Purpose: Overlay SVG (viewBox 0..1) sobre el video con cajas clicables de las detecciones del frame actual.
- Notes: Resalta las detecciones que coinciden con **cualquier ancla** de los targets; `role="listbox"`/`option` para accesibilidad.

## TargetPanel

- Path: `frontend/app/services/[slug]/_components/TargetPanel.tsx`
- Purpose: Panel lateral para editar targets — thumbnail, nombre, color y chips de estilos toggleables (Caja, Elipse, Flecha, Halo, Tinte, Estela, Foco, Etiqueta).
- Notes: Avisa al alcanzar `MAX_TRACKING_TARGETS` (5). Lista las **anclas** de cada target con su timestamp (+N.Ns), botón **"Refinar"** (toggle de modo refinamiento, máx. `MAX_ANCHORS_PER_TARGET`=5) y quitar ancla individual. Estado controlado por el padre vía `onUpdate`/`onRemove`/`onRemoveAnchor`/`onToggleRefine`.

## CountingLineEditor

- Path: `frontend/app/services/[slug]/_components/CountingLineEditor.tsx`
- Purpose: Editor multi-línea para el servicio de conteo — dibuja varias líneas de cruce sobre el frame y edita por línea su nombre y las etiquetas de dirección (in/out, ej. "Entran"/"Salen").
- Notes: Sigue el patrón de `ZoneEditor` sobre `VideoFrameCanvas` (arrastra los extremos de la línea activa). Botón por línea para invertir la dirección. Usado en la rama `zone_counting` de `ConfigurationView` con un toggle Líneas/Zonas.

## CountingResultPanel

- Path: `frontend/app/services/[slug]/_components/CountingResultPanel.tsx`
- Purpose: Panel de resultados del conteo — por línea muestra totales por dirección (con las etiquetas del usuario) y **desglose por clase**; por zona muestra pico/promedio de ocupación.
- Notes: Se renderiza en `ResultView` cuando `metrics.lines`/`metrics.zones` existen.

## TargetMetricsCard

- Path: `frontend/app/services/[slug]/_components/TargetMetricsCard.tsx`
- Purpose: Tarjeta de métricas por objeto en `ResultView` — swatch de color, nombre, cobertura (%), frames visibles y distancia recorrida.
- Notes: Renderiza badge «Seguimiento parcial» si `tracked_coverage < 0.6`. Usa `formatPercent` de los formatters globales.
