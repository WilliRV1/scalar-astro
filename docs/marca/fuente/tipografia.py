"""Kovat Marcador: la tipografía del logo, como fuente instalable (TTF y WOFF).

Mismas reglas que el logo: celda de 7 segmentos con esquinas a inglete, verticales partidos en
punta a media altura, barra central en punta, diagonales como las de la K y la V, y el mismo
corte g entre piezas. Solo mayúsculas, como un marcador: las minúsculas muestran la mayúscula.
La K, la O, la V, la A y la T son exactamente las del logo, y el espaciado también: escribir
KOVAT con la fuente reproduce el logo.

Unidades de diseño: altura de mayúscula H = 100. En la fuente, 1 unidad = 7 (UPM 1000, altura
de mayúscula 700).
"""
import math, os, itertools
import gen
from gen import clip, rect, banda, x_ge, x_le, y_ge, y_le, espejo_x, espejo_y, mover, media_diag

H = gen.H
S = gen.SPEC
s, g, sd, TRACK = S["s"], S["g"], S["sd"], S["track"]
GA = g * 0.6                     # corte de los acentos, que son piezas más chicas
ESC = 7                          # unidades de diseño -> unidades de la fuente
SAL = os.path.join(os.path.dirname(gen.OUT), "tipografia")
os.makedirs(SAL, exist_ok=True)

# ------------------------------------------------------------------ piezas

def cel(W, ks):
    c = gen.celda(W, s, g)
    return [c[k] for k in ks]

def barra_punta(x0, x1, yc, t):
    """Barra horizontal con las dos puntas de display (hexágono)."""
    p = rect(x0, yc - t / 2, x1, yc + t / 2)
    p = clip(p, 1, -1, -x0 + yc); p = clip(p, 1, 1, -x0 - yc)
    p = clip(p, -1, -1, x1 + yc); p = clip(p, -1, 1, x1 - yc)
    return p

def asta_central(W, y0, y1, partir=True):
    p = rect(W / 2 - s / 2, y0, W / 2 + s / 2, y1)
    return gen.partir_vertical(p, W / 2, g) if partir else [p]

def chaflan(p, W, ch=26):
    """Corta a 45° las esquinas derechas del marco (D y B)."""
    p = clip(p, -1, 1, W - ch)
    return clip(p, -1, -1, W + H - ch)

def diag(P0, P1, ancho=sd):
    return banda(P0, P1, ancho)

def hw_para(x_ini, y_ini, x_fin, y_fin, ancho=sd):
    """Media anchura horizontal de una diagonal de ese recorrido."""
    return media_diag(ancho, abs(y_fin - y_ini), abs(x_fin - x_ini))

def recortar(p, x0=None, x1=None, y0=None, y1=None):
    if x0 is not None: p = x_ge(p, x0)
    if x1 is not None: p = x_le(p, x1)
    if y0 is not None: p = y_ge(p, y0)
    if y1 is not None: p = y_le(p, y1)
    return p

# ------------------------------------------------------------------ letras

G = {}   # carácter -> (ancho, [polígonos])

def letra(ch, W, polys):
    G[ch] = (W, [p for p in polys if len(p) >= 3])

letra("A", 74, gen.letra_A7(74, s, g))
letra("B", 74, [chaflan(p, 74) for p in cel(74, "abcd")] + cel(74, "efg"))
letra("C", 70, cel(70, "afed"))
letra("D", 74, [chaflan(p, 74) for p in cel(74, "abcd")] + cel(74, "ef"))
letra("E", 66, cel(66, "afedg"))
letra("F", 66, cel(66, "afeg"))
g2 = lambda W: x_ge(gen.celda(W, s, g)["g"], W / 2 - s / 2)
letra("G", 74, cel(74, "afedc") + [g2(74)])
letra("H", 74, cel(74, "febcg"))
letra("I", 50, [rect(0, 0, 50, s), rect(0, H - s, 50, H)] + asta_central(50, s + g, H - s - g))
letra("J", 70, cel(70, "bcde"))
letra("K", 66, gen.letra_K(66, s, g, sd))
letra("L", 66, cel(66, "fed"))

def palos(W):
    """M, N y W llevan los palos enteros: con la unión en punta, junto a una diagonal, se leían como ruido."""
    izq = rect(0, 0, s, H)
    return [izq, espejo_x(izq, W)]

