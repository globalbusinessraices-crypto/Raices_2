/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto'],
      },
      colors: {
        brand: {
          50:  '#f2f7ff',
          100: '#e6efff',
          200: '#c7daff',
          300: '#9fbeff',
          400: '#6f9bff',
          500: '#3b82f6',   // primario
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          500: '#10b981',   // verde acción (Confirmar)
          600: '#059669',
        }
      },
      boxShadow: {
        card: '0 4px 16px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        '2xl': '1rem',
      }
    },
  },
  plugins: [],
}
