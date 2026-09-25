"""Cuatro animaciones de más impacto: barajado, acercamiento, desarme e implosión.

Mismas reglas que build.py: CSS dentro del SVG, sin JavaScript, orden determinista (el azar usa
una semilla fija), solo opacidad y transformaciones. Cada intro se comprueba al generarla: su
último cuadro tiene que ser exactamente el logo fijo.
"""
import math, random
import gen
import build as B

H, S = gen.H, gen.SPEC
VW, VH, ESC, OX, OY = B.VW, B.VH, B.ESC, B.OX, B.OY
EASE_ON, EASE_OFF = B.EASE_ON, B.EASE_OFF
CAIDA = "cubic-bezier(0.55, 0.085, 0.68, 0.53)"      # aceleración de la gravedad
SUCCION = "cubic-bezier(0.6, 0.04, 0.98, 0.335)"     # entra cada vez más rápido

def dp(p):
    return B.d_path(p, ESC, OX, OY)

def a_px(x, y):
    return OX + x * ESC, OY + y * ESC

def kf(nombre, total, pasos):
    """pasos: [(t, {prop: valor}, curva_hasta_el_siguiente)]. Todas las props en todos los pasos."""
    pasos = sorted(pasos, key=lambda p: p[0])
    assert abs(pasos[0][0]) < 1e-9 and abs(pasos[-1][0] - total) < 1e-9, nombre
    claves = set(pasos[0][1])
    cuerpo = []
    ultimo = -1.0
    for t, props, curva in pasos:
        assert set(props) == claves, nombre
        p = t / total * 100
        assert p > ultimo + 1e-6, f"{nombre}: tiempos repetidos"
        ultimo = p
        txt = ";".join(f"{k}:{v}" for k, v in props.items())
        if curva:
            txt += f";animation-timing-function:{curva}"
        cuerpo.append(f"{p:.3f}%{{{txt}}}")
    return f"@keyframes {nombre}{{{' '.join(cuerpo)}}}"

