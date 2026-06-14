/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'rgb(var(--surface-0) / <alpha-value>)',
          1: 'rgb(var(--surface-1) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
          3: 'rgb(var(--surface-3) / <alpha-value>)',
          4: 'rgb(var(--surface-4) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          subtle:  'rgb(var(--border-subtle) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          muted:   'rgb(var(--accent-muted) / <alpha-value>)',
          subtle:  'rgb(var(--accent-subtle) / <alpha-value>)',
        },
        gold: {
          300: '#e8b430',
          400: '#c48b08',
          500: '#9c6c05',
        },
        status: {
          confirmado: '#22c55e',
          proposta:   '#facc15',
          cancelado:  '#ef4444',
          lock:       '#3b82f6',
          vazio:      '#3f3f3f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      keyframes: {
        slideUp: {
          from: { opacity: '0', transform: 'translate(-50%, 12px)' },
          to:   { opacity: '1', transform: 'translate(-50%, 0)' },
        },
        drain: {
          from: { width: '100%' },
          to:   { width: '0%' },
        },
      },
      animation: {
        'slide-up': 'slideUp 0.18s ease-out forwards',
        'drain':    'drain linear forwards',
      },
    },
  },
  plugins: [],
}
