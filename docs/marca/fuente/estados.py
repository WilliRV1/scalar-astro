"""Estados de la interfaz hechos solo con la O: la celda de 7 segmentos del logo.

Cada estado es un SVG cuadrado, sin fondo, pensado para superficies oscuras, que se anima solo
con CSS. A diferencia de las intros y outros (piezas de marca), estos son interfaz: respetan
prefers-reduced-motion. Lo que se mueve (vueltas, llenados, sacudida, latido) se cambia por una
respiración de opacidad o por el estado final quieto.

Segmentos de la celda: a arriba, b arriba a la derecha, c abajo a la derecha, d abajo,
e abajo a la izquierda, f arriba a la izquierda, g centro.
"""
import os, re, math
import xml.etree.ElementTree as ET
import gen
import build as B

S = gen.SPEC
W = S["anchos"][1]
LADO = 120
OX, OY = (LADO - W) / 2, (LADO - gen.H) / 2
CEL = gen.celda(W, S["s"], S["g"])
RELOJ = "abcdef"                       # orden de las agujas del reloj
EASE_ON, EASE_OFF = B.EASE_ON, B.EASE_OFF
VAIVEN = "cubic-bezier(0.45, 0, 0.55, 1)"
import json
_SIS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "colores", "kovat-colores.json"),
                      encoding="utf-8"))["niveles"]["estandar"]
# listo, error y sin conexión usan los indicadores del sistema de colores; el resto, el rojo de la marca
COL = dict(B.COL, verde=_SIS["exito-indicador"], ambar=_SIS["aviso-indicador"], error=_SIS["error-indicador"])
SAL = os.path.join(B.SAL, "estados")
os.makedirs(SAL, exist_ok=True)

def dp(k):
    return B.d_path(CEL[k], 1, OX, OY)

def fantasma():
    return f'<g fill="{COL["apagado"]}">' + "".join(f'<path d="{dp(k)}"/>' for k in "abcdefg") + "</g>"

RESPIRA = "@keyframes respira{0%,100%{opacity:.35;animation-timing-function:" + VAIVEN + "}50%{opacity:1;animation-timing-function:" + VAIVEN + "}}"

def svg(titulo, css, cuerpo, reducido):
    media = f"\n@media (prefers-reduced-motion:reduce){{{reducido}}}" if reducido else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LADO} {LADO}" width="{LADO}" height="{LADO}" '
            f'role="img" aria-labelledby="t">\n<title id="t">{titulo}</title>\n<style>\n{css}{media}\n</style>\n'
            f'{cuerpo}\n</svg>\n')

VARIANTES = {}   # nombre -> (normal, reducido), para la vista previa
FICHAS = []      # (archivo, nombre, uso, color, tipo, ciclo)

def guardar(archivo, titulo, css, cuerpo, reducido, uso, color, tipo, ciclo):
    B.escribir(os.path.join("estados", archivo), svg(titulo, css, cuerpo, reducido))
    VARIANTES[archivo] = (svg(titulo, css, cuerpo, ""), svg(titulo, css + "\n" + reducido, cuerpo, ""))
    FICHAS.append((archivo, titulo, uso, color, tipo, ciclo))

def keyframes_bucle(nombre, ciclo, cambios):
    """Opacidad en bucle: arranca y termina en 0, así el salto entre vueltas no se ve."""
    return B.keyframes(nombre, ciclo, 0, cambios)

# ------------------------------------------------------------------ cargando
def vuelta(nombre, picos):
    """Cada segmento se enciende de golpe y se apaga dejando estela. picos: 1 o 2 por ciclo."""
    tramo = 100 / picos
    partes = []
    for i in range(picos):
        p0 = i * tramo
        if i:
            partes.append(f"{p0 - 0.01:.2f}%{{opacity:.12}}")
        partes.append(f"{p0:.2f}%{{opacity:1;animation-timing-function:{EASE_ON}}}")
        partes.append(f"{p0 + tramo * 0.55:.2f}%{{opacity:.12}}")
    partes.append("100%{opacity:.12}")
    return f"@keyframes {nombre}{{{' '.join(partes)}}}"

def giratorio(archivo, titulo, ciclo, picos, uso):
    css = (f".l{{fill:{COL['led']};animation:{archivo[:-4].replace('-', '')} {ciclo}s linear infinite both}}\n"
           f"{vuelta(archivo[:-4].replace('-', ''), picos)}\n{RESPIRA}")
    luces = "".join(f'<path class="l" style="animation-delay:{j * ciclo / 6 - ciclo:.3f}s" d="{dp(k)}"/>'
                    for j, k in enumerate(RELOJ))
    reducido = ".l{animation:respira 2.4s linear infinite both!important;animation-delay:0s!important}"
    guardar(archivo, titulo, css, fantasma() + luces, reducido, uso, "Rojo LED", "Bucle", ciclo)

