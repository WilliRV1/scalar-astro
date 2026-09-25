"""Sistema de colores de Kovat: modo oscuro y modo claro, tres niveles de contraste cada uno
(método de Material 3). La app sigue el ajuste del celular (decisión del 2026-09-25, segunda parte).

Entrada: docs/marca/colores/kovat-colores-mcu.json, generado por colores-mcu.html con Material
Color Utilities. Salida en docs/marca/colores/:
  opciones.html        las tres opciones de neutros, lado a lado, con la misma pantalla de ejemplo
  kovat-colores.css    variables CSS de la opción elegida (estándar por defecto; medio y alto con
                       data-contraste y prefers-contrast: more)
  kovat-colores.json   los tokens finales de la opción elegida por nivel, con su rol de Material

Reglas del sistema (docs/19-marca.md § 7):
  1. El texto rojo significa error. El rojo de la marca va en rellenos e indicadores, nunca en texto.
  2. Verde y ámbar son solo para estados, siempre con ícono y texto.
  3. Nada se usa sin su par: cada "sobre-X" va encima de su "X".
Cada par de uso se mide aquí; si alguno no llega a su contraste mínimo, el script falla.
"""
import json, os, math

RAIZ = os.path.dirname(os.path.abspath(__file__))
SAL = os.path.join(RAIZ, "..", "colores")
MCU = json.load(open(os.path.join(SAL, "kovat-colores-mcu.json"), encoding="utf-8"))
LED = "#F0402A"
NIVELES = ["estandar", "medio", "alto"]
PAL = MCU["paletas"]
OPCIONES = list(MCU["opciones"])
ELEGIDA = "tarima"          # elegida el 2026-09-25 (grafito y pista quedan en opciones.html)

