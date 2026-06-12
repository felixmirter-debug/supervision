'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCENT_STORAGE_KEY = 'cv-saas-accent-theme'
const MODE_STORAGE_KEY = 'cv-saas-color-mode'
const THEME_CHANGE_EVENT = 'cv-saas-theme-change'
const DEFAULT_ACCENT = 'blue'
const DEFAULT_MODE = 'dark'

const THEMES = [
  { value: 'blue', label: 'Azul', swatch: 'bg-sky-400' },
  { value: 'red', label: 'Rojo', swatch: 'bg-red-400' },
  { value: 'yellow', label: 'Amarillo', swatch: 'bg-yellow-300' },
] as const

type AccentTheme = (typeof THEMES)[number]['value']
type ColorMode = 'light' | 'dark'
type ThemeSnapshot = `${AccentTheme}:${ColorMode}`

function isAccentTheme(value: string | null): value is AccentTheme {
  return THEMES.some((theme) => theme.value === value)
}

function isColorMode(value: string | null): value is ColorMode {
  return value === 'light' || value === 'dark'
}

function encodeTheme(accent: AccentTheme, mode: ColorMode): ThemeSnapshot {
  return `${accent}:${mode}`
}

function decodeTheme(snapshot: ThemeSnapshot) {
  const [accent, mode] = snapshot.split(':') as [AccentTheme, ColorMode]
  return { accent, mode }
}

function applyTheme(accent: AccentTheme, mode: ColorMode) {
  document.documentElement.dataset.accentTheme = accent
  document.documentElement.dataset.colorMode = mode
  document.documentElement.classList.toggle('dark', mode === 'dark')
}

function getStoredTheme(): ThemeSnapshot {
  if (typeof window === 'undefined') return encodeTheme(DEFAULT_ACCENT, DEFAULT_MODE)

  try {
    const storedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY)
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY)
    const accent = isAccentTheme(storedAccent) ? storedAccent : DEFAULT_ACCENT
    const mode = isColorMode(storedMode) ? storedMode : DEFAULT_MODE

    return encodeTheme(accent, mode)
  } catch {
    return encodeTheme(DEFAULT_ACCENT, DEFAULT_MODE)
  }
}

function subscribeThemeChanges(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange)
  }
}

export function ThemeToggle() {
  const snapshot = useSyncExternalStore(subscribeThemeChanges, getStoredTheme, () => encodeTheme(DEFAULT_ACCENT, DEFAULT_MODE))
  const theme = useMemo(() => decodeTheme(snapshot), [snapshot])

  useEffect(() => {
    applyTheme(theme.accent, theme.mode)
  }, [theme.accent, theme.mode])

  function selectTheme(nextTheme: Partial<{ accent: AccentTheme; mode: ColorMode }>) {
    const next = { ...theme, ...nextTheme }
    applyTheme(next.accent, next.mode)

    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, next.accent)
      window.localStorage.setItem(MODE_STORAGE_KEY, next.mode)
    } catch {
      // Theme still applies for the current page when storage is unavailable.
    }

    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card/80 p-0.5 shadow-sm backdrop-blur" role="group" aria-label="Tema visual">
      <button
        type="button"
        aria-label={`Cambiar a modo ${theme.mode === 'dark' ? 'claro' : 'oscuro'}`}
        title={theme.mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        onClick={() => selectTheme({ mode: theme.mode === 'dark' ? 'light' : 'dark' })}
        className="inline-flex size-7 items-center justify-center rounded-[6px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {theme.mode === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      </button>
      <span className="h-5 w-px bg-border" />
      {THEMES.map((item) => {
        const selected = theme.accent === item.value
        return (
          <button
            key={item.value}
            type="button"
            aria-label={`Usar acento ${item.label}`}
            aria-pressed={selected}
            title={`Acento ${item.label}`}
            onClick={() => selectTheme({ accent: item.value })}
            className={cn('inline-flex size-7 items-center justify-center rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50', selected ? 'bg-brand-soft ring-1 ring-brand-border' : 'hover:bg-muted')}
          >
            <span aria-hidden="true" className={cn('size-3 rounded-full ring-1 ring-white/40', item.swatch)} />
          </button>
        )
      })}
    </div>
  )
}
