"""Animaciones alusivas al box: el 21-15-9, soltar la barra y el cero del cronómetro cargando.

No usan la palabra de la marca registrada ajena; usan lo que cualquier atleta de box reconoce.
Mismas reglas que build.py y wow.py.
"""
import math
import gen
import build as B
import wow as W

H, S = gen.H, gen.SPEC
EASE_ON, EASE_OFF = B.EASE_ON, B.EASE_OFF
SUBE = "cubic-bezier(0.25, 0.46, 0.45, 0.94)"   # desacelera al subir
CAE = "cubic-bezier(0.55, 0.085, 0.68, 0.53)"   # acelera al caer
POS = gen.posiciones()
archivos = []

def celdas():
    return [(n, {k: gen.mover(p, x) for k, p in gen.celda(w, S["s"], S["g"]).items()}) for n, x, w in POS]

# ------------------------------------------------------------------ intro: 21-15-9
# El marcador muestra las repeticiones del esquema más conocido del box, 21, 15 y 9, y se fija
# en KOVAT de izquierda a derecha.
TOTAL = 2.90
NUMEROS = [(0.35, {1: "2", 2: "1"}), (0.95, {1: "1", 2: "5"}), (1.55, {2: "9"})]
FIJA = [2.05 + i * 0.09 for i in range(5)]
CAMBIO = 0.08
css, fantasmas, vivos, finales = [], [], [], []
n = 0
for i, ((nombre, cel), t_fija) in enumerate(zip(celdas(), FIJA)):
    final = gen.DIGITOS.get(nombre, "")
    for k, p in cel.items():
        estado, cambios = 0, []
        for t, mapa in NUMEROS + [(t_fija, None)]:
            if mapa is None:
                nuevo = 1 if k in final else 0
            else:
                nuevo = 1 if (i in mapa and k in gen.DIGITOS[mapa[i]]) else 0
            if nuevo != estado:
                cambios.append((t, CAMBIO, nuevo, EASE_ON if nuevo else EASE_OFF))
                estado = nuevo
        css.append(B.keyframes(f"s{n}", TOTAL, 0, cambios))
        vivos.append(f'<path class="v" style="animation-name:s{n}" d="{W.dp(p)}"/>')
        if estado:
            finales.append(W.dp(p))
        n += 1
    css.append(B.keyframes(f"f{nombre}", TOTAL, 0, [(0.0, 0.30, 1, EASE_ON), (t_fija, 0.15, 0, EASE_OFF)]))
    fantasmas.append(f'<g class="f" style="animation-name:f{nombre}">'
                     + "".join(f'<path d="{W.dp(p)}"/>' for p in cel.values()) + "</g>")
    if nombre in "KVT":
        for p in W.LETRAS[nombre]:
            css.append(B.keyframes(f"s{n}", TOTAL, 0, [(t_fija + 0.04, 0.14, 1, EASE_ON)]))
            vivos.append(f'<path class="v" style="animation-name:s{n}" d="{W.dp(p)}"/>')
            finales.append(W.dp(p))
            n += 1
W.comprobar_final("21-15-9", finales)
cuerpo = (f'<g fill="{B.COL["apagado"]}">{"".join(fantasmas)}</g>'
          f'<g fill="{B.COL["led"]}">{"".join(vivos)}</g>')
archivos.append(B.escribir("kovat-intro-21-15-9.svg", W.escena("Kovat, intro: 21-15-9", TOTAL, css, cuerpo)))

