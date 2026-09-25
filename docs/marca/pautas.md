# Pautas de interfaz de Kovat

Cómo se construye la interfaz con la identidad de Kovat. Aplican a toda pantalla, componente o
pieza visual nueva y a la migración de la app actual. Cada regla dice cómo se comprueba.
Siguen la estructura de la skill uibetter (`references/pautas.md`) y se califican con su rúbrica
(`references/calificacion.md`). La calificación actual está en [`calificacion.md`](./calificacion.md).

## 1. Fuente de verdad

Nada de esto se copia a mano: se importa.

| Qué | Archivo |
|---|---|
| Colores (tokens `--k-*`, tres niveles de contraste) | [`colores/kovat-colores.css`](./colores/kovat-colores.css), referencia en [`colores/muestra.html`](./colores/muestra.html) |
| Tipografía y escala | [`tipografia/kovat-tipografia.css`](./tipografia/kovat-tipografia.css), [`tipografia/kovat-marcador.css`](./tipografia/kovat-marcador.css) |
| Botón | [`componentes/boton.css`](./componentes/boton.css), estados en [`componentes/boton.html`](./componentes/boton.html) |
| Estados de la O (cargando, listo, error, 404…) | [`estados/`](./estados/) |
| Logo, ícono, animaciones | Esta carpeta; se regeneran con [`fuente/`](./fuente/) |
| Decisiones y razones | [`../19-marca.md`](../19-marca.md) §5 y §7 |

## 2. Reglas no negociables

| # | Regla | Por qué | Cómo se comprueba |
|---|---|---|---|
| 1 | **Solo tokens.** Ningún color escrito a mano (hex, rgb, clase de gris de Tailwind); si falta uno, se agrega al sistema | Un color suelto rompe los tres niveles de contraste y el contraste medido | Detector con `--tokens colores/kovat-colores.css`: 0 "Color fuera de los tokens" |
| 2 | **El texto rojo significa error.** El rojo de la marca va en rellenos, indicadores, foco y momentos de marca, nunca en texto | Si el rojo es marca y error a la vez, un error parece un botón | Revisión: ningún texto usa `--k-marca`, `--k-primario` ni `--k-primario-contenedor` como color |
| 3 | **Un solo botón primario por pantalla** | La acción principal es el LED del marcador | Revisión de la pantalla |
| 4 | **Dos fuentes.** Kovat Marcador solo en momentos de marca (logo, cronómetro, pantallas de competencia, títulos de campaña), desde 32 px; Atkinson Hyperlegible Next en todo lo demás. Nada de Bebas, Inter ni Permanent Marker | La de marca se lee mal en tamaño chico; la de lectura no confunde letras | Detector (fuentes); revisión de tamaños |
| 5 | **Sin rótulos en mayúsculas espaciadas.** Mayúscula solo inicial | Se leen peor y son el tic de plantilla más visto | Detector: 0 "Rótulos en MAYÚSCULAS" |
| 6 | **Números tabulares** en plata, tiempos, tablas y marcadores (`.k-numeros`) | Un número que cambia no hace saltar la columna | Revisión |
| 7 | **Foco visible siempre:** 2 px en `--k-foco`, separado 2 px. Nunca `outline: none` sin reemplazo | Sin foco, quien usa teclado no sabe dónde está | Detector; recorrer la pantalla con Tab |
| 8 | **Zoom y selección permitidos** | Quien ve mal amplía; la gente copia montos y nombres | Detector: 0 "El zoom está bloqueado", 0 "Texto no seleccionable" |
| 9 | **Objetivos táctiles de 48 px** | El coach usa el celular a medio brazo | Revisión a 375 px |
| 10 | **Estados completos** en todo lo interactivo: reposo, flotante, presionado, foco, deshabilitado; y carga, error y vacío en lo que trae datos (con los estados de la O) | Un estado que falta es una pantalla que "no hace nada" | Página de estados del componente |
| 11 | **Movimiento:** 150 a 250 ms, salida suave, solo opacidad, transformación y color; respetar "menos movimiento"; las animaciones de marca solo en intro y outro | El movimiento de la interfaz acompaña, no decora | Detector (`transition: all`, menos movimiento) |
| 12 | **Claro y oscuro los pone el sistema, no el componente.** Todo color sale de `--k-*`, que cambia solo según el celular (o `data-tema` en `<html>`). No se escriben variantes `dark:` de Tailwind ni colores por modo | Decisión del 2026-09-25 (`../19-marca.md` §7.6). Un color escrito para un modo se rompe en el otro | Conteo de `dark:` en el código migrado: 0; detector con `--tokens` |

