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
- Notes: Carga `getDetectionPreview` vía `useDetectionPreview`; mapea el tiempo del player al frame muestreado más cercano; permite continuar sin targets (modo automático). Específico de tracking.

## DetectionOverlay

- Path: `frontend/app/services/[slug]/_components/DetectionOverlay.tsx`
- Purpose: Overlay SVG (viewBox 0..1) sobre el video con cajas clicables de las detecciones del frame actual.
- Notes: Resalta las detecciones ya seleccionadas; `role="listbox"`/`option` para accesibilidad.

## TargetPanel

- Path: `frontend/app/services/[slug]/_components/TargetPanel.tsx`
- Purpose: Panel lateral para editar targets — thumbnail, nombre, color y chips de estilos toggleables (Caja, Elipse, Flecha, Halo, Tinte, Estela, Foco, Etiqueta).
- Notes: Avisa al alcanzar `MAX_TRACKING_TARGETS` (5). Estado controlado por el padre vía `onUpdate`/`onRemove`.

## TargetMetricsCard

- Path: `frontend/app/services/[slug]/_components/TargetMetricsCard.tsx`
- Purpose: Tarjeta de métricas por objeto en `ResultView` — swatch de color, nombre, cobertura (%), frames visibles y distancia recorrida.
- Notes: Renderiza badge «Seguimiento parcial» si `tracked_coverage < 0.6`. Usa `formatPercent` de los formatters globales.
