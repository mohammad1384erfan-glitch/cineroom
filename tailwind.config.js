/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: {
            main: 'rgb(var(--color-bg-main) / <alpha-value>)',
            card: 'rgb(var(--color-bg-card) / <alpha-value>)',
            input: 'rgb(var(--color-bg-input) / <alpha-value>)',
          },
          primary: {
            DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
            hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
            glow: 'rgb(var(--color-primary-glow) / <alpha-value>)',
          },
          accent: {
            DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
            hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          },
          text: {
            main: 'rgb(var(--color-text-main) / <alpha-value>)',
            muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
          }
        }
      },
      boxShadow: {
        'glow': '0 0 20px rgb(var(--color-primary-glow) / 0.35)',
        'glow-strong': '0 0 30px rgb(var(--color-primary-glow) / 0.6)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
      },
      backdropBlur: {
        'xs': '2px',
        'sm': '4px',
        'md': '8px',
        'lg': '16px',
        'xl': '24px',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { transform: 'scale(1)', filter: 'drop-shadow(0 0 5px rgb(var(--color-primary-glow) / 0.2))' },
          '50%': { transform: 'scale(1.02)', filter: 'drop-shadow(0 0 20px rgb(var(--color-primary-glow) / 0.6))' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
