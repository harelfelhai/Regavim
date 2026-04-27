/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        regavim: {
          bg: '#f8fafc',        // app background (slate-50)
          surface: '#ffffff',   // sidebar / card surface
          border: '#e2e8f0',    // dividers (slate-200)
          blue: {
            light: '#dbeafe',   // hover tint (blue-100)
            DEFAULT: '#2563eb', // primary action (blue-600)
            dark: '#1e3a8f',    // deep navy (blue-900)
          },
          navy: '#0f172a',      // text headings (slate-900)
        },
      },
    },
  },
  plugins: [],
}