# ------------------------------------------------------------------ outro: suelta la barra
# La marca es la barra: sostiene arriba como esperando el "abajo" del juez, toma impulso, cae
# con gravedad, se aplasta un poco al tocar el piso, rebota como un disco de caucho y se apaga.
TOTAL = 2.10
PISO = 330.0                       # px que cae
tr = lambda y, sx=1.0, sy=1.0: f"translate(0px,{y:.1f}px) scale({sx:.3f},{sy:.3f})"
pasos = [
    (0.00, {"transform": tr(0)}, None),
    (0.25, {"transform": tr(0)}, SUBE),                 # sostiene la posición
    (0.38, {"transform": tr(-14)}, CAE),                # impulso hacia arriba antes de soltar
    (0.78, {"transform": tr(PISO, 0.985, 1.02)}, "ease-out"),  # cae y se estira apenas
    (0.83, {"transform": tr(PISO, 1.03, 0.90)}, "ease-out"),   # aplasta al tocar el piso
    (0.89, {"transform": tr(PISO)}, SUBE),
    (1.03, {"transform": tr(PISO - 42)}, CAE),          # rebote de disco de caucho
    (1.17, {"transform": tr(PISO, 1.012, 0.965)}, "ease-out"),
    (1.22, {"transform": tr(PISO)}, SUBE),
    (1.28, {"transform": tr(PISO - 7)}, CAE),           # segundo rebote, mínimo
    (1.34, {"transform": tr(PISO)}, None),
    (TOTAL, {"transform": tr(PISO)}, None),
]
css = [W.kf("barra", TOTAL, pasos)]
cx = sum(B.centro(p)[0] for p in B.SEGS) / len(B.SEGS)
dx = max(abs(B.centro(p)[0] - cx) for p in B.SEGS)
vivos = []
for i, p in enumerate(B.SEGS):
    t = 1.45 + abs(B.centro(p)[0] - cx) / dx * 0.30     # se apaga del centro hacia los lados
    css.append(B.keyframes(f"s{i}", TOTAL, 1, [(t, 0.20, 0, EASE_OFF)]))
    vivos.append(f'<path class="v" style="animation-name:s{i}" d="{W.dp(p)}"/>')
cuerpo = (f'<g class="v m" style="animation-name:barra;transform-origin:50% 100%" fill="{B.COL["led"]}">'
          f'{"".join(vivos)}</g>')
archivos.append(B.escribir("kovat-outro-suelta-la-barra.svg",
                           W.escena("Kovat, outro: suelta la barra", TOTAL, css, cuerpo)))

# ------------------------------------------------------------------ loop: cargando
# La O es el cero del cronómetro: una luz le da la vuelta mientras el resto de la marca queda
# fija. Ciclo de 1,2 s que se repite sin salto.
CICLO = 1.20
_, xo, wo = POS[1]
cel_o = {k: gen.mover(p, xo) for k, p in gen.celda(wo, S["s"], S["g"]).items()}
ORDEN = "abcdef"                                     # sentido de las agujas del reloj
css = ["@keyframes vuelta{0%{opacity:1;animation-timing-function:cubic-bezier(0.2, 0.7, 0.2, 1)}"
       "55%{opacity:0.12} 100%{opacity:0.12}}"]
fijos, giran, fantasma = [], [], []
for nombre, segs in B.letras:
    if nombre != "O":
        fijos += [f'<path d="{W.dp(p)}"/>' for p in segs]
for j, k in enumerate(ORDEN):
    retraso = j * CICLO / len(ORDEN) - CICLO
    giran.append(f'<path class="g" style="animation-delay:{retraso:.3f}s" d="{W.dp(cel_o[k])}"/>')
    fantasma.append(f'<path d="{W.dp(cel_o[k])}"/>')
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {B.VW} {B.VH}" width="{B.VW}" height="{B.VH}" role="img" aria-labelledby="t">
<title id="t">Kovat, cargando</title>
<style>
.g{{animation:vuelta {CICLO}s linear infinite both}}
{css[0]}
</style>
<rect width="{B.VW}" height="{B.VH}" fill="{B.COL['tarima']}"/>
<g fill="{B.COL['apagado']}">{"".join(fantasma)}</g>
<g fill="{B.COL['led']}">{"".join(fijos)}{"".join(giran)}</g>
</svg>
"""
archivos.append(B.escribir("kovat-loop-cargando.svg", svg))

if __name__ == "__main__":
    import os
    for a in archivos:
        print(os.path.basename(a), os.path.getsize(a), "bytes")
