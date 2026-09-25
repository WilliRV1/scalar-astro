"""Generador del logotipo de Kovat, dirección "Marcador".

KOVAT se escribe con segmentos, como las letras del marcador de una final. Cada segmento es un
polígono independiente (un <path> por segmento), para que la marca pueda encenderse y apagarse
segmento a segmento. Sin máscaras: el SVG es un vector limpio.

Unidades: altura de mayúscula H = 100, y hacia abajo.
"""
import math, os

H = 100.0
OUT = os.path.dirname(os.path.abspath(__file__))
R2 = math.sqrt(2)

# ------------------------------------------------------------------ geometría

def clip(poly, a, b, c):
    """Conserva la parte del polígono donde a*x + b*y + c >= 0 (Sutherland-Hodgman)."""
    out = []
    n = len(poly)
    for i in range(n):
        P, Q = poly[i], poly[(i + 1) % n]
        fp = a * P[0] + b * P[1] + c
        fq = a * Q[0] + b * Q[1] + c
        if fp >= 0:
            out.append(P)
        if (fp >= 0) != (fq >= 0):
            t = fp / (fp - fq)
            out.append((P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])))
    return out

def x_ge(p, v): return clip(p, 1, 0, -v)
def x_le(p, v): return clip(p, -1, 0, v)
def y_ge(p, v): return clip(p, 0, 1, -v)
def y_le(p, v): return clip(p, 0, -1, v)


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

def banda(P0, P1, w, ext=400):
    dx, dy = P1[0] - P0[0], P1[1] - P0[1]
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = -uy * w / 2, ux * w / 2
    A = (P0[0] - ux * ext, P0[1] - uy * ext)
    B = (P1[0] + ux * ext, P1[1] + uy * ext)
    return [(A[0] + nx, A[1] + ny), (B[0] + nx, B[1] + ny),
            (B[0] - nx, B[1] - ny), (A[0] - nx, A[1] - ny)]

def espejo_x(p, W): return [(W - x, y) for x, y in p][::-1]
def espejo_y(p): return [(x, H - y) for x, y in p][::-1]
def mover(p, dx, dy=0.0): return [(x + dx, y + dy) for x, y in p]

def punta_abajo(p, xc, y_tip):
    """Termina un segmento vertical en punta hacia abajo: y <= y_tip - |x - xc|."""
    p = clip(p, -1, -1, y_tip + xc)
    return clip(p, 1, -1, y_tip - xc)

def punta_arriba(p, xc, y_tip):
    """Empieza un segmento vertical en punta hacia arriba: y >= y_tip + |x - xc|."""
    p = clip(p, -1, 1, xc - y_tip)
    return clip(p, 1, 1, -y_tip - xc)

def partir_vertical(p, xc, g):
    """Parte un vertical a media altura con la unión en punta de un display LED."""
    d = g / 2  # punta contra punta: el hueco entre las dos puntas mide exactamente g
    return [punta_abajo(p, xc, H / 2 - d), punta_arriba(p, xc, H / 2 + d)]

def media_diag(sd, alto, corrido):
    return (sd / 2) / math.sin(math.atan2(alto, corrido))

# ------------------------------------------------------------------ letras

def celda(W, s, g):
    """Celda de display de 7 segmentos: a arriba, b/c derecha, d abajo, e/f izquierda, g centro.
    Esquinas a inglete; los verticales se parten en punta a media altura y la barra central
    termina en punta, con el mismo hueco perpendicular g en todas las uniones."""
    h = g / 2 * R2
    dd = g / R2
    a = [(0, 0), (W, 0), (W - s, s), (s, s)]
    a = clip(a, 1, -1, -h)
    a = clip(a, -1, -1, W - h)
    dseg = espejo_y(a)
    izq = [(0, 0), (s, s), (s, H - s), (0, H)]
    izq = clip(izq, -1, 1, -h)
    izq = clip(izq, -1, -1, H - h)
    f, e = partir_vertical(izq, s / 2, g)
    der = espejo_x(izq, W)
    b, c = partir_vertical(der, W - s / 2, g)
    # punta de la barra central: sus bordes a 45° quedan a distancia g de las puntas de los
    # verticales, que están a g/2 de la media altura -> xt = eje + g*sqrt(2) - g/2
    xt = s / 2 + g * R2 - g / 2
    gseg = rect(0, H / 2 - s / 2, W, H / 2 + s / 2)
    gseg = clip(gseg, 1, -1, -xt + H / 2)
    gseg = clip(gseg, 1, 1, -xt - H / 2)
    gseg = clip(gseg, -1, -1, W - xt + H / 2)
    gseg = clip(gseg, -1, 1, W - xt - H / 2)
    return {"a": a, "b": b, "c": c, "d": dseg, "e": e, "f": f, "g": gseg}

