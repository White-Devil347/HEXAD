/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark': {
          50: '#f9fafb',
          100: '#f3f4f6',
          900: '#0f0f0f',
          950: '#0a0a0a',
        },
        'slate': {
          700: '#1e1e1e',
          800: '#1a1a1a',
        },
        'primary': {
          DEFAULT: '#a78bfa', // purple
          dark: '#7c3aed',
        },
        'accent': {
          DEFAULT: '#60a5fa', // blue
          dark: '#3b82f6',
        },
        'success': '#10b981',
        'error': '#ef4444',
        'warning': '#f59e0b',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #a78bfa, #60a5fa)',
        'gradient-dark': 'linear-gradient(135deg, #7c3aed, #3b82f6)',
      },
      boxShadow: {
        'soft': '0 4px 12px rgba(0, 0, 0, 0.3)',
        'glow': '0 0 20px rgba(167, 139, 250, 0.3)',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  darkMode: 'class',
  plugins: [],
};
