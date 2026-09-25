# Calificación de la identidad visual (2026-09-25)

Hecha con la rúbrica de la skill uibetter (`references/calificacion.md`): puertas bloqueantes, nueve
criterios con pesos y nivel máximo 2 sin evidencia. Se califican por separado **lo diseñado** (el
sistema de marca Kovat, en `docs/marca/`) y **lo implementado** (la app que ve el usuario hoy, que
todavía es Scalar), porque el promedio escondería la brecha.

## Evidencia usada

- Detector de uibetter con la regla nueva de colores fuera de los tokens:
  `detector.py <rutas> --tokens docs/marca/colores/kovat-colores.css`. En la app se revisaron
  `index.html`, `src/index.css`, `src/app`, `src/features`, `src/shared` y `tailwind.config.js`; se
  dejó fuera `src/legacy`, que es el prototipo archivado sin rutas.
- Render de la app en el navegador a 1280 y a 375 px (`/inicio` y la pantalla de entrada), con
  llaves de Supabase falsas y sin backend: solo pantallas públicas.
- Contrastes medidos: `docs/marca/fuente/colores.py` para el sistema; una medición aparte para los
  grises y el rojo de la app.
- Conteos en el código de la app (sin `src/legacy`).

## 1. Lo diseñado: sistema de marca Kovat

**Puertas:** ninguna falla. 90 pares de contraste por nivel en tres niveles, límite de destellos
comprobado en todas las animaciones, foco visible en los componentes, sin contenido inventado.
Detector sobre las 24 piezas (páginas, componentes, estados y SVG): 0 hallazgos altos o medios.

| # | Criterio | Peso | Nivel | Puntos | Evidencia | Qué lo sube |
|---|---|---|---|---|---|---|
| 1 | Tesis y especificidad | 15 | 4 | 15,0 | Logo de segmentos con 29 uniones medidas; la O es el 0 del cronómetro; animaciones del mundo del box (21-15-9, soltar la barra) | Mantener |
| 2 | Sistema y tokens | 15 | 2 | 7,5 | Color (`kovat-colores.css`, con piezas de marca) y escala tipográfica definidos y medidos. Faltan espaciado, radios, elevación y movimiento como tokens | Tokens de espacio, radio, elevación y movimiento |
| 3 | Color y contraste | 12 | 4 | 12,0 | Método de Material 3, tres niveles, 90 pares por nivel, tres rojos separados (ΔE ≥ 15,5), gráficas validadas para daltonismo | Mantener |
| 4 | Tipografía | 10 | 3 | 7,5 | Dos familias con razón escrita, escala por roles, tabulares medidos. Atkinson se carga desde Google Fonts y no hay WOFF2 | Servir las fuentes desde el propio dominio, con WOFF2 |
| 5 | Jerarquía y composición | 10 | 2 | 5,0 | Solo una pantalla de muestra (cartera) en `opciones.html`; ninguna pantalla real diseñada con el sistema | Diseñar las 3 pantallas principales con el sistema |
| 6 | Componentes y estados | 10 | 2 | 5,0 | Botón completo (5 estados, 3 variantes, contraste medido, alto contraste de Windows) y 9 estados de la O. Faltan campo, tarjeta, etiqueta de estado, tabla, navegación, aviso, diálogo | Especificar esos componentes con la misma ficha |
| 7 | Texto | 10 | 3 | 7,5 | Voz y reglas escritas; "el texto rojo significa error"; páginas de marca limpias en el detector | Guía de microcopy (errores, vacíos, confirmaciones) |
| 8 | Movimiento | 6 | 4 | 6,0 | Intros y outros con curvas y tiempos medidos, menos de 3 destellos por segundo, estados con "menos movimiento" | Tokens de duración y curva |
| 9 | Accesibilidad y oficio | 12 | 3 | 9,0 | Tres niveles de contraste, `forced-colors`, foco, objetivos de 48 px. Todavía sin probar en pantallas reales | Probarlo en las pantallas reales con teclado y lector |

**Nota: 74,5 de 100. Banda: bueno, con arreglos.** Lo que falta es sistema, no identidad: tokens
de espacio, radio, elevación y movimiento, el resto de componentes y pantallas reales hechas con
él.

