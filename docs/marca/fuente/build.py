"""Produce los archivos finales del logotipo de Kovat: SVG fijos y cuatro animaciones.

Las animaciones son CSS dentro del propio SVG (sin JavaScript): funcionan al abrir el archivo,
como <img> en una web y en cualquier navegador moderno. Solo se anima la opacidad.
"""
import os, math
import gen

SAL = os.path.dirname(gen.OUT)  # docs/marca

COL = {
    "tarima": "#110E0D",
    "led": "#F0402A",
    "tiza": "#EFEBE7",
    "tinta": "#161212",
    "apagado": "#2A2120",
}
EASE_ON = "cubic-bezier(0.2, 0.7, 0.2, 1)"
EASE_OFF = "cubic-bezier(0.4, 0, 0.2, 1)"

# ------------------------------------------------------------------ utilidades

def fmt(v): return f"{v:.2f}".rstrip("0").rstrip(".")

def d_path(p, esc=1.0, ox=0.0, oy=0.0):
    return "M" + " ".join(f"{fmt(ox + x * esc)} {fmt(oy + y * esc)}" for x, y in p) + "Z"

def centro(p):
    xs = [x for x, _ in p]; ys = [y for _, y in p]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2

def escribir(nombre, contenido):
    ruta = os.path.join(SAL, nombre)
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        f.write(contenido)
    return ruta

# ------------------------------------------------------------------ fijos

def svg_fijo(segs, ancho, alto, color, titulo="Kovat", fondo=None, esc=1.0, ox=0.0, oy=0.0):
    bg = f'<rect width="{fmt(ancho)}" height="{fmt(alto)}" fill="{fondo}"/>' if fondo else ""
    paths = "".join(f'<path d="{d_path(p, esc, ox, oy)}"/>' for p in segs)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(ancho)} {fmt(alto)}" '
            f'width="{fmt(ancho)}" height="{fmt(alto)}" role="img" aria-labelledby="t">'
            f'<title id="t">{titulo}</title>{bg}<g fill="{color}">{paths}</g></svg>\n')

letras, ANCHO = gen.palabra()
SEGS = [p for _, segs in letras for p in segs]
S = gen.SPEC
K_SEGS = gen.letra_K(S["anchos"][0], S["s"], S["g"], S["sd"])
K_W = S["anchos"][0]

archivos = []
for nombre, color in (("rojo", COL["led"]), ("blanco", COL["tiza"]), ("negro", COL["tinta"])):
    archivos.append(escribir(f"kovat-logo-{nombre}.svg", svg_fijo(SEGS, ANCHO, gen.H, color)))
    archivos.append(escribir(f"kovat-simbolo-{nombre}.svg", svg_fijo(K_SEGS, K_W, gen.H, color, "Kovat, símbolo")))

def icono(lado, alto_k, nombre, titulo):
    esc = alto_k / gen.H
    ox, oy = (lado - K_W * esc) / 2, (lado - alto_k) / 2
    return escribir(nombre, svg_fijo(K_SEGS, lado, lado, COL["led"], titulo, COL["tarima"], esc, ox, oy))

# ícono de app: la K cabe holgada en la zona segura de los íconos adaptables (círculo de radio 0,4)
LADO, ALTO_K = 512, 250
semi_diag = math.hypot(K_W * ALTO_K / gen.H / 2, ALTO_K / 2)
assert semi_diag < 0.4 * LADO, "la K se sale de la zona segura"
archivos.append(icono(LADO, ALTO_K, "kovat-icono-app.svg", "Kovat"))
archivos.append(icono(512, 380, "kovat-favicon.svg", "Kovat"))

# ------------------------------------------------------------------ animaciones

VW, VH = 1920, 1080
ANCHO_LOGO = 1120
ESC = ANCHO_LOGO / ANCHO
OX, OY = (VW - ANCHO_LOGO) / 2, (VH - gen.H * ESC) / 2

def keyframes(nombre, total, inicial, cambios):
    """cambios: lista de (t_inicio, duración, opacidad_final, curva). Los tramos no se solapan."""
    pct = lambda t: max(0.0, min(100.0, t / total * 100))
    kf = [(0.0, inicial, None)]
    valor = inicial
    for t0, dur, v, curva in sorted(cambios):
        a, b = pct(t0), pct(t0 + dur)
        if a <= kf[-1][0] + 1e-6:
            kf[-1] = (kf[-1][0], kf[-1][1], curva)  # arranca en el mismo instante
        else:
            kf.append((a, valor, curva))
        kf.append((b, v, None))
        valor = v
    if kf[-1][0] < 100:
        kf.append((100.0, valor, None))
    cuerpo = " ".join(
        f"{p:.3f}%{{opacity:{fmt(o)}" + (f";animation-timing-function:{c}" if c else "") + "}"
        for p, o, c in kf)
    return f"@keyframes {nombre}{{{cuerpo}}}"

