import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // App background — near-black, like the reference.
        base: '#0b0d10',
        // Layered gray surfaces.
        surface: '#14171c',
        raised: '#1b1f26',
        // Kept for back-compat with existing markup (== surface).
        panel: '#14171c',
        // Borders / hairlines.
        edge: '#232830',
        // Secondary / muted text.
        muted: '#8b929c',
        // Primary near-white gray accent (buttons, active text).
        accent: '#d4d7dd',
        // State accents.
        success: '#4ade80',
        warn: '#fbbf24',
        danger: '#f87171',
      },
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
