/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cyber-blue': '#00ffcc',
        'cyber-dark': '#0a0e27',
        'cyber-darker': '#050812',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 255, 204, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(0, 255, 204, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}