## 2. Lo implementado: la app actual (Scalar)

**Puertas: fallan tres.** Con cualquiera de ellas la nota queda en 49 como máximo.

| Puerta | Dónde |
|---|---|
| Contraste bajo 4,5:1 | `text-gray-500` (267 usos) da 4,10–4,34:1; `text-gray-600` (32 usos) da 2,78:1; texto blanco sobre el botón `#FF0000` da 4,00:1 |
| Zoom bloqueado | `index.html:11`: `maximum-scale=1, user-scalable=no` |
| Foco invisible | 0 usos de `:focus-visible` en `src/app`, `src/features` y `src/shared`; 12 archivos quitan el contorno (`focus:outline-none`) sin reemplazo |

| # | Criterio | Peso | Nivel | Puntos | Evidencia |
|---|---|---|---|---|---|
| 1 | Tesis y especificidad | 15 | 1 | 3,75 | Estilo "gimnasio industrial": negro puro, rojo `#FF0000`, Bebas en mayúsculas y textura de ruido. Sirve a cualquier gimnasio |
| 2 | Sistema y tokens | 15 | 1 | 3,75 | 18 colores fuera de los tokens de Kovat, 504 grises de Tailwind sin tinte, 221 variantes `dark:` de un modo claro que no se usa |
| 3 | Color y contraste | 12 | 1 | 3,0 | Rojo y negro puros; enlaces en texto rojo; `text-purple-400` en automatizaciones; contrastes bajo el mínimo |
| 4 | Tipografía | 10 | 1 | 2,5 | Bebas Neue (147 usos) e Inter, sin razón escrita; 152 rótulos en mayúsculas espaciadas |
| 5 | Jerarquía y composición | 10 | 2 | 5,0 | La portada tiene un titular fuerte, pero con una frase en otro color, un antetítulo y tres tarjetas iguales |
| 6 | Componentes y estados | 10 | 1 | 2,5 | Sin foco visible; 5 `transition: all`; 41 bordes de color a un lado |
| 7 | Texto | 10 | 3 | 7,5 | El texto es lo mejor de la app: específico, honesto ("Somos nuevos"), botones con verbo. Quedan 11 rayas y 8 flechas en botones |
| 8 | Movimiento | 6 | 2 | 3,0 | Poco movimiento; sin `prefers-reduced-motion` |
| 9 | Accesibilidad y oficio | 12 | 1 | 3,0 | Zoom bloqueado, texto no seleccionable en toda la app (`src/index.css`), foco invisible. A favor: no hay desborde a 375 px y `lang="es"` |

**Nota: 34 de 100. Banda: rehacer, con tres puertas falladas.** Es la brecha esperada: la app no ha
adoptado la identidad nueva. El texto se salva y se conserva.

## 3. Las cinco acciones de más impacto

1. **Cerrar las tres puertas en la app, ya y sin esperar el rediseño.** Quitar `maximum-scale` y
   `user-scalable` de `index.html`, permitir la selección de texto en `src/index.css`, poner un
   `:focus-visible` global y subir el gris de texto secundario a uno de 4,5:1 o más. Se comprueba
   con el detector (sin "El zoom", "Texto no seleccionable" ni "contorno de foco") y midiendo el
   gris. Son menos de una hora de trabajo y hoy dejan gente por fuera.
2. **Completar los tokens del sistema:** espacio, radios, elevación y movimiento, en el mismo
   generador. Sube el criterio 2 del sistema a 4.
3. **Especificar los componentes base** con la ficha de `pautas.md`: campo, tarjeta, etiqueta de
   estado, tabla, navegación, aviso y diálogo. Sube el criterio 6.
4. **Migrar la app:** tokens en Tailwind, fuentes, componentes y pantallas completas una por una,
   en el orden de `pautas.md`, junto con el renombre a Kovat.
5. **Servir Atkinson y Kovat Marcador desde el propio dominio, con WOFF2.**

Objetivo: el sistema en 85 o más (sólido) antes de migrar, y la app en 85 o más al terminar la
migración. Se vuelve a calificar con la misma rúbrica al cerrar cada acción.
