/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary, #07486A)',
        secondary: 'var(--secondary, #F5F5F5)',
        accent: 'var(--accent, #E6E6E6)',
        background: 'var(--background, #FAFAFA)',
        foreground: 'var(--foreground, #333333)',
        destructive: '#EF4444',
        'primary-foreground': '#ffffff',
        'secondary-foreground': '#333333',
        'accent-foreground': '#333333',
        muted: '#595959',
        'muted-foreground': '#9E9E9E',
        ring: '#07486A',
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xs': '2px',
        'sm': '4px',
        'base': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'sm': '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
}