def svg_animado(titulo, total, capas, extra_fantasma=()):
    """capas: lista de (poligono, inicial, cambios) para los segmentos encendidos.
    El fantasma (segmentos apagados) se enciende al principio y se retira al final."""
    css, fantasmas, vivos = [], [], []
    for i, (p, ini, cambios) in enumerate(capas):
        css.append(keyframes(f"s{i}", total, ini, cambios))
        vivos.append(f'<path class="v" style="animation-name:s{i}" d="{d_path(p, ESC, OX, OY)}"/>')
    for p in [c[0] for c in capas] + list(extra_fantasma):
        fantasmas.append(f'<path d="{d_path(p, ESC, OX, OY)}"/>')
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}" width="{VW}" height="{VH}" role="img" aria-labelledby="t">
<title id="t">{titulo}</title>
<style>
.v,.f{{animation-duration:{total}s;animation-fill-mode:both;animation-timing-function:linear}}
.f{{animation-name:fantasma}}
{keyframes("fantasma", total, 0, FANTASMA)}
{chr(10).join(css)}
</style>
<rect width="{VW}" height="{VH}" fill="{COL['tarima']}"/>
<g class="f" fill="{COL['apagado']}">{"".join(fantasmas)}</g>
<g fill="{COL['led']}">{"".join(vivos)}</g>
</svg>
"""

cx_all = [centro(p)[0] for p in SEGS]
xmin, xmax = min(cx_all), max(cx_all)
frac = lambda p: (centro(p)[0] - xmin) / (xmax - xmin)   # 0 a la izquierda, 1 a la derecha

ON, OFF = 0.22, 0.20  # duración de encender y de apagar un segmento

# --- intro 1: encendido de izquierda a derecha
TOTAL = 1.90
FANTASMA = [(0.00, 0.40, 1, EASE_ON), (1.40, 0.45, 0, EASE_OFF)]
capas = [(p, 0, [(0.35 + frac(p) * 0.70, ON, 1, EASE_ON)]) for p in SEGS]
archivos.append(escribir("kovat-intro-encendido.svg", svg_animado("Kovat, intro: encendido", TOTAL, capas)))

# --- intro 2: cuenta regresiva en la O (3, 2, 1, 0) y el resto se enciende desde el cero
O_IDX = [n for n, _ in letras].index("O")
x_o = sum(S["anchos"][:O_IDX]) + S["track"] * O_IDX
cel = {k: gen.mover(p, x_o) for k, p in gen.celda(S["anchos"][O_IDX], S["s"], S["g"]).items()}
DIG_T = [("3", 0.45), ("2", 0.95), ("1", 1.45), ("0", 1.95)]   # una intro no pasa de 3 s
CAMBIO = 0.12
TOTAL = 2.95
FANTASMA = [(0.00, 0.40, 1, EASE_ON), (2.45, 0.45, 0, EASE_OFF)]
capas = []
for k, p in cel.items():
    estado, cambios = 0, []
    for dig, t in DIG_T:
        nuevo = 1 if k in gen.DIGITOS[dig] else 0
        if nuevo != estado:
            cambios.append((t, CAMBIO, nuevo, EASE_ON if nuevo else EASE_OFF))
            estado = nuevo
    capas.append((p, 0, cambios))
cx_o = x_o + S["anchos"][O_IDX] / 2
resto = [p for n, segs in letras if n != "O" for p in segs]
dmax = max(abs(centro(p)[0] - cx_o) for p in resto)
for p in resto:
    capas.append((p, 0, [(1.95 + abs(centro(p)[0] - cx_o) / dmax * 0.45, ON, 1, EASE_ON)]))
# la O final no usa la barra central: su fantasma sale con el resto del fantasma
archivos.append(escribir("kovat-intro-cuenta-regresiva.svg",
                         svg_animado("Kovat, intro: cuenta regresiva", TOTAL, capas)))

# --- outro 1: apagado de derecha a izquierda
TOTAL = 1.85
FANTASMA = [(0.00, 0.25, 1, EASE_ON), (1.35, 0.45, 0, EASE_OFF)]
capas = [(p, 1, [(0.30 + (1 - frac(p)) * 0.70, OFF, 0, EASE_OFF)]) for p in SEGS]
archivos.append(escribir("kovat-outro-apagado.svg", svg_animado("Kovat, outro: apagado", TOTAL, capas)))

# --- outro 2: las letras se apagan hacia la O, la O queda sola un instante y se apaga
TOTAL = 2.10
FANTASMA = [(0.00, 0.25, 1, EASE_ON), (1.60, 0.45, 0, EASE_OFF)]
capas = []
for n, segs in letras:
    for p in segs:
        if n == "O":
            capas.append((p, 1, [(1.25, 0.25, 0, EASE_OFF)]))
        else:
            lejania = abs(centro(p)[0] - cx_o) / dmax
            capas.append((p, 1, [(0.30 + (1 - lejania) * 0.45, OFF, 0, EASE_OFF)]))
archivos.append(escribir("kovat-outro-al-cero.svg", svg_animado("Kovat, outro: al cero", TOTAL, capas)))

for a in archivos:
    print(os.path.basename(a), os.path.getsize(a), "bytes")
