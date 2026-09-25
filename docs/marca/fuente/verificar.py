"""Verificaciones geométricas del logotipo: cortes uniformes, sin contactos, polígonos sanos."""
import math, itertools, gen

def area(p):
    return 0.5 * sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))

def convexo(p):
    signos = set()
    n = len(p)
    for i in range(n):
        a, b, c = p[i], p[(i + 1) % n], p[(i + 2) % n]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) > 1e-9:
            signos.add(cr > 0)
    return len(signos) == 1

def dist_punto_seg(P, A, B):
    ax, ay = B[0] - A[0], B[1] - A[1]
    L2 = ax * ax + ay * ay
    t = 0 if L2 == 0 else max(0, min(1, ((P[0] - A[0]) * ax + (P[1] - A[1]) * ay) / L2))
    return math.hypot(P[0] - A[0] - t * ax, P[1] - A[1] - t * ay)

def dentro(P, poly):
    # convexo: todos los productos cruzados con el mismo signo
    s = None
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        cr = (b[0] - a[0]) * (P[1] - a[1]) - (b[1] - a[1]) * (P[0] - a[0])
        if abs(cr) < 1e-9:
            continue
        if s is None:
            s = cr > 0
        elif s != (cr > 0):
            return False
    return True

def distancia(p, q):
    if any(dentro(v, q) for v in p) or any(dentro(v, p) for v in q):
        return 0.0
    d = min(dist_punto_seg(v, q[i], q[(i + 1) % len(q)]) for v in p for i in range(len(q)))
    return min(d, min(dist_punto_seg(v, p[i], p[(i + 1) % len(p)]) for v in q for i in range(len(p))))

def limpiar(p, eps=1e-6):
    out = []
    for v in p:
        if not out or math.hypot(v[0] - out[-1][0], v[1] - out[-1][1]) > eps:
            out.append(v)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= eps:
        out.pop()
    return out

g = gen.SPEC["g"]
letras, ancho = gen.palabra()
problemas = []
todos = []
for nombre, segs in letras:
    segs = [limpiar(p) for p in segs]
    for i, p in enumerate(segs):
        if len(p) < 3 or abs(area(p)) < 1:
            problemas.append(f"{nombre}{i}: polígono degenerado")
        if not convexo(p):
            problemas.append(f"{nombre}{i}: no es convexo")
        ys = [y for _, y in p]
        if min(ys) < -1e-6 or max(ys) > gen.H + 1e-6:
            problemas.append(f"{nombre}{i}: se sale de la altura")
        todos.append((nombre, i, p))
    # una "unión" es un par de segmentos a menos de 1,6 g; más lejos ya es espacio abierto
    cortes = []
    for (i, p), (j, q) in itertools.combinations(enumerate(segs), 2):
        dq = distancia(p, q)
        if dq < 1.6 * g:
            cortes.append(dq)
    print(f"{nombre}: {len(segs)} segmentos, {len(cortes)} uniones, corte "
          f"min {min(cortes):.4f}  max {max(cortes):.4f}  (objetivo {g})")
    if min(cortes) < g - 0.01 or max(cortes) > g + 0.01:
        problemas.append(f"{nombre}: cortes no uniformes")

# separación entre letras
letras_min = {}
for (n1, i, p), (n2, j, q) in itertools.combinations(todos, 2):
    if n1 != n2:
        k = n1 + n2
        letras_min[k] = min(letras_min.get(k, 1e9), distancia(p, q))
pares = ["KO", "OV", "VA", "AT"]
print("separacion minima entre letras:", {k: round(letras_min[k], 2) for k in pares})
print("ancho total:", round(ancho, 2), "alto:", gen.H)
print("PROBLEMAS:", problemas or "ninguno")
