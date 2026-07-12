import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0b0d10',
        panel: '#14171c',
        edge: '#232830',
      },
    },
  },
  plugins: [],
} satisfies Config;
