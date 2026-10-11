/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        legal: {
          bg: '#F7F6F2',
          surface: '#FFFFFF',
          secondary: '#F3F1EB',
          navy: '#14243D',
          heading: '#17243A',
          body: '#3F4754',
          muted: '#737986',
          border: '#E5E2DA',
          gold: '#A98A4B',
          goldHover: '#8F733C',
          goldLight: '#F7F2E7',
          success: '#23845D',
          warning: '#B7791F',
          error: '#C44B4B',
          info: '#4269A8',
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', '"Source Serif 4"', '"Playfair Display"', 'Georgia', 'serif'],
        editorial: ['"Cormorant Garamond"', '"Playfair Display"', '"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '3px',
        md: '6px',
        lg: '8px',
        xl: '10px',
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(20, 36, 61, 0.04)',
        card: '0 1px 3px 0 rgba(20, 36, 61, 0.05), 0 1px 2px -1px rgba(20, 36, 61, 0.04)',
      }
    },
  },
  plugins: [],
}
