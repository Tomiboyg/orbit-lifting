import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design tokens are CSS variables defined once in src/styles/tokens.css
        // and switched per colourway + light/dark. Tailwind only bridges them.
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-contrast': 'var(--accent-contrast)',
        'text-primary': 'var(--text-primary)',
        'text-muted': 'var(--text-muted)',
        'glass-bg': 'var(--glass-bg)',
        'glass-bg-strong': 'var(--glass-bg-strong)',
        'glass-border': 'var(--glass-border)',
        'solid-surface': 'var(--solid-surface)',
        'solid-surface-2': 'var(--solid-surface-2)',
        dim: 'var(--dim-backdrop)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'Inter',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        'large-title': ['2rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        title: ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        headline: ['1.125rem', { lineHeight: '1.3' }],
        body: ['1rem', { lineHeight: '1.5' }],
        caption: ['0.8125rem', { lineHeight: '1.4' }],
      },
      borderRadius: {
        control: '0.75rem',
        card: '1.25rem',
        hero: '1.75rem',
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
      transitionTimingFunction: {
        'orbit-spring': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.18)',
        'glass-raised': '0 12px 40px rgba(0, 0, 0, 0.24)',
        'glass-sheet': '0 24px 64px rgba(0, 0, 0, 0.32)',
        'accent-glow': '0 4px 20px var(--accent-glow)',
      },
      minHeight: {
        dvh: '100dvh',
      },
      screens: {
        tablet: '768px',
        desktop: '1280px',
      },
    },
  },
  plugins: [],
} satisfies Config
