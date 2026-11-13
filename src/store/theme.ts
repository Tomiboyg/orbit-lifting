import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'auto'

export const COLOURWAYS = ['graphite', 'ocean', 'aurora', 'ember', 'sakura'] as const
export type Colourway = (typeof COLOURWAYS)[number]

export const COLOURWAY_LABELS: Record<Colourway, string> = {
  graphite: 'Graphite',
  ocean: 'Ocean',
  aurora: 'Aurora',
  ember: 'Ember',
  sakura: 'Sakura',
}

interface ThemeState {
  mode: ThemeMode
  colourway: Colourway
  reduceTransparency: boolean
  init(): void
  setMode(mode: ThemeMode): void
  setColourway(c: Colourway): void
  setReduceTransparency(v: boolean): void
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(mode: ThemeMode, colourway: Colourway, reduce: boolean): void {
  const root = document.documentElement
  root.dataset.theme = resolveDark(mode) ? 'dark' : 'light'
  root.dataset.colourway = colourway
  root.classList.toggle('reduce-transparency', reduce)
}

export const useTheme = create<ThemeState>()((set, get) => ({
  mode: (localStorage.getItem('orbit.theme') as ThemeMode) || 'auto',
  colourway: (localStorage.getItem('orbit.colourway') as Colourway) || 'graphite',
  reduceTransparency: localStorage.getItem('orbit.reduceTransparency') === 'true',

  init() {
    apply(get().mode, get().colourway, get().reduceTransparency)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().mode === 'auto') apply('auto', get().colourway, get().reduceTransparency)
    })
  },

  setMode(mode) {
    set({ mode })
    localStorage.setItem('orbit.theme', mode)
    apply(mode, get().colourway, get().reduceTransparency)
  },

  setColourway(colourway) {
    set({ colourway })
    localStorage.setItem('orbit.colourway', colourway)
    apply(get().mode, colourway, get().reduceTransparency)
  },

  setReduceTransparency(v) {
    set({ reduceTransparency: v })
    localStorage.setItem('orbit.reduceTransparency', String(v))
    apply(get().mode, get().colourway, v)
  },
}))
