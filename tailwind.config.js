/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        elevated: 'var(--color-elevated)',
        accent: 'var(--color-accent)',
        'text-main': 'var(--color-text-main)',
        'text-secondary': 'var(--color-text-secondary)',
        'border-color': 'var(--color-border-color)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Helvetica Neue"',
          'Inter',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        'apple-xs': '0 1px 2px rgba(0,0,0,0.04)',
        'apple-sm': '0 2px 8px rgba(0,0,0,0.06)',
        'apple-md': '0 8px 24px rgba(0,0,0,0.10)',
        'apple-lg': '0 24px 48px rgba(0,0,0,0.16)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      backdropBlur: {
        apple: '20px',
      },
    },
  },
  plugins: [],
};