def escena(titulo, total, css, cuerpo):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}" width="{VW}" height="{VH}" role="img" aria-labelledby="t">
<title id="t">{titulo}</title>
<style>
.v,.f,.m{{animation-duration:{total}s;animation-fill-mode:both;animation-timing-function:linear}}
.m{{transform-box:fill-box;transform-origin:center}}
{chr(10).join(css)}
</style>
<rect width="{VW}" height="{VH}" fill="{B.COL['tarima']}"/>
{cuerpo}
</svg>
"""

LOGO_D = sorted(dp(p) for p in B.SEGS)

def comprobar_final(nombre, finales):
    """finales: d de los paths que terminan encendidos y sin transformar."""
    assert sorted(finales) == LOGO_D, f"{nombre}: el último cuadro no es el logo fijo"

POS = gen.posiciones()
LETRAS = dict((n, segs) for n, segs in B.letras)
archivos = []

# ------------------------------------------------------------------ 1. intro: barajado
# Cada letra es una celda de 7 segmentos que pasa por números, como un marcador calculando, y se
# fija en su letra de izquierda a derecha. La O y la A salen de la celda misma; en la K, la V y la
# T la celda se apaga y aparece la letra dibujada.
TOTAL = 2.50
INICIO, PASO, CAMBIO = 0.35, 0.075, 0.04
FIJA = [0.95 + i * 0.24 for i in range(5)]
rnd = random.Random(2026)
css, fantasmas, vivos, finales = [], [], [], []
n = 0
for (nombre, x, w), t_fija in zip(POS, FIJA):
    cel = {k: gen.mover(p, x) for k, p in gen.celda(w, S["s"], S["g"]).items()}
    # Secuencia de números. Límite de destellos (WCAG 2.3.1): ningún segmento cambia de estado
    # más de 6 veces (3 destellos) en cualquier segundo. Se reserva un cambio para el momento en
    # que la letra se fija, así que el barajado usa hasta 5. Si ningún número cumple, se sostiene.
    glifos, previo, t = [], None, INICIO
    cambios_seg = {k: [] for k in "abcdefg"}
    encendidos = set()
    while t < t_fija - 1e-9:
        candidatos = [c for c in "0123456789" if c != previo]
        rnd.shuffle(candidatos)
        for g in candidatos:
            cambian = set(gen.DIGITOS[g]) ^ encendidos
            if all(sum(1 for tc in cambios_seg[k] if tc > t - 1.0) + 1 <= 5 for k in cambian):
                for k in cambian:
                    cambios_seg[k].append(t)
                encendidos = set(gen.DIGITOS[g])
                glifos.append((t, g)); previo = g
                break
        t += PASO
    final = gen.DIGITOS.get(nombre, "")          # O y A terminan como glifo de la celda
    for k, p in cel.items():
        estado, cambios = 0, []
        for tg, g in glifos + [(t_fija, None)]:
            nuevo = (1 if k in final else 0) if g is None else (1 if k in gen.DIGITOS[g] else 0)
            if nuevo != estado:
                cambios.append((tg, CAMBIO if g else 0.10, nuevo, EASE_ON if nuevo else EASE_OFF))
                estado = nuevo
        css.append(B.keyframes(f"s{n}", TOTAL, 0, cambios))
        vivos.append(f'<path class="v" style="animation-name:s{n}" d="{dp(p)}"/>')
        if estado == 1:
            finales.append(dp(p))
        n += 1
    # fantasma de la celda ("8" apagado): entra al principio y se va cuando la letra se fija
    css.append(B.keyframes(f"f{nombre}", TOTAL, 0, [(0.0, 0.30, 1, EASE_ON), (t_fija, 0.15, 0, EASE_OFF)]))
    fantasmas.append(f'<g class="f" style="animation-name:f{nombre}">'
                     + "".join(f'<path d="{dp(p)}"/>' for p in cel.values()) + "</g>")
    if nombre in "KVT":
        for p in LETRAS[nombre]:
            css.append(B.keyframes(f"s{n}", TOTAL, 0, [(t_fija + 0.04, 0.12, 1, EASE_ON)]))
            vivos.append(f'<path class="v" style="animation-name:s{n}" d="{dp(p)}"/>')
            finales.append(dp(p))
            n += 1
comprobar_final("barajado", finales)
cuerpo = (f'<g fill="{B.COL["apagado"]}">{"".join(fantasmas)}</g>'
          f'<g fill="{B.COL["led"]}">{"".join(vivos)}</g>')
archivos.append(B.escribir("kovat-intro-barajado.svg",
                           escena("Kovat, intro: barajado", TOTAL, css, cuerpo)))

# ------------------------------------------------------------------ 2. intro: acercamiento
# La cámara arranca pegada a la esquina superior izquierda de la O: la pantalla es roja, partida
# por la diagonal del inglete. Se aleja hasta mostrar la palabra, que se enciende a su paso.
TOTAL = 2.60
S0 = 18.0
T0, T1 = 0.55, 2.05
_, xo, _ = POS[1]
C = a_px(xo + S["s"] / 2, S["s"] / 2)             # centro del corte a inglete
M = (VW / 2, VH / 2)
pasos_cam = []
MUESTRAS = 32
def cam(e):
    s = S0 ** (1 - e)                              # zoom en escala logarítmica: velocidad pareja
    px, py = (1 - e) * M[0] + e * C[0], (1 - e) * M[1] + e * C[1]
    tx, ty = px - s * C[0], py - s * C[1]
    return f"translate({tx:.2f}px,{ty:.2f}px) scale({s:.5f})"
pasos_cam.append((0.0, {"transform": cam(0)}, None))
pasos_cam.append((T0, {"transform": cam(0)}, None))
for i in range(1, MUESTRAS + 1):
    u = i / MUESTRAS
    e = 1 - (1 - u) ** 3                           # sale rápido y se asienta despacio
    pasos_cam.append((T0 + u * (T1 - T0), {"transform": cam(e)}, None))
pasos_cam[-1] = (T1, {"transform": "none"}, None)
pasos_cam.append((TOTAL, {"transform": "none"}, None))
css = [kf("camara", TOTAL, pasos_cam)]
cel_o = {k: gen.mover(p, xo) for k, p in gen.celda(POS[1][2], S["s"], S["g"]).items()}
esquina = [dp(cel_o["a"]), dp(cel_o["f"])]
Cl = ((C[0] - OX) / ESC, (C[1] - OY) / ESC)
dmax = max(math.dist(B.centro(p), Cl) for p in B.SEGS)
vivos, finales = [], []
for i, p in enumerate(B.SEGS):
    if dp(p) in esquina:
        cambios = [(0.15, 0.25, 1, EASE_ON)]
    else:
        cambios = [(0.75 + math.dist(B.centro(p), Cl) / dmax * 0.90, 0.22, 1, EASE_ON)]
    css.append(B.keyframes(f"s{i}", TOTAL, 0, cambios))
    vivos.append(f'<path class="v" style="animation-name:s{i}" d="{dp(p)}"/>')
    finales.append(dp(p))
css.append(B.keyframes("fantasma", TOTAL, 0, [(0.55, 0.40, 1, EASE_ON), (2.10, 0.45, 0, EASE_OFF)]))
comprobar_final("acercamiento", finales)
cuerpo = (f'<g class="v" style="animation-name:camara;transform-origin:0 0">'
          f'<g class="f" style="animation-name:fantasma" fill="{B.COL["apagado"]}">'
          + "".join(f'<path d="{dp(p)}"/>' for p in B.SEGS) + "</g>"
          f'<g fill="{B.COL["led"]}">{"".join(vivos)}</g></g>')
archivos.append(B.escribir("kovat-intro-acercamiento.svg",
                           escena("Kovat, intro: acercamiento", TOTAL, css, cuerpo)))

# ------------------------------------------------------------------ 3. outro: desarme
# Los segmentos se sueltan de izquierda a derecha y caen con gravedad, girando un poco.
TOTAL = 2.00
rnd = random.Random(7)
xs = [B.centro(p)[0] for p in B.SEGS]
x0, x1 = min(xs), max(xs)
css, vivos = [], []
for i, p in enumerate(B.SEGS):
    t = 0.25 + (B.centro(p)[0] - x0) / (x1 - x0) * 0.70
    giro = (1 if i % 2 else -1) * rnd.uniform(9, 26)
    deriva = rnd.uniform(-30, 30)
    caida = VH - a_px(0, B.centro(p)[1])[1] + 260      # hasta salir de cuadro por abajo
    pasos = [
        (0.0, {"transform": "none", "opacity": "1"}, None),
        (t, {"transform": "none", "opacity": "1"}, CAIDA),
        (t + 0.62, {"transform": f"translate({deriva * 0.6:.1f}px,{caida * 0.55:.1f}px) rotate({giro * 0.6:.1f}deg)", "opacity": "1"}, "linear"),
        (t + 0.95, {"transform": f"translate({deriva:.1f}px,{caida:.1f}px) rotate({giro:.1f}deg)", "opacity": "0"}, None),
        (TOTAL, {"transform": f"translate({deriva:.1f}px,{caida:.1f}px) rotate({giro:.1f}deg)", "opacity": "0"}, None),
    ]
    assert t + 0.95 < TOTAL
    css.append(kf(f"s{i}", TOTAL, pasos))
    vivos.append(f'<path class="v m" style="animation-name:s{i}" d="{dp(p)}"/>')
cuerpo = f'<g fill="{B.COL["led"]}">{"".join(vivos)}</g>'
archivos.append(B.escribir("kovat-outro-desarme.svg", escena("Kovat, outro: desarme", TOTAL, css, cuerpo)))

# ------------------------------------------------------------------ 4. outro: implosión
# Todas las piezas son absorbidas por el cero; al final el cero se cierra sobre su centro.
TOTAL = 1.85
_, xo, wo = POS[1]
CO = (xo + wo / 2, H / 2)
css, vivos = [], []
resto = [(n, p) for n, segs in B.letras for p in segs]
dmax = max(math.dist(B.centro(p), CO) for n, p in resto if n != "O")
for i, (nombre, p) in enumerate(resto):
    cx, cy = B.centro(p)
    if nombre == "O":
        dx, dy = (CO[0] - cx) * ESC, (CO[1] - cy) * ESC
        pasos = [
            (0.0, {"transform": "none", "opacity": "1"}, None),
            (1.05, {"transform": "none", "opacity": "1"}, SUCCION),
            (1.45, {"transform": f"translate({dx:.1f}px,{dy:.1f}px) scale(0.05)", "opacity": "0"}, None),
            (TOTAL, {"transform": f"translate({dx:.1f}px,{dy:.1f}px) scale(0.05)", "opacity": "0"}, None),
        ]
    else:
        lej = math.dist((cx, cy), CO) / dmax
        t = 0.25 + (1 - lej) * 0.35
        dx, dy = (CO[0] - cx) * ESC, (CO[1] - cy) * ESC
        pasos = [
            (0.0, {"transform": "none", "opacity": "1"}, None),
            (t, {"transform": "none", "opacity": "1"}, SUCCION),
            (t + 0.50, {"transform": f"translate({dx:.1f}px,{dy:.1f}px) scale(0.08)", "opacity": "0"}, None),
            (TOTAL, {"transform": f"translate({dx:.1f}px,{dy:.1f}px) scale(0.08)", "opacity": "0"}, None),
        ]
    css.append(kf(f"s{i}", TOTAL, pasos))
    vivos.append(f'<path class="v m" style="animation-name:s{i}" d="{dp(p)}"/>')
cuerpo = f'<g fill="{B.COL["led"]}">{"".join(vivos)}</g>'
archivos.append(B.escribir("kovat-outro-implosion.svg", escena("Kovat, outro: implosión", TOTAL, css, cuerpo)))

if __name__ == "__main__":
    import os
    for a in archivos:
        print(os.path.basename(a), os.path.getsize(a), "bytes")
