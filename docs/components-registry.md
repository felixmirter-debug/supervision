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