## 3. Tipografía por rol

| Rol | Tamaño | Fuente | Clase |
|---|---|---|---|
| Display | 57, 45, 36 px | Kovat Marcador | `.k-display-grande`, `-mediano`, `-chico` |
| Titular grande | 32 px | Kovat Marcador | `.k-titular-grande` |
| Titulares y títulos | 28 a 14 px | Atkinson, negrita | `.k-titular-mediano` … `.k-titulo-chico` |
| Cuerpo | 16 px por defecto en el celular; 14 y 12 | Atkinson | `.k-cuerpo-grande`, `-mediano`, `-chico` |
| Etiquetas | 14, 12, 11 px | Atkinson, seminegrita | `.k-etiqueta-*` |

## 4. Componentes

| Componente | Estado |
|---|---|
| Botón (primario, secundario, fantasma) | Especificado: `componentes/boton.css` |
| Estados de la O (cargando, procesando, subiendo, descargando, listo, error, 404, sin conexión, esperando) | Especificados: `estados/` |
| Campo de texto (con etiqueta, ayuda y error) | Pendiente |
| Tarjeta y superficies | Pendiente |
| Etiqueta de estado (al día, vence pronto, en mora) | Pendiente; en `colores/opciones.html` hay un borrador con ícono y texto |
| Tabla y lista de atletas | Pendiente |
| Navegación | Pendiente |
| Aviso flotante y diálogo | Pendiente |

Cada componente nuevo lleva su ficha antes de usarse: intención; variantes con textos reales;
matriz de estados; medidas; contraste medido de cada estado en los tres niveles (se agrega a
`fuente/colores.py`, que falla si no cumple); accesibilidad (elemento HTML, teclado, `aria-*`,
alto contraste de Windows, menos movimiento); qué no hacer; CSS y una página con todos los
estados.

## 5. Texto

- Cada frase dice algo que solo Kovat diría: un dato, un plazo, un nombre, un valor.
- Botones con verbo y objeto: "Registrar pago", "Reservar clase", "Escribir por WhatsApp".
- Los errores dicen qué pasó y qué hacer: "No se guardó el pago: la fecha es anterior al inicio
  del plan de Luisa."
- Sin signos de exclamación, sin emojis y sin la palabra CrossFit.
- La voz completa está en `../19-marca.md` §4.

## 6. Definición de terminado

Un cambio de interfaz está terminado cuando:

- [ ] `python <skill uibetter>/scripts/detector.py <archivos tocados> --estricto --tokens docs/marca/colores/kovat-colores.css`
      no deja hallazgos ALTA sin justificar;
- [ ] se miró el render a 375 y a 1280 px, sin cortes ni desbordes;
- [ ] los pares de color nuevos están medidos (o agregados a `fuente/colores.py`);
- [ ] los componentes tienen todos sus estados;
- [ ] se probó con teclado (Tab, Enter, Esc) y con el sistema pidiendo menos movimiento;
- [ ] los textos siguen la sección 5.

## 7. Migración de la app actual

En este orden. Las pantallas se migran completas, una por una; mientras tanto, lo nuevo no agrega
más del estilo viejo (grunge, `#FF0000`, Bebas, mayúsculas espaciadas).

1. **Puertas de accesibilidad** (no esperan al resto): zoom, selección de texto, foco visible y el
   gris de texto secundario de 4,5:1 o más.
2. **Tokens en Tailwind:** `tailwind.config.js` apunta a las variables `--k-*` y se carga
   `kovat-colores.css`; se quitan las variantes `dark:`.
3. **Fuentes:** Atkinson y Kovat Marcador servidas desde el propio dominio; se quitan Bebas, Inter,
   Permanent Marker y la textura de ruido.
4. **Componentes base** con su ficha (sección 4).
5. **Pantallas**, empezando por las que más se usan: cartera, reservas y la vista del atleta.
6. **Renombre de Scalar a Kovat,** después de la consulta en la SIC (`../19-marca.md` §6).

Se vuelve a calificar al cerrar cada paso. Objetivo: 85 o más.
