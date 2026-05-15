import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17191f',
        muted: '#68707b',
        line: '#d7dce2',
        'line-strong': '#aeb8c3',
        surface: {
          DEFAULT: '#ffffff',
          soft: '#f7f8fa',
          bg: '#edf0f3',
        },
        accent: '#e8ff67',
        status: {
          inbox: '#1269e8',
          planned: '#1269e8',
          active: '#1f9d62',
          waiting: '#b96f0c',
          blocked: '#c13f4a',
          someday: '#7c4a03',
          done: '#596272',
          dropped: '#596272',
        },
        provider: {
          claude: '#7547d8',
          codex: '#1269e8',
        },
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '6px',
        md: '7px',
        lg: '8px',
        // intentionally no values above 8px — PRD §13 hard cap
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: [
          '"SFMono-Regular"',
          '"Cascadia Code"',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      boxShadow: {
        panel: '0 18px 46px rgba(23, 25, 31, 0.14)',
      },
    },
  },
  plugins: [],
};

export default config;
