/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        felt: {
          DEFAULT: '#0b3d24',
          dark: '#052013',
          light: '#125c37',
        },
        ink: {
          DEFAULT: '#0a0e0c',
          light: '#141a17',
          lighter: '#1e2622',
        },
        gold: {
          DEFAULT: '#d4af37',
          light: '#f0d878',
          dark: '#a3831f',
        },
        card: {
          face: '#fdfcf8',
          back: '#7a1128',
          'back-dark': '#4a0a18',
        },
        win: '#2ecc71',
        lose: '#e74c3c',
      },
      boxShadow: {
        gold: '0 0 12px 2px rgba(212,175,55,0.45)',
        card: '0 2px 6px rgba(0,0,0,0.4)',
        'card-hover': '0 6px 16px rgba(0,0,0,0.55)',
      },
      backgroundImage: {
        'felt-texture':
          'radial-gradient(ellipse at top, #125c37 0%, #0b3d24 45%, #052013 100%)',
      },
      keyframes: {
        'deal-in': {
          '0%': { opacity: '0', transform: 'translateY(-40px) scale(0.8)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212,175,55,0.5)' },
          '50%': { boxShadow: '0 0 0 8px rgba(212,175,55,0)' },
        },
      },
      animation: {
        // backwards: with an animation-delay (staggered deals), the
        // element holds the 0% keyframe (invisible) during the delay
        // instead of flashing fully visible before the animation starts.
        'deal-in': 'deal-in 0.35s ease-out backwards',
        'pulse-gold': 'pulse-gold 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
}
