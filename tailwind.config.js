/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#FF0000", // Intense Red
        "background-light": "#e5e5e5", // Industrial Concrete
        "background-dark": "#000000", // Pitch Black
        "surface-light": "#ffffff",
        "surface-dark": "#0a0a0a", // Off-black for cards
        "chalkboard": "#1a1a1a",
      },
      fontFamily: {
        display: ["Bebas Neue", "sans-serif"],
        body: ["Inter", "sans-serif"],
        chalk: ["Permanent Marker", "cursive"],
      },
      borderRadius: {
        DEFAULT: "2px", // Sharp, industrial corners
      },
      backgroundImage: {
        'noise': "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1IiBoZWlnaHQ9IjUiPgo8cmVjdCB3aWR0aD0iNSIgaGVpZ2h0PSI1IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')",
      }
    },
  },
  plugins: [],
}
