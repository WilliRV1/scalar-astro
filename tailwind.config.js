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
        // Texto sobre el rojo: el blanco daba 4,00:1; este da 4,81:1 (--k-pieza-tarima).
        "sobre-primario": "#110E0D",
        // Flotante del botón primario: capa clara al 8 % sobre el rojo, como en
        // docs/marca/componentes/boton.css. Con el texto oscuro da 4,83:1.
        "primario-flotante": "#FD1212",
      },
      // Texto secundario con 4,5:1 o más sobre los fondos oscuros de la app (#000000, #0a0a0a y
      // blanco al 5 y al 10 % sobre negro). Antes: 500 daba 4,10 y 600 daba 2,62 sobre #0a0a0a.
      // Son los tonos 60 y 55 del neutro de Kovat; 400 > 500 > 600 conservan el orden. Solo cambia
      // el color de texto: bordes y fondos gray-500/600 quedan igual. Puente hasta los tokens --k-*.
      textColor: {
        gray: {
          500: "#968f8d",
          600: "#898280",
        },
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
