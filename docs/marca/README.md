# docs/marca: la identidad visual de Kovat

Todo lo que forma la identidad: logo, animaciones, estados de la interfaz, tipografías, colores y
componentes, más las pautas para construir con ellos y su calificación.

- **Por qué es así** (cada decisión y lo que se descartó): [`../19-marca.md`](../19-marca.md)
- **Cómo se construye con esto:** [`pautas.md`](./pautas.md)
- **Qué tan bien está, con evidencia:** [`calificacion.md`](./calificacion.md)
- **Para verlo todo junto:** [`vista-previa.html`](./vista-previa.html) (logo, animaciones, estados,
  tipografía), [`colores/muestra.html`](./colores/muestra.html) y
  [`componentes/boton.html`](./componentes/boton.html). Se abren en el navegador, sin servidor.

Casi todo sale de generadores en [`fuente/`](./fuente/). Lo generado no se edita a mano: se cambia
el generador y se vuelve a generar.

## Qué hay

| Archivo | Qué es | Sale de |
|---|---|---|
| `kovat-logo-rojo.svg`, `kovat-logo-blanco.svg`, `kovat-logo-negro.svg` | El logo en sus tres colores | `build.py` |
| `kovat-simbolo-rojo.svg`, `kovat-simbolo-blanco.svg`, `kovat-simbolo-negro.svg` | La K sola | `build.py` |
| `kovat-icono-app.svg`, `kovat-favicon.svg` | Ícono de la app y favicon | `build.py` |
| `kovat-intro-encendido.svg`, `kovat-intro-cuenta-regresiva.svg`, `kovat-outro-apagado.svg`, `kovat-outro-al-cero.svg` | Intros y outros | `build.py` |
| `kovat-intro-barajado.svg`, `kovat-intro-acercamiento.svg`, `kovat-outro-desarme.svg`, `kovat-outro-implosion.svg` | Intros y outros de más impacto | `wow.py` |
| `kovat-intro-21-15-9.svg`, `kovat-outro-suelta-la-barra.svg`, `kovat-loop-cargando.svg` | Animaciones alusivas al box | `alusivas.py` |
| `estados/*.svg` (9) | Estados de la interfaz hechos solo con la O | `estados.py` |
| `tipografia/KovatMarcador-Regular.ttf`, `.woff`, `kovat-marcador.css` | La fuente de marca | `tipografia.py` |
| `tipografia/muestra.html` | Muestrario de la fuente | `muestra.py` |
| `tipografia/kovat-tipografia.css` | Escala tipográfica (roles de Material) | A mano |
| `tipografia/apoyo-comparacion.html` | Comparación de fuentes de lectura. Archivo de la decisión: conserva sus propios colores | A mano |
| `colores/kovat-colores-mcu.json` | Lo que calcula Material Color Utilities; entrada del sistema de colores | `colores-mcu.html` (en el navegador) |
| `colores/kovat-colores.css`, `colores/kovat-colores.json` | Tokens de color `--k-*`, tres niveles de contraste | `colores.py` |
| `colores/muestra.html` | Referencia: todos los tokens y contrastes | `colores_muestra.py` |
| `colores/opciones.html` | Las tres opciones de neutros | `opciones_colores.py` |
| `componentes/boton.css`, `componentes/boton.html` | El botón y sus estados | A mano |
| `vista-previa.html` | Logo, animaciones, estados y tipografía en una página | `vista.py` |
| `pautas.md`, `calificacion.md`, `README.md` | Documentos | A mano |

`fuente/gen.py` es la geometría compartida (celda de 7 segmentos, letras, cortes); no escribe
archivos por sí solo.

## Regenerar todo

1. **Solo si cambian las entradas de color** (rojo LED, verde, ámbar, neutros o error): abrir
   `fuente/colores-mcu.html` en un navegador con internet y copiar el JSON que muestra en
   `colores/kovat-colores-mcu.json`.
2. Desde `docs/marca/fuente`, en este orden (los estados usan los colores, y la vista previa usa
   los estados y la fuente):

```bash
python colores.py && python opciones_colores.py && python colores_muestra.py && python build.py && python wow.py && python alusivas.py && python estados.py && python tipografia.py && python muestra.py && python vista.py
```

3. Comprobar:

```bash
python verificar.py && python validar.py
```

Cada generador también se comprueba solo y falla si algo no cumple: `colores.py` mide los
contrastes (incluidos todos los estados del botón); `wow.py` y `alusivas.py` comparan el último
cuadro de cada intro con el logo; `estados.py` mide los destellos; `tipografia.py` revisa que las
letras del logo sean idénticas a las del logo y que los números tabulares midan lo mismo.

**Es reproducible:** dos regeneraciones seguidas dan los 44 archivos idénticos, byte a byte
(comprobado el 2026-09-25). Las fuentes llevan una fecha fija por eso.

## Revisión con uibetter

```bash
python "<carpeta de la skill uibetter>/scripts/detector.py" vista-previa.html tipografia/muestra.html colores/muestra.html componentes estados . --tokens colores/kovat-colores.css
```

Hallazgos que quedan y están justificados:

- `colores/opciones.html`: colores fuera de los tokens. Son las opciones Grafito y Pista, que no se
  eligieron; la página existe para compararlas.
- `tipografia/apoyo-comparacion.html`: colores propios. Es el archivo de la decisión de la fuente
  de lectura.
- Exclamaciones en los textos de ejemplo del muestrario ("¡VAMOS!").

La rúbrica de calificación, la guía de pautas y la opción `--tokens` del detector se agregaron a la
skill uibetter el 2026-09-25 (`references/calificacion.md`, `references/pautas.md`,
`scripts/detector.py`); viven en la skill, no en este repositorio.