DIGITOS = {"0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd",
           "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg", "O": "abcdef", "A": "abcefg"}

def marco(W, s, g):
    cel = celda(W, s, g)
    return [cel[k] for k in DIGITOS["O"]]

def letra_A7(W, s, g):
    cel = celda(W, s, g)
    return [cel[k] for k in DIGITOS["A"]]

def letra_K(W, s, g, sd):
    asta = partir_vertical(rect(0, 0, s, H), s / 2, g)
    hw = sd / 2
    for _ in range(40):
        xj, xt = s + g + hw, W - hw
        hw = media_diag(sd, H / 2, xt - xj)
    J = (xj, H / 2)
    sup = banda(J, (xt, 0), sd)
    sup = y_le(y_ge(x_ge(sup, s + g), 0), H / 2 - g / 2)
    inf = banda(J, (xt, H), sd)
    inf = y_ge(y_le(x_ge(inf, s + g), H), H / 2 + g / 2)
    return asta + [sup, inf]

def _pierna(W, g, sd):
    """Pierna izquierda de la V: de arriba a la izquierda hasta la base central."""
    hw = sd / 2
    for _ in range(40):
        hw = media_diag(sd, H, W / 2 - hw)
    P0, P1 = (hw, 0.0), (W / 2, H)
    p = x_le(x_ge(y_le(y_ge(banda(P0, P1, sd), 0), H), 0), W / 2 - g / 2)
    return p, P0, P1

def letra_V(W, s, g, sd):
    p, _, _ = _pierna(W, g, sd)
    return [p, espejo_x(p, W)]


def letra_T(W, s, g):
    barra = rect(0, 0, W, s)
    asta = rect(W / 2 - s / 2, s + g, W / 2 + s / 2, H)
    return [barra] + partir_vertical(asta, W / 2, g)

# ------------------------------------------------------------------ palabra

SPEC = dict(s=20.0, g=4.2, sd=19.0, track=13.0, anchos=(66, 74, 76, 74, 68), kern_VA=4.0)

def posiciones(spec=SPEC):
    """Posición x de cada letra (K, O, V, A, T) y su ancho, con el mismo espaciado de palabra()."""
    x, res = 0.0, []
    for nombre, w in zip("KOVAT", spec["anchos"]):
        if nombre == "A":
            x -= spec["kern_VA"]
        res.append((nombre, x, w))
        x += w + spec["track"]
    return res

def palabra(spec=SPEC):
    """Devuelve [(letra, [segmentos])] ya ubicadas, y el ancho total."""
    s, g, sd, track = spec["s"], spec["g"], spec["sd"], spec["track"]
    wK, wO, wV, wA, wT = spec["anchos"]
    letras = [("K", letra_K(wK, s, g, sd), wK), ("O", marco(wO, s, g), wO),
              ("V", letra_V(wV, s, g, sd), wV), ("A", letra_A7(wA, s, g), wA),
              ("T", letra_T(wT, s, g), wT)]
    x, res = 0.0, []
    for i, (nombre, segs, w) in enumerate(letras):
        if nombre == "A":
            x -= spec["kern_VA"]
        res.append((nombre, [mover(p, x) for p in segs]))
        x += w + track
    return res, x - track


if __name__ == "__main__":
    letras, ancho = palabra()
    print("ancho", round(ancho, 1), "segmentos", sum(len(s) for _, s in letras))
