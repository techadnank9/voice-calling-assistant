import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101318',
        pearl: '#eef3f8',
        coral: '#ff6b52',
        pine: '#0e5d46'
      }
    }
  },
  plugins: []
} satisfies Config;