def m_w(W, invertida):
    yv = 0.62 * H
    hw = sd / 2
    for _ in range(40):
        hw = hw_para(s + g + hw, 0, W / 2, yv)
    izq = recortar(diag((s + g + hw, 0), (W / 2, yv)), x0=s + g, x1=W / 2 - g / 2, y0=0, y1=H)
    piezas = [izq, espejo_x(izq, W)]
    if invertida:
        piezas = [espejo_y(p) for p in piezas]
    return palos(W) + piezas

letra("M", 118, m_w(118, False))
letra("W", 118, m_w(118, True))

def letra_N(W):
    hw = sd / 2
    for _ in range(40):
        hw = hw_para(s + g + hw, 0, W - s - g - hw, H)
    d = recortar(diag((s + g + hw, 0), (W - s - g - hw, H)), x0=s + g, x1=W - s - g, y0=0, y1=H)
    return palos(W) + [d]

letra("N", 100, letra_N(100))
letra("O", 74, cel(74, "abcdef"))
letra("P", 72, cel(72, "abfeg"))

def cola(W, y_desde):
    """Diagonal del centro hacia la esquina inferior derecha (Q y R)."""
    hw = sd / 2
    for _ in range(40):
        hw = hw_para(W / 2, H / 2, W - hw, H)
    return diag((W / 2, H / 2), (W - hw, H)), hw

def letra_Q(W, tw=16):
    """La cola cruza la esquina inferior derecha a 45°, justo por la línea del inglete (y - x = H - W),
    y corta c y d dejando el mismo hueco g a cada lado."""
    a, b, c, d, e, f = cel(W, "abcdef")
    k = (tw / 2 + g) * math.sqrt(2)
    lim = H - W
    c = clip(c, 1, -1, lim - k)
    d = clip(d, -1, 1, -lim - k)
    tail = recortar(banda((W - 30, H - 30), (W + 12, H + 12), tw), x0=W / 2 + 4, x1=W + 6, y0=H / 2 + 12, y1=H + 12)
    return [a, b, c, d, e, f, tail]

letra("Q", 74, letra_Q(74))
cr, _ = cola(74, 0)
letra("R", 74, cel(74, "abfeg") + [recortar(cr, x0=74 / 2, x1=74, y0=H / 2 + s / 2 + g, y1=H)])
letra("S", 74, cel(74, "afgcd"))
letra("T", 68, gen.letra_T(68, s, g))
letra("U", 74, cel(74, "fedcb"))
letra("V", 76, gen.letra_V(76, s, g, sd))

def letra_X(W):
    hw = sd / 2
    for _ in range(40):
        hw = hw_para(hw, 0, W - hw, H)
    d1 = diag((hw, 0), (W - hw, H))
    d2 = diag((W - hw, 0), (hw, H))
    m = g / 2
    return [recortar(d1, x0=0, x1=W / 2 - m, y0=0, y1=H / 2 - m), recortar(d1, x0=W / 2 + m, x1=W, y0=H / 2 + m, y1=H),
            recortar(d2, x0=W / 2 + m, x1=W, y0=0, y1=H / 2 - m), recortar(d2, x0=0, x1=W / 2 - m, y0=H / 2 + m, y1=H)]

letra("X", 76, letra_X(76))

def letra_Y(W):
    hw = sd / 2
    for _ in range(40):
        hw = hw_para(hw, 0, W / 2, H / 2)
    izq = recortar(diag((hw, 0), (W / 2, H / 2)), x0=0, x1=W / 2 - g / 2, y0=0, y1=H / 2)
    return [izq, espejo_x(izq, W), rect(W / 2 - s / 2, H / 2 + g, W / 2 + s / 2, H)]

letra("Y", 76, letra_Y(76))

def letra_Z(W):
    hw = sd / 2
    for _ in range(40):
        hw = hw_para(W - hw, s + g, hw, H - s - g)
    d = recortar(diag((W - hw, s + g), (hw, H - s - g)), x0=0, x1=W, y0=s + g, y1=H - s - g)
    return [rect(0, 0, W, s), rect(0, H - s, W, H), d]

letra("Z", 70, letra_Z(70))

# ------------------------------------------------------------------ acentos (sobre la altura de mayúscula)

TA = 13  # grosor de los acentos

def agudo(cx):
    hw = TA / 2
    for _ in range(40):
        hw = hw_para(cx - 8 + hw, -9, cx + 10 - hw, -31, TA)
    return [recortar(diag((cx - 8 + hw, -9), (cx + 10 - hw, -31), TA), y0=-31, y1=-9)]

def dieresis(cx):
    return [rect(cx - 21, -26, cx - 8, -13), rect(cx + 8, -26, cx + 21, -13)]

