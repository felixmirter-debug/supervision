'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCENT_STORAGE_KEY = 'cv-saas-accent-theme'
const MODE_STORAGE_KEY = 'cv-saas-color-mode'
const THEME_CHANGE_EVENT = 'cv-saas-theme-change'

const THEMES = [
  { value: 'blue', label: 'Azul', swatch: 'bg-sky-400' },
  { value: 'red', label: 'Rojo', swatch: 'bg-red-400' },
  { value: 'yellow', label: 'Amarillo', swatch: 'bg-yellow-300' },
] as const

type AccentTheme = (typeof THEMES)[number]['value']
type ColorMode = 'light' | 'dark'
type ThemeSnapshot = { accent: AccentTheme; mode: ColorMode }

const DEFAULT_ACCENT: AccentTheme = 'blue'
const DEFAULT_MODE: ColorMode = 'dark'

function isAccentTheme(value: string | null): value is AccentTheme {
  return THEMES.some((theme) => theme.value === value)
}

function isColorMode(value: string | null): value is ColorMode {
  return value === 'light' || value === 'dark'
}

function applyTheme(theme: ThemeSnapshot) {
  document.documentElement.dataset.accentTheme = theme.accent
  document.documentElement.dataset.colorMode = theme.mode
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')
}

function getStoredTheme(): ThemeSnapshot {
  if (typeof window === 'undefined') {
    return { accent: DEFAULT_ACCENT, mode: DEFAULT_MODE }
  }

  try {
    const storedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY)
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY)

    return {
      accent: isAccentTheme(storedAccent) ? storedAccent : DEFAULT_ACCENT,
      mode: isColorMode(storedMode) ? storedMode : DEFAULT_MODE,
    }
  } catch {
    return { accent: DEFAULT_ACCENT, mode: DEFAULT_MODE }
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
  const theme = useSyncExternalStore(subscribeThemeChanges, getStoredTheme, () => ({
    accent: DEFAULT_ACCENT,
    mode: DEFAULT_MODE,
  }))

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function selectTheme(nextTheme: Partial<ThemeSnapshot>) {
    const next = { ...theme, ...nextTheme }
    applyTheme(next)

    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, next.accent)
      window.localStorage.setItem(MODE_STORAGE_KEY, next.mode)
    } catch {
      // Theme still applies for the current page when storage is unavailable.
    }

    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card/80 p-0.5 shadow-sm backdrop-blur"
      role="group"
      aria-label="Tema visual"
    >
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
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              selected ? 'bg-brand-soft ring-1 ring-brand-border' : 'hover:bg-muted'
            )}
          >
            <span
              aria-hidden="true"
              className={cn('size-3 rounded-full ring-1 ring-white/40', item.swatch)}
            />
          </button>
        )
      })}
    </div>
  )
}
