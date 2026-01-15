/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#486bec", // Original JS gradient start
        secondary: "#db2777", // Original JS gradient end
        'bg-dark': '#111827', // Layout background
        'bg-card': '#1f2937', // Card/Selector background
      },
      screens: {
        'desktop': '901px', // Used for the sidebar breakpoint
      },
      keyframes: {
        aiPulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.8 },
        },
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        verseHighlight: {
          '0%': { backgroundColor: 'rgba(72, 107, 236, 0)' },
          '30%': { backgroundColor: 'rgba(72, 107, 236, 0.15)' },
          '100%': { backgroundColor: 'rgba(72, 107, 236, 0)' },
        },
      },
      animation: {
        aiPulse: 'aiPulse 1.6s ease-in-out infinite',
        fadeIn: 'fadeIn 0.5s ease-out forwards',
        verseHighlight: 'verseHighlight 3s ease-out',
      }
    },
  },
  plugins: [],
};