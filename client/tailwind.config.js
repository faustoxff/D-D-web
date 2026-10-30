/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        parchment: {
          50:  "#fdf8f0",
          100: "#faefd9",
          200: "#f5deb3",
          300: "#e8c97a",
          400: "#d4a843",
          500: "#b8860b",
        },
        dungeon: {
          900: "#1a0a00",
          800: "#2d1500",
          700: "#3d1f00",
          600: "#5a2d00",
        }
      },
      fontFamily: {
        fantasy: ["Palatino Linotype", "Palatino", "Georgia", "serif"]
      }
    }
  },
  plugins: []
};