giratorio("kovat-cargando.svg", "Cargando", 1.2, 1, "Cualquier espera corta: abrir una pantalla, traer datos.")
giratorio("kovat-procesando.svg", "Procesando", 1.0, 2, "Esperas que importan: un pago, una inscripción, un cobro.")

# ------------------------------------------------------------------ subiendo y descargando
NIVELES = ["d", "ce", "g", "bf", "a"]           # de abajo hacia arriba
def llenado(archivo, titulo, niveles, mitad, uso):
    ciclo = 1.6
    css = [f".n{{fill:{COL['led']};animation-duration:{ciclo}s;animation-iteration-count:infinite;"
           f"animation-fill-mode:both;animation-timing-function:linear}}", RESPIRA]
    cuerpo = []
    for i, nivel in enumerate(niveles):
        nombre = f"n{i}"
        css.append(keyframes_bucle(nombre, ciclo, [(0.10 + i * 0.18, 0.12, 1, EASE_ON), (1.20, 0.20, 0, EASE_OFF)]))
        for k in nivel:
            clase = "n m" if k in mitad else "n"
            cuerpo.append(f'<path class="{clase}" style="animation-name:{nombre}" d="{dp(k)}"/>')
    reducido = (".n{animation:none!important;opacity:0}"
                ".m{animation:respira 2.4s linear infinite both!important}")
    guardar(archivo, titulo, "\n".join(css), fantasma() + "".join(cuerpo), reducido, uso, "Rojo LED", "Bucle", ciclo)

llenado("kovat-subiendo.svg", "Subiendo", NIVELES, "dceg", "Subir archivos: el comprobante de pago, la foto del atleta, el Excel.")
llenado("kovat-descargando.svg", "Descargando", NIVELES[::-1], "abfg", "Descargar reportes, recibos o la lista de atletas.")

# ------------------------------------------------------------------ listo
TOTAL = 0.95
css = [f".l{{fill:{COL['verde']};animation-duration:{TOTAL}s;animation-fill-mode:both;animation-timing-function:linear}}",
       f".p{{transform-box:fill-box;transform-origin:center;animation:pulso {TOTAL}s linear both}}",
       f"@keyframes pulso{{0%{{transform:scale(1)}}58.9%{{transform:scale(1);animation-timing-function:cubic-bezier(0.2, 0.7, 0.2, 1)}}"
       f"73.7%{{transform:scale(1.07);animation-timing-function:{VAIVEN}}}100%{{transform:scale(1)}}}}"]
luces = []
for j, k in enumerate(RELOJ):
    css.append(B.keyframes(f"c{j}", TOTAL, 0, [(0.08 + j * 0.065, 0.14, 1, EASE_ON)]))
    luces.append(f'<path class="l" style="animation-name:c{j}" d="{dp(k)}"/>')
reducido = ".l,.p{animation:none!important}"
guardar("kovat-listo.svg", "Listo", "\n".join(css), f'<g class="p">{fantasma()}{"".join(luces)}</g>', reducido,
        "Algo terminó bien: pago recibido, atleta guardado, reserva confirmada. Sigue a Cargando o Procesando.",
        "Verde LED", "Una vez", TOTAL)

# ------------------------------------------------------------------ error
TOTAL = 0.80
E = "adefg"
css = [f".l{{fill:{COL['error']};animation:e1 {TOTAL}s linear both}}",
       f".p{{animation:sacudida {TOTAL}s linear both}}",
       B.keyframes("e1", TOTAL, 0, [(0.04, 0.10, 1, EASE_ON)])]
golpes = [(0.12, 0), (0.19, -9), (0.27, 8), (0.35, -6), (0.43, 4), (0.51, -2), (0.59, 0)]
pasos = ["0%{transform:translateX(0px)}"]
for t, x in golpes:
    pasos.append(f"{t / TOTAL * 100:.3f}%{{transform:translateX({x}px);animation-timing-function:{VAIVEN}}}")
pasos.append("100%{transform:translateX(0px)}")
css.append("@keyframes sacudida{" + " ".join(pasos) + "}")
luces = "".join(f'<path class="l" d="{dp(k)}"/>' for k in E)
reducido = ".l,.p{animation:none!important}"
guardar("kovat-error.svg", "Error", "\n".join(css), f'<g class="p">{fantasma()}{luces}</g>', reducido,
        "Algo falló: pago rechazado, dato inválido, no se pudo guardar. Siempre con el mensaje que explica qué pasó.",
        "Carmesí de error", "Una vez", TOTAL)

