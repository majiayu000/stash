import type { Config } from 'tailwindcss';

/**
 * Every color points at a CSS variable defined in `src/themes.css`. Switching
 * `<body class="theme-…">` flips the variables — every Tailwind utility in the
 * tree re-renders without re-compiling.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // semantic
        ink:           'var(--text-primary)',
        muted:         'var(--text-secondary)',
        dim:           'var(--text-muted)',
        line:          'var(--border-subtle)',
        'line-strong': 'var(--border-subtle)',
        'line-hair':   'var(--border-hair)',
        'line-glow':   'var(--border-glow)',
        glow:          'var(--text-glow)',

        // surfaces (kept legacy keys for back-compat with existing pages)
        void:           'var(--bg-void)',
        surface: {
          DEFAULT: 'var(--bg-primary)',
          soft:    'var(--bg-secondary)',
          bg:      'var(--bg-void)',
        },
        'surface-2':    'var(--bg-secondary)',
        elevated:       'var(--bg-elevated)',
        glass:          'var(--bg-glass)',

        // neon palette
        cyan:    'var(--neon-cyan)',
        magenta: 'var(--neon-magenta)',
        purple:  'var(--neon-purple)',

        // status & provider (preserve API used by StatusPill / ProviderBadge)
        accent: 'var(--neon-cyan)',
        status: {
          inbox:   'var(--neon-cyan)',
          planned: 'var(--neon-cyan)',
          active:  'var(--neon-green)',
          waiting: 'var(--neon-orange)',
          blocked: 'var(--neon-pink)',
          someday: 'var(--neon-purple)',
          done:    'var(--text-muted)',
          dropped: 'var(--text-muted)',
        },
        provider: {
          claude: 'var(--neon-purple)',
          codex:  'var(--neon-cyan)',
        },
      },
      borderRadius: {
        none: '0',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        full: 'var(--radius-pill)',
      },
      fontFamily: {
        sans: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
      },
      boxShadow: {
        neon:  'var(--shadow-neon)',
        card:  'var(--shadow-card)',
        deep:  'var(--shadow-deep)',
        panel: 'var(--shadow-deep)',
      },
    },
  },
  plugins: [],
};

export default config;