def tilde(cx):
    t = 10
    izq = rect(cx - 27, -31, cx - 8, -31 + t)
    der = rect(cx + 8, -19, cx + 27, -19 + t)
    hw = t / 2
    for _ in range(40):
        hw = hw_para(cx - 8, -26, cx + 8, -14, t)
    medio = recortar(diag((cx - 8, -26), (cx + 8, -14), t), x0=cx - 8 + GA, x1=cx + 8 - GA)
    return [izq, medio, der]

for base, acentuada in zip("AEIOU", "ÁÉÍÓÚ"):
    W, polys = G[base]
    letra(acentuada, W, polys + agudo(W / 2))
W, polys = G["U"]; letra("Ü", W, polys + dieresis(W / 2))
W, polys = G["N"]; letra("Ñ", W, polys + tilde(W / 2))

# ------------------------------------------------------------------ números (todos del mismo ancho)

for dig in "0123456789":
    letra(dig, 74, cel(74, gen.DIGITOS[dig]))
UNO_TABULAR = G["1"]
letra("1", s, [mover(p, -(74 - s)) for p in cel(74, "bc")])   # 1 proporcional: solo sus dos segmentos

# ------------------------------------------------------------------ signos

cuadro = lambda x, y, lado=s: rect(x, y, x + lado, y + lado)
letra(".", s, [cuadro(0, H - s)])
coma_cola = [(8, H + GA * 1.4), (s, H + GA * 1.4), (10, H + 18), (0, H + 18)]
letra(",", s, [cuadro(0, H - s), coma_cola])
letra(":", s, [cuadro(0, 20), cuadro(0, 60)])
letra(";", s, [cuadro(0, 20), cuadro(0, 60), mover([(x, y - 20) for x, y in coma_cola], 0)])
letra("-", 44, [barra_punta(0, 44, H / 2, s)])
letra("–", 74, [barra_punta(0, 74, H / 2, s)])
letra("_", 74, [rect(0, H - s, 74, H)])
letra("=", 60, [barra_punta(0, 60, 38, 16), barra_punta(0, 60, 62, 16)])
cx = 35
letra("+", 70, [rect(0, H / 2 - s / 2, cx - s / 2 - g, H / 2 + s / 2), rect(cx + s / 2 + g, H / 2 - s / 2, 70, H / 2 + s / 2),
                rect(cx - s / 2, 16, cx + s / 2, H / 2 - s / 2 - g), rect(cx - s / 2, H / 2 + s / 2 + g, cx + s / 2, 84)])

def barra_inclinada(W):
    hw = sd / 2
    for _ in range(40):
        hw = hw_para(hw, H, W - hw, 0)
    return recortar(diag((hw, H), (W - hw, 0)), x0=0, x1=W, y0=0, y1=H)

letra("/", 48, [barra_inclinada(48)])
letra("%", 74, [cuadro(0, 0), barra_inclinada(74), cuadro(74 - s, H - s)])
letra("$", 74, cel(74, "afgcd") + [rect(37 - s / 2, -17, 37 + s / 2, -g), rect(37 - s / 2, H + g, 37 + s / 2, H + 17)])

# El numeral no va: un "#1" es texto de interfaz y lo escribe la fuente de apoyo.
letra("(", 52, cel(52, "afed"))
letra(")", 52, cel(52, "bcda"))
letra("!", s, [rect(0, 0, s, 68), cuadro(0, H - s)])
letra("¡", s, [cuadro(0, 0), rect(0, 32, s, H)])
pregunta = cel(70, "ab") + [x_ge(gen.celda(70, s, g)["g"], 35 - s / 2), cuadro(35 - s / 2, H - s)]
letra("?", 70, pregunta)
letra("¿", 70, [[(70 - x, H - y) for x, y in p] for p in pregunta])
letra("'", 14, [rect(0, 0, 14, 26)])
letra('"', 40, [rect(0, 0, 14, 26), rect(26, 0, 40, 26)])
letra(" ", 36, [])

# ------------------------------------------------------------------ comprobaciones de geometría

def area(p):
    return 0.5 * sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))

def convexo(p):
    signos = set()
    for i in range(len(p)):
        a, b, c = p[i], p[(i + 1) % len(p)], p[(i + 2) % len(p)]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) > 1e-9:
            signos.add(cr > 0)
    return len(signos) <= 1

def limpiar(p, eps=1e-6):
    out = []
    for v in p:
        if not out or math.hypot(v[0] - out[-1][0], v[1] - out[-1][1]) > eps:
            out.append(v)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= eps:
        out.pop()
    return out