# ------------------------------------------------------------------ contraste y OKLab

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def lum(h):
    r, g, b = (lin(c) for c in rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contraste(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def oklab(h):
    r, g, b = (lin(c) for c in rgb(h))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)

def delta_e(a, b):
    return 100 * math.dist(oklab(a), oklab(b))

# ------------------------------------------------------------------ tokens por nivel

INDICADOR = {  # tonos de las paletas para indicadores gráficos (no texto): punto de estado, ícono, estado de la O
    # el error va en tono 70: en 60 queda a ΔE 8 del rojo LED y se confunde con la marca
    "estandar": {"exito": 70, "aviso": 70, "error": 70},
    "medio": {"exito": 80, "aviso": 80, "error": 80},
    "alto": {"exito": 90, "aviso": 90, "error": 90},
}
MARCA = {  # el rojo de la marca sube de tono cuando las superficies se aclaran (contraste medio y alto)
    "estandar": LED, "medio": PAL["primaria"]["60"], "alto": PAL["primaria"]["70"],
}
GRAFICA = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
SECUENCIAL = {100: "#cde2fb", 200: "#9ec5f4", 300: "#6da7ec", 400: "#3987e5", 500: "#256abf", 600: "#184f95", 700: "#0d366b"}

def tokens(opcion, nivel):
    esq = MCU["opciones"][opcion]["esquemas"][nivel]
    r = dict(esq["roles"])
    ex, av = esq["exito"], esq["aviso"]
    # texto oscuro sobre el rojo: la tarima en estándar; negro cuando el rojo se aclara
    oscuro_marca = MCU["opciones"][opcion]["paletas"]["neutra"]["4"] if nivel == "estandar" else "#000000"
    if nivel == "estandar":
        # Fidelidad a la marca: el relleno principal es el rojo LED exacto (Material lo permite para
        # colores que vienen de algo real, como un marcador). "Primario" se usa en indicadores y foco,
        # nunca en texto, así que también es el LED.
        r["primary"] = r["primaryContainer"] = LED
        r["onPrimary"] = r["onPrimaryContainer"] = oscuro_marca
    else:
        # En contraste medio y alto Material aclara todos los contenedores y el de error termina casi
        # igual al rojo de la marca (ΔE 6 y 3). Aquí el error se queda carmesí oscuro, con texto blanco.
        r["errorContainer"] = PAL["error"]["40" if nivel == "medio" else "30"]
        r["onErrorContainer"] = "#ffffff"
    t = {
        # superficies
        "superficie": r["surface"],
        "superficie-mas-baja": r["surfaceContainerLowest"],
        "superficie-baja": r["surfaceContainerLow"],
        "superficie-contenedor": r["surfaceContainer"],
        "superficie-alta": r["surfaceContainerHigh"],
        "superficie-mas-alta": r["surfaceContainerHighest"],
        "superficie-brillante": r["surfaceBright"],
        # texto e íconos
        "texto": r["onSurface"],
        "texto-secundario": r["onSurfaceVariant"],
        "enlace": r["onSurface"],
        "contorno": r["outline"],
        "contorno-variante": r["outlineVariant"],
        # marca: rellenos e indicadores, nunca texto
        "primario": r["primary"],
        "sobre-primario": r["onPrimary"],
        "primario-contenedor": r["primaryContainer"],
        "sobre-primario-contenedor": r["onPrimaryContainer"],
        "foco": r["primary"],
        "secundario-contenedor": r["secondaryContainer"],
        "sobre-secundario-contenedor": r["onSecondaryContainer"],
        "marca": MARCA[nivel],
        "sobre-marca": oscuro_marca,
        # error (carmesí, distinto del rojo de la marca)
        "error": r["error"],
        "sobre-error": r["onError"],
        "error-contenedor": r["errorContainer"],
        "sobre-error-contenedor": r["onErrorContainer"],
        "error-indicador": PAL["error"][str(INDICADOR[nivel]["error"])],
        # éxito y aviso (estáticos)
        "exito": ex["color"], "sobre-exito": ex["onColor"],
        "exito-contenedor": ex["container"], "sobre-exito-contenedor": ex["onContainer"],
        "exito-indicador": PAL["verde"][str(INDICADOR[nivel]["exito"])],
        "aviso": av["color"], "sobre-aviso": av["onColor"],
        "aviso-contenedor": av["container"], "sobre-aviso-contenedor": av["onContainer"],
        "aviso-indicador": PAL["ambar"][str(INDICADOR[nivel]["aviso"])],
        # invertidos (avisos flotantes)
        "invertida": r["inverseSurface"],
        "sobre-invertida": r["inverseOnSurface"],
        "velo": r["scrim"],
        # capa de estado de los botones y elementos neutros (flotante 8 %, presionado 10 %). En contraste
        # alto oscurece en vez de aclarar: la capa clara bajaba el texto blanco de 7:1.
        "capa-estado": r["onSurface"] if nivel != "alto" else "#000000",
        # capa del botón principal: clara, el botón "brilla más" al pasar el cursor
        "capa-primario": r["onSurface"],
        # gráficas
        "grafica-superficie": r["surfaceContainerLow"],
        **{f"grafica-{i + 1}": c for i, c in enumerate(GRAFICA)},
        **{f"grafica-secuencial-{k}": v for k, v in SECUENCIAL.items()},
        "grafica-diverge-negativo": "#e66767", "grafica-diverge-centro": MCU["opciones"][opcion]["paletas"]["neutra"]["24"], "grafica-diverge-positivo": "#3987e5",
        "grafica-rejilla": r["outlineVariant"],
        # piezas de marca (logo, animaciones, íconos): fijos en todos los niveles; vienen de build.py
        "pieza-led": LED, "pieza-tarima": "#110E0D", "pieza-tiza": "#EFEBE7", "pieza-tinta": "#161212",
        "pieza-apagado": "#2A2120", "pieza-papel": "#FFFFFF",
    }
    return t

MATERIAL = {  # a qué rol de Material corresponde cada token (para quien diseñe con el kit de Figma)
    "superficie": "surface", "superficie-mas-baja": "surfaceContainerLowest", "superficie-baja": "surfaceContainerLow",
    "superficie-contenedor": "surfaceContainer", "superficie-alta": "surfaceContainerHigh",
    "superficie-mas-alta": "surfaceContainerHighest", "superficie-brillante": "surfaceBright",
    "texto": "onSurface", "texto-secundario": "onSurfaceVariant", "contorno": "outline", "contorno-variante": "outlineVariant",
    "primario": "primary", "sobre-primario": "onPrimary", "primario-contenedor": "primaryContainer",
    "sobre-primario-contenedor": "onPrimaryContainer", "secundario-contenedor": "secondaryContainer",
    "sobre-secundario-contenedor": "onSecondaryContainer", "error": "error", "sobre-error": "onError",
    "error-contenedor": "errorContainer", "sobre-error-contenedor": "onErrorContainer",
    "invertida": "inverseSurface", "sobre-invertida": "inverseOnSurface", "velo": "scrim",
    "exito": "static color", "aviso": "static color",
}

TODAS = {o: {n: tokens(o, n) for n in NIVELES} for o in OPCIONES}
T = TODAS[ELEGIDA]

# ------------------------------------------------------------------ modo claro
# Las mismas decisiones del oscuro, llevadas a superficies claras:
#   · el botón principal sigue siendo el rojo LED exacto con texto tarima en estándar: se ve igual
#     en los dos modos;
#   · el rojo de la marca, como indicador, se oscurece en medio y alto (en claro, más contraste es
#     más oscuro), y su texto encima pasa a blanco;
#   · los indicadores bajan de tono por la misma razón;
#   · dos series de gráfica (ámbar y violeta) no llegaban a 3:1 sobre la superficie clara y se
#     oscurecieron conservando el matiz.
INDICADOR_CLARO = {
    "estandar": {"exito": 50, "aviso": 50, "error": 30},
    "medio": {"exito": 40, "aviso": 40, "error": 20},
    "alto": {"exito": 30, "aviso": 30, "error": 10},
}
# El texto de error en claro es más oscuro que el de Material (tono 40): a ese tono queda a ΔE 13,9
# del rojo de la marca. En medio se usa el de Material; en alto, el tono 10.
ERROR_TEXTO_CLARO = {"estandar": PAL["error"]["30"], "medio": None, "alto": PAL["error"]["10"]}
GRAFICA_CLARO = ["#3987e5", "#d95926", "#199e70", "#a86f00", "#d55181", "#008300", "#7466d6", "#cf4b52"]

# El LED exacto, como relleno (botón principal y marca), queda a 2,96:1 sobre superficie-mas-alta en
# claro estándar. Se acepta a conciencia: un botón se identifica por su texto (WCAG 1.4.11 no pide
# 3:1 al relleno cuando la etiqueta lo identifica) y en Material esa superficie es el relleno de los
# campos de texto, no el fondo de un botón. Los indicadores y el foco sí usan un rojo que pasa.
EXCEPCIONES_CLARO = {("estandar", "primario-contenedor", "superficie-mas-alta"),
                     ("estandar", "marca", "superficie-mas-alta")}

def mejor_texto(fondo, preferido):
    """El texto que va encima de un relleno: el preferido si llega a 4,5:1; si no, blanco o negro."""
    if contraste(preferido, fondo) >= 4.5:
        return preferido
    return max(("#ffffff", "#000000"), key=lambda c: contraste(c, fondo))

def tokens_claro(opcion, nivel):
    esq = MCU["opciones"][opcion]["esquemasClaros"][nivel]
    r = dict(esq["roles"])
    ex, av = esq["exito"], esq["aviso"]
    tarima_texto = MCU["opciones"][opcion]["paletas"]["neutra"]["4"]
    if nivel == "estandar":
        # el botón es el LED exacto con texto tarima, igual que en oscuro; los indicadores y el foco,
        # el rojo tono 50, que sí llega a 3:1 sobre todas las superficies claras
        r["primaryContainer"] = LED
        r["onPrimaryContainer"] = tarima_texto
        r["primary"] = PAL["primaria"]["50"]
        r["onPrimary"] = mejor_texto(r["primary"], tarima_texto)
        marca = LED
    else:
        # en medio y alto Material deja el contenedor de error casi igual al botón (ΔE 5,9 y 4,7):
        # aquí se queda rosado claro con texto oscuro
        r["errorContainer"] = PAL["error"]["90"]
        r["onErrorContainer"] = PAL["error"]["10"]
        marca = r["primaryContainer"]
    if ERROR_TEXTO_CLARO[nivel]:
        r["error"] = ERROR_TEXTO_CLARO[nivel]
        r["onError"] = mejor_texto(r["error"], "#ffffff")
    t = tokens(opcion, nivel)            # misma forma y piezas de marca; se pisan los valores claros
    t.update({
        "superficie": r["surface"],
        "superficie-mas-baja": r["surfaceContainerLowest"],
        "superficie-baja": r["surfaceContainerLow"],
        "superficie-contenedor": r["surfaceContainer"],
        "superficie-alta": r["surfaceContainerHigh"],
        "superficie-mas-alta": r["surfaceContainerHighest"],
        "superficie-brillante": r["surfaceBright"],
        "texto": r["onSurface"],
        "texto-secundario": r["onSurfaceVariant"],
        "enlace": r["onSurface"],
        "contorno": r["outline"],
        "contorno-variante": r["outlineVariant"],
        "primario": r["primary"],
        "sobre-primario": r["onPrimary"],
        "primario-contenedor": r["primaryContainer"],
        "sobre-primario-contenedor": r["onPrimaryContainer"],
        "foco": r["primary"],
        "secundario-contenedor": r["secondaryContainer"],
        "sobre-secundario-contenedor": r["onSecondaryContainer"],
        "marca": marca,
        "sobre-marca": mejor_texto(marca, tarima_texto),
        "error": r["error"],
        "sobre-error": r["onError"],
        "error-contenedor": r["errorContainer"],
        "sobre-error-contenedor": r["onErrorContainer"],
        "error-indicador": PAL["error"][str(INDICADOR_CLARO[nivel]["error"])],
        "exito": ex["color"], "sobre-exito": ex["onColor"],
        "exito-contenedor": ex["container"], "sobre-exito-contenedor": ex["onContainer"],
        "exito-indicador": PAL["verde"][str(INDICADOR_CLARO[nivel]["exito"])],
        "aviso": av["color"], "sobre-aviso": av["onColor"],
        "aviso-contenedor": av["container"], "sobre-aviso-contenedor": av["onContainer"],
        "aviso-indicador": PAL["ambar"][str(INDICADOR_CLARO[nivel]["aviso"])],
        "invertida": r["inverseSurface"],
        "sobre-invertida": r["inverseOnSurface"],
        "velo": r["scrim"],
        # en claro la capa de estado siempre oscurece; sobre el botón principal, aclara (como en
        # oscuro): oscurecer el LED bajaba su texto a 4,45:1
        "capa-estado": r["onSurface"],
        "capa-primario": "#ffffff",
        "grafica-superficie": r["surfaceContainerLow"],
        **{f"grafica-{i + 1}": c for i, c in enumerate(GRAFICA_CLARO)},
        "grafica-diverge-negativo": "#e66767",
        "grafica-diverge-centro": MCU["opciones"][opcion]["paletas"]["neutra"]["87"],
        "grafica-diverge-positivo": "#3987e5",
        "grafica-rejilla": r["outlineVariant"],
    })
    return t

T_CLARO = {n: tokens_claro(ELEGIDA, n) for n in NIVELES}

# ------------------------------------------------------------------ pares que se miden

SUPERFICIES = ["superficie", "superficie-mas-baja", "superficie-baja", "superficie-contenedor", "superficie-alta", "superficie-mas-alta"]
TEXTO = ([("texto", sup) for sup in SUPERFICIES + ["superficie-brillante"]] +
         [("texto-secundario", sup) for sup in SUPERFICIES] +
         [("error", sup) for sup in SUPERFICIES] +
         [("exito", sup) for sup in SUPERFICIES] +
         [("aviso", sup) for sup in SUPERFICIES] +
         [("sobre-primario", "primario"), ("sobre-primario-contenedor", "primario-contenedor"),
          ("sobre-secundario-contenedor", "secundario-contenedor"),
          ("sobre-error", "error"), ("sobre-error-contenedor", "error-contenedor"),
          ("sobre-exito", "exito"), ("sobre-exito-contenedor", "exito-contenedor"),
          ("sobre-aviso", "aviso"), ("sobre-aviso-contenedor", "aviso-contenedor"),
          ("sobre-invertida", "invertida"), ("sobre-marca", "marca")])
GRAFICO = ([(k, sup) for k in ("primario", "foco", "primario-contenedor", "contorno", "marca",
                               "error-indicador", "exito-indicador", "aviso-indicador") for sup in SUPERFICIES])
MINIMO_TEXTO = {"estandar": 4.5, "medio": 4.5, "alto": 7.0}
MINIMO_GRAFICO = 3.0

def comprobar(Tn, excepciones=frozenset()):
    resultados, fallas = {}, []
    for n in NIVELES:
        filas = []
        for tipo, pares, minimo in (("texto", TEXTO, MINIMO_TEXTO[n]), ("gráfico", GRAFICO, MINIMO_GRAFICO)):
            for fg, bg in pares:
                c = contraste(Tn[n][fg], Tn[n][bg])
                filas.append((tipo, fg, bg, Tn[n][fg], Tn[n][bg], round(c, 2), minimo, c >= minimo))
                if c < minimo and (n, fg, bg) not in excepciones:
                    fallas.append(f"{n}: {fg} sobre {bg} = {c:.2f}:1 (mínimo {minimo})")
        for i in range(len(GRAFICA)):
            col = Tn[n][f"grafica-{i + 1}"]
            if contraste(col, Tn[n]["grafica-superficie"]) < 3:
                fallas.append(f"{n}: serie {i + 1} ({col}) bajo 3:1 sobre la superficie de gráficas")
        resultados[n] = filas
    # los tres rojos tienen que distinguirse a simple vista (piso de visión normal de la guía de gráficas: 15)
    sep = {}
    for n in NIVELES:
        sep[n] = {
            "marca vs error-indicador": delta_e(Tn[n]["marca"], Tn[n]["error-indicador"]),
            "marca vs error (texto)": delta_e(Tn[n]["marca"], Tn[n]["error"]),
            "primario-contenedor vs error-contenedor": delta_e(Tn[n]["primario-contenedor"], Tn[n]["error-contenedor"]),
        }
        for k, v in sep[n].items():
            if v < 15:
                fallas.append(f"{n}: separación {k}: ΔE {v:.1f} (mínimo 15)")
    return resultados, fallas, sep

def mezcla(capa, fondo, p):
    """color-mix(in srgb, capa p, fondo): lo que da una capa de estado encima de un relleno."""
    a, b = rgb(capa), rgb(fondo)
    return "#" + "".join(f"{round(x * p + y * (1 - p)):02x}" for x, y in zip(a, b))

def comprobar_boton(Tn):
    """Botón (componentes/boton.css): cada estado con su texto, en los tres niveles."""
    filas, fallas = [], []
    for n in NIVELES:
        t, minimo = Tn[n], MINIMO_TEXTO[n]
        casos = [("primario en reposo", t["sobre-primario-contenedor"], t["primario-contenedor"], minimo)]
        for nombre, p in (("flotante", .08), ("presionado", .10)):
            casos.append((f"primario {nombre}", t["sobre-primario-contenedor"], mezcla(t["capa-primario"], t["primario-contenedor"], p), minimo))
            for sup in SUPERFICIES:
                casos.append((f"secundario/fantasma {nombre} sobre {sup}", t["texto"], mezcla(t["capa-estado"], t[sup], p), minimo))
        for sup in SUPERFICIES:
            casos.append((f"borde del secundario sobre {sup}", t["contorno"], t[sup], MINIMO_GRAFICO))
        for nombre, fg, bg, m in casos:
            c = contraste(fg, bg)
            filas.append((n, nombre, round(c, 2), m))
            if c < m:
                fallas.append(f"{n}: botón {nombre} = {c:.2f}:1 (mínimo {m})")
    return filas, fallas

INFORME = {}
fallas = []
for o in OPCIONES:
    res_o, fallas_o, sep_o = comprobar(TODAS[o])
    INFORME[o] = (res_o, sep_o)
    fallas += [f"[{o}] {f}" for f in fallas_o]
resultados, SEPARACION = INFORME[ELEGIDA][0], INFORME[ELEGIDA][1]["estandar"]
BOTON, fallas_boton = comprobar_boton(T)
fallas += fallas_boton
RESULTADOS_CLARO, fallas_claro, SEP_CLARO = comprobar(T_CLARO, EXCEPCIONES_CLARO)
SEPARACION_CLARO = SEP_CLARO["estandar"]
BOTON_CLARO, fallas_boton_claro = comprobar_boton(T_CLARO)
fallas += [f"[claro] {f}" for f in fallas_claro + fallas_boton_claro]
assert not fallas, "\n".join(fallas)

# ------------------------------------------------------------------ CSS

def bloque(Tn, n, sangria="  "):
    return "\n".join(f"{sangria}--k-{k}: {v};" for k, v in Tn[n].items())

def regla(selector, Tn, n, esquema=None, sangria=""):
    dentro = sangria + "  "
    cuerpo = (f"{dentro}color-scheme: {esquema};\n" if esquema else "") + bloque(Tn, n, dentro)
    return f"{sangria}{selector} {{\n{cuerpo}\n{sangria}}}"

OSCURO_SO = ':root:not([data-tema="claro"])'       # el celular pide oscuro y no se forzó claro
OSCURO_FORZADO = ':root[data-tema="oscuro"]'

css = f"""/* Kovat: sistema de colores. Modo claro y modo oscuro, tres niveles de contraste cada uno.
   Generado por docs/marca/fuente/colores.py a partir de Material Color Utilities (Material 3).
   No editar a mano: cambiar la entrada y volver a generar.

   Reglas:
   1. El texto rojo significa error. El rojo de la marca (primario, marca) va en rellenos e
      indicadores, nunca en texto. Los enlaces van en --k-enlace, subrayados.
   2. Éxito y aviso son solo para estados, siempre con ícono y texto.
   3. Cada "sobre-X" va encima de su "X"; así se garantiza el contraste medido.

   Modo: el del celular (prefers-color-scheme). data-tema="claro" u "oscuro" en <html> lo fuerza;
   la landing, por ejemplo, va siempre en claro.
   Contraste: estándar por defecto. data-contraste="medio" o "alto" en <html> lo cambia, y si la
   persona pidió más contraste en su sistema (prefers-contrast: more) se usa el alto.
   Cada bloque trae todos los tokens: ninguna combinación mezcla valores de dos esquemas. */

/* ------------------------------------------------------------------ claro */

:root {{
  color-scheme: light;
{bloque(T_CLARO, "estandar")}
  /* capas de estado (Material): opacidad del color "sobre" encima de su relleno */
  --k-capa-hover: 0.08;
  --k-capa-foco: 0.10;
  --k-capa-presion: 0.10;
  --k-opacidad-deshabilitado: 0.38;
}}

{regla(':root[data-contraste="medio"]', T_CLARO, "medio")}

{regla(':root[data-contraste="alto"]', T_CLARO, "alto")}

@media (prefers-contrast: more) {{
{regla(':root:not([data-contraste])', T_CLARO, "alto", sangria="  ")}
}}

/* ------------------------------------------------------------------ oscuro, según el celular */

@media (prefers-color-scheme: dark) {{
{regla(OSCURO_SO, T, "estandar", "dark", "  ")}

{regla(OSCURO_SO + '[data-contraste="medio"]', T, "medio", sangria="  ")}

{regla(OSCURO_SO + '[data-contraste="alto"]', T, "alto", sangria="  ")}
}}

@media (prefers-color-scheme: dark) and (prefers-contrast: more) {{
{regla(OSCURO_SO + ':not([data-contraste])', T, "alto", sangria="  ")}
}}

/* ------------------------------------------------------------------ oscuro, forzado */

{regla(OSCURO_FORZADO, T, "estandar", "dark")}

{regla(OSCURO_FORZADO + '[data-contraste="medio"]', T, "medio")}

{regla(OSCURO_FORZADO + '[data-contraste="alto"]', T, "alto")}

@media (prefers-contrast: more) {{
{regla(OSCURO_FORZADO + ':not([data-contraste])', T, "alto", sangria="  ")}
}}
"""
open(os.path.join(SAL, "kovat-colores.css"), "w", encoding="utf-8", newline="\n").write(css)

json.dump({
    "descripcion": "Tokens de color de Kovat. Modo oscuro (niveles) y claro (niveles_claro); tres niveles de contraste cada uno. Generado por colores.py.",
    "reglas": ["El texto rojo significa error; el rojo de la marca va en rellenos e indicadores, nunca en texto.",
               "Éxito y aviso solo para estados, siempre con ícono y texto.",
               "Cada 'sobre-X' va encima de su 'X'."],
    "rol_material": MATERIAL,
    "niveles": T,
    "niveles_claro": T_CLARO,
    "separacion_de_rojos_deltaE": {k: round(v, 1) for k, v in SEPARACION.items()},
    "separacion_de_rojos_deltaE_claro": {k: round(v, 1) for k, v in SEPARACION_CLARO.items()},
    "excepciones_claro": [f"{n}: {fg} sobre {bg}" for n, fg, bg in sorted(EXCEPCIONES_CLARO)],
}, open(os.path.join(SAL, "kovat-colores.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    for n in NIVELES:
        filas = resultados[n]
        peor_t = min((f for f in filas if f[0] == "texto"), key=lambda f: f[5])
        peor_g = min((f for f in filas if f[0] == "gráfico"), key=lambda f: f[5])
        print(f"{n}: {len(filas)} pares, todos cumplen. Peor texto {peor_t[1]} sobre {peor_t[2]} = {peor_t[5]}:1; "
              f"peor gráfico {peor_g[1]} sobre {peor_g[2]} = {peor_g[5]}:1")
    for k, v in SEPARACION.items():
        print(f"separación {k}: ΔE {v:.1f}")
    for n in NIVELES:
        peor = min((f for f in BOTON if f[0] == n), key=lambda f: f[2] / f[3])
        print(f"botón {n}: {sum(1 for f in BOTON if f[0] == n)} casos, todos cumplen; el más justo: {peor[1]} = {peor[2]}:1")
    print("botón, primario en reposo (estándar):", next(f[2] for f in BOTON if f[0] == "estandar" and f[1] == "primario en reposo"))
    print("--- claro ---")
    for n in NIVELES:
        filas = RESULTADOS_CLARO[n]
        peor_t = min((f for f in filas if f[0] == "texto"), key=lambda f: f[5])
        peor_g = min((f for f in filas if f[0] == "gráfico" and (n, f[1], f[2]) not in EXCEPCIONES_CLARO), key=lambda f: f[5])
        print(f"claro {n}: peor texto {peor_t[1]} sobre {peor_t[2]} = {peor_t[5]}:1; peor gráfico {peor_g[1]} sobre {peor_g[2]} = {peor_g[5]}:1")
    for k, v in SEPARACION_CLARO.items():
        print(f"claro, separación {k}: ΔE {v:.1f}")
    for n, fg, bg in sorted(EXCEPCIONES_CLARO):
        c = contraste(T_CLARO[n][fg], T_CLARO[n][bg])
        print(f"claro, excepción aceptada: {n} {fg} sobre {bg} = {c:.2f}:1 (el botón se identifica por su texto)")
