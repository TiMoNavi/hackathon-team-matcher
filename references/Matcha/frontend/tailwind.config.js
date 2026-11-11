/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'matcha-green': '#13ec5b',
        'matcha-dark': '#065f46',
        'matcha-darker': '#022c22',
        'matcha-black': '#000000',
        'matcha-light': '#d1fae5',
        // Forest auth theme (Landing/Login/Signup)
        'forest-dark': '#1b4332',
        'forest': '#52b788',
        'forest-mid': '#40916c',
        'primary': '#13ec5b',
        'background-light': '#f6f8f6',
        'background-dark': '#102216',
        'surface-dark': '#162a1d',
        'surface-highlight': '#1e3626',
        'surface-light': '#ffffff',
        'text-secondary': '#9db9a6',
        'card-light': '#FFFFFF',
        'card-dark': '#171717',
        'input-border-light': '#D1D5DB',
        'input-border-dark': '#374151',
        'text-main-light': '#1F2937',
        'text-main-dark': '#F9FAFB',
        'text-muted-light': '#6B7280',
        'text-muted-dark': '#9CA3AF',
      },
      fontFamily: {
        'display': ['Space Grotesk', 'sans-serif'],
        'body': ['Noto Sans', 'sans-serif', 'Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-matcha': 'linear-gradient(135deg, #022c22 0%, #065f46 50%, #10b981 100%)',
        'gradient-dark': 'linear-gradient(135deg, #000000 0%, #022c22 100%)',
        'gradient-forest': 'linear-gradient(135deg, #1b4332 0%, #52b788 100%)',
      },
    },
  },
  plugins: [],
}