def dist_ps(P, A, B):
    ax, ay = B[0] - A[0], B[1] - A[1]
    L2 = ax * ax + ay * ay
    t = 0 if L2 == 0 else max(0, min(1, ((P[0] - A[0]) * ax + (P[1] - A[1]) * ay) / L2))
    return math.hypot(P[0] - A[0] - t * ax, P[1] - A[1] - t * ay)

def dentro(P, poly):
    sg = None
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        cr = (b[0] - a[0]) * (P[1] - a[1]) - (b[1] - a[1]) * (P[0] - a[0])
        if abs(cr) < 1e-9:
            continue
        if sg is None:
            sg = cr > 0
        elif sg != (cr > 0):
            return False
    return True

def distancia(p, q):
    if any(dentro(v, q) for v in p) or any(dentro(v, p) for v in q):
        return 0.0
    d1 = min(dist_ps(v, q[i], q[(i + 1) % len(q)]) for v in p for i in range(len(q)))
    d2 = min(dist_ps(v, p[i], p[(i + 1) % len(p)]) for v in q for i in range(len(p)))
    return min(d1, d2)

problemas = []
for ch, (W, polys) in G.items():
    polys = [limpiar(p) for p in polys]
    G[ch] = (W, polys)
    for p in polys:
        if len(p) < 3 or abs(area(p)) < 1:
            problemas.append(f"{ch!r}: pieza degenerada")
        elif not convexo(p):
            problemas.append(f"{ch!r}: pieza no convexa")
    for p, q in itertools.combinations(polys, 2):
        if distancia(p, q) < GA - 0.05:
            problemas.append(f"{ch!r}: piezas a {distancia(p, q):.2f} (mínimo {GA:.2f})")
    for p in polys:
        xs = [x for x, _ in p]
        if min(xs) < -1e-6 or max(xs) > W + TRACK / 2 - 0.5:
            problemas.append(f"{ch!r}: se sale de su ancho")
assert not problemas, "\n".join(problemas)

# las cinco letras del logo son idénticas a las del logo
for n, segs in gen.palabra()[0]:
    W, polys = G[n]
    x0 = [x for nn, x, _ in gen.posiciones() if nn == n][0]
    logo = sorted(tuple((round(x - x0, 6), round(y, 6)) for x, y in limpiar(p)) for p in segs)
    fuente = sorted(tuple((round(x, 6), round(y, 6)) for x, y in p) for p in polys)
    assert logo == fuente, f"la {n} de la fuente no es la del logo"

# ------------------------------------------------------------------ fuente

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

UPM = 1000
LSB = TRACK / 2
ASC, DESC = 950, -250
NOMBRE = "Kovat Marcador"

def nombre_glifo(ch):
    return {" ": "space"}.get(ch, f"uni{ord(ch):04X}")

def contorno(p):
    pts = [(round((x + LSB) * ESC), round((H - y) * ESC)) for x, y in p]
    a = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    return pts[::-1] if a > 0 else pts          # TrueType: contornos exteriores en sentido horario

def glifo(polys):
    pen = TTGlyphPen(None)
    for p in polys:
        pts = contorno(p)
        pen.moveTo(pts[0])
        for q in pts[1:]:
            pen.lineTo(q)
        pen.closePath()
    return pen.glyph()

orden = [".notdef"] + [nombre_glifo(c) for c in G] + ["one.tnum"]
glifos = {nombre_glifo(c): glifo(polys) for c, (W, polys) in G.items()}
glifos["one.tnum"] = glifo(UNO_TABULAR[1])
pen = TTGlyphPen(None)
for caja in ([(40, 0), (40, 700), (460, 700), (460, 0)], [(90, 50), (410, 50), (410, 650), (90, 650)]):
    pen.moveTo(caja[0]); [pen.lineTo(q) for q in caja[1:]]; pen.closePath()
glifos[".notdef"] = pen.glyph()

mapa = {}
for c in G:
    mapa[ord(c)] = nombre_glifo(c)
    minus = c.lower()
    if minus != c and len(minus) == 1:
        mapa[ord(minus)] = nombre_glifo(c)          # las minúsculas muestran la mayúscula
mapa[0x2212] = nombre_glifo("-")                    # signo menos

fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(orden)
fb.setupCharacterMap(mapa)
fb.setupGlyf(glifos)
glyf = fb.font["glyf"]
metricas = {".notdef": (500, 40)}
for c, (W, _) in G.items():
    n = nombre_glifo(c)
    gl = glyf[n]
    lsb = gl.xMin if gl.numberOfContours else 0
    metricas[n] = (round((W + TRACK) * ESC), lsb)