# ------------------------------------------------------------------ 404
CICLO = 3.2
FASES = [(0.05, "4"), (0.85, "0"), (1.65, "4"), (2.45, "")]
css = [f".l{{fill:{COL['led']};animation-duration:{CICLO}s;animation-iteration-count:infinite;"
       f"animation-fill-mode:both;animation-timing-function:linear}}"]
luces = []
for k in "abcdefg":
    estado, cambios = 0, []
    for t, glifo in FASES:
        nuevo = 1 if glifo and k in gen.DIGITOS[glifo] else 0
        if nuevo != estado:
            cambios.append((t, 0.08, nuevo, EASE_ON if nuevo else EASE_OFF))
            estado = nuevo
    assert estado == 0
    css.append(keyframes_bucle(f"q{k}", CICLO, cambios))
    luces.append(f'<path class="l" style="animation-name:q{k}" d="{dp(k)}"/>')
guardar("kovat-404.svg", "Página no encontrada", "\n".join(css), fantasma() + "".join(luces), "",
        "Página que no existe. La celda deletrea 4, 0, 4 y se queda en blanco.", "Rojo LED", "Bucle", CICLO)

# ------------------------------------------------------------------ sin conexión
CICLO = 2.0
css = (f".l{{fill:{COL['ambar']};animation:senal {CICLO}s linear infinite both}}\n"
       f"@keyframes senal{{0%,100%{{opacity:1;animation-timing-function:{VAIVEN}}}50%{{opacity:.25;animation-timing-function:{VAIVEN}}}}}")
guardar("kovat-sin-conexion.svg", "Sin conexión", css, fantasma() + f'<path class="l" d="{dp("g")}"/>', "",
        "Se cayó el internet. Solo la raya del medio, respirando, como un display sin señal.", "Ámbar LED", "Bucle", CICLO)

# ------------------------------------------------------------------ esperando / vacío
CICLO = 1.1
css = (f".l{{fill:{COL['tiza']};animation:cursor {CICLO}s linear infinite both}}\n"
       "@keyframes cursor{0%{opacity:1}45%{opacity:1;animation-timing-function:" + EASE_OFF + "}"
       "50%{opacity:0}95%{opacity:0;animation-timing-function:" + EASE_ON + "}100%{opacity:1}}")
guardar("kovat-esperando.svg", "Esperando", css, fantasma() + f'<path class="l" d="{dp("d")}"/>', "",
        "Lista vacía o buscador sin resultados: un guion bajo parpadea como un cursor.", "Blanco tiza", "Bucle", CICLO)

# ------------------------------------------------------------------ comprobaciones
def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def contraste(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)
for nombre in ("led", "verde", "ambar", "tiza"):
    r = contraste(COL[nombre], COL["tarima"])
    assert r >= 3.0, f"{nombre} no llega a 3:1 sobre tarima"   # gráfico de interfaz: mínimo 3:1

def cambios_por_segundo(texto):
    """Cambios de sentido de la opacidad por segundo, en el peor fotograma clave del archivo."""
    peor = 0.0
    duraciones = [float(x) for x in re.findall(r"(?:animation:\w+ |animation-duration:)([\d.]+)s", texto)]
    ciclo = min(duraciones) if duraciones else 1.0
    for cuerpo in re.findall(r"@keyframes \w+\{(.*?\})\}", texto):
        ops = [float(o) for o in re.findall(r"opacity:([\d.]+)", cuerpo)]
        giros = sum(1 for a, b, c in zip(ops, ops[1:], ops[2:]) if (b - a) * (c - b) < 0) + 2
        peor = max(peor, giros / max(ciclo, 1.0))
    return peor

for archivo, *_ in FICHAS:
    texto = open(os.path.join(SAL, archivo), encoding="utf-8").read()
    ET.fromstring(texto)                                           # XML bien formado
    assert cambios_por_segundo(texto) <= 6, f"{archivo}: más de 3 destellos por segundo"
    for variante in VARIANTES[archivo]:
        ET.fromstring(variante)

if __name__ == "__main__":
    for nombre in ("led", "verde", "ambar", "tiza"):
        print(f"contraste {nombre} sobre tarima: {contraste(COL[nombre], COL['tarima']):.2f}:1")
    for archivo, titulo, uso, color, tipo, ciclo in FICHAS:
        print(f"{archivo}: {tipo.lower()}, {ciclo:g} s, {os.path.getsize(os.path.join(SAL, archivo))} bytes")
