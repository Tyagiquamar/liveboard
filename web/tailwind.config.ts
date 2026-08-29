import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0b0c0f',
        panel: '#121317',
        raise: '#191a21',
        hoverbg: '#1e2027',
        line: '#26272e',
        ink: {
          DEFAULT: '#e8e9ed',
          muted: '#9b9ea8',
          faint: '#6c707b'
        },
        accent: {
          DEFAULT: '#4f6bed',
          soft: '#252c49'
        },
        danger: '#ef5350',
        warn: '#e9b44c',
        ok: '#57c785'
      },
      fontSize: {
        xs: ['11px', '14px'],
        sm: ['12.5px', '16px'],
        base: ['13.5px', '18px'],
        lg: ['15px', '20px'],
        xl: ['18px', '24px']
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px'
      }
    }
  },
  plugins: []
}

export default config