metricas["one.tnum"] = (round((UNO_TABULAR[0] + TRACK) * ESC), glyf["one.tnum"].xMin)
fb.setupHorizontalMetrics(metricas)
fb.setupHorizontalHeader(ascent=ASC, descent=DESC)
fb.setupNameTable({
    "familyName": NOMBRE, "styleName": "Regular", "uniqueFontIdentifier": "Kovat Marcador Regular 1.000",
    "fullName": "Kovat Marcador Regular", "psName": "KovatMarcador-Regular", "version": "Version 1.000",
    "copyright": "© 2026 Kovat. Tipografía de marca, uso exclusivo de Kovat.",
    "designer": "Kovat", "description": "Tipografía de display de 7 segmentos, construida con la geometría del logo de Kovat.",
})
fb.setupOS2(sTypoAscender=ASC, sTypoDescender=DESC, sTypoLineGap=0, usWinAscent=ASC, usWinDescent=-DESC,
            sCapHeight=round(H * ESC), sxHeight=round(H * ESC), achVendID="KOVT", usWeightClass=700,
            fsSelection=0x40, fsType=0)
fb.setupPost()
# fecha fija: así regenerar la fuente da exactamente el mismo archivo (y las páginas que la incrustan)
from fontTools.misc.timeTools import timestampFromString
FECHA = timestampFromString("Fri Sep 25 00:00:00 2026")
fb.updateHead(created=FECHA, modified=FECHA)
fb.font.recalcTimestamp = False
# espaciado óptico entre V y A: el mismo del logo
va = round(-S["kern_VA"] * ESC)
fb.addOpenTypeFeatures(f"languagesystem DFLT dflt;\nlanguagesystem latn dflt;\n"
                       f"feature kern {{ pos {nombre_glifo('V')} {nombre_glifo('A')} {va}; "
                       f"pos {nombre_glifo('A')} {nombre_glifo('V')} {va}; }} kern;\n"
                       f"feature tnum {{ sub {nombre_glifo('1')} by one.tnum; }} tnum;\n")

TTF = os.path.join(SAL, "KovatMarcador-Regular.ttf")
WOFF = os.path.join(SAL, "KovatMarcador-Regular.woff")
fb.save(TTF)
f = TTFont(TTF, recalcTimestamp=False)
f.flavor = "woff"
f.save(WOFF)

# comprobaciones de la fuente ya escrita
f = TTFont(TTF)
cmap = f.getBestCmap()
necesarios = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚÜabcdefghijklmnñopqrstuvwxyzáéíóúü0123456789 .,:;-–+/%$()!¡?¿'\"=_"
faltan = [c for c in necesarios if ord(c) not in cmap]
assert not faltan, f"faltan: {faltan}"
anchos = {f["hmtx"][cmap[ord(d)]][0] for d in "023456789"} | {f["hmtx"]["one.tnum"][0]}
assert len(anchos) == 1, "los números tabulares no tienen todos el mismo ancho"
assert "tnum" in {fr.FeatureTag for fr in f["GSUB"].table.FeatureList.FeatureRecord}, "falta tnum"
for n in f.getGlyphOrder():
    gl = f["glyf"][n]
    if gl.numberOfContours:
        assert gl.yMax <= ASC and gl.yMin >= DESC, f"{n} se sale de la altura de línea"

CSS = os.path.join(SAL, "kovat-marcador.css")
with open(CSS, "w", encoding="utf-8", newline="\n") as fcss:
    fcss.write("""/* Kovat Marcador: tipografía de display de la marca.
   Solo mayúsculas (las minúsculas muestran la mayúscula), números de ancho fijo y el espaciado
   ya incluido en la fuente: no agregar letter-spacing. Para textos corridos se usa otra fuente. */
@font-face {
  font-family: "Kovat Marcador";
  src: url("KovatMarcador-Regular.woff") format("woff"),
       url("KovatMarcador-Regular.ttf") format("truetype");
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}

.marcador {
  font-family: "Kovat Marcador", sans-serif;
  font-kerning: normal;
  letter-spacing: 0;
  line-height: 1.25;
}

/* Cronómetros, marcadores y columnas de plata: todos los números del mismo ancho,
   así un tiempo que corre no hace saltar el texto. */
.marcador-numeros {
  font-variant-numeric: tabular-nums;
}
""")

if __name__ == "__main__":
    print(f"{len(G)} caracteres, {len(mapa)} códigos mapeados")
    print("TTF", os.path.getsize(TTF), "bytes; WOFF", os.path.getsize(WOFF), "bytes")
    print("ancho de los números:", anchos.pop(), "unidades; kern V-A:", va)
