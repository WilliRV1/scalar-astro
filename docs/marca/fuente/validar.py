import os, re, glob, math
import xml.etree.ElementTree as ET

SAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ok = True
def falla(m):
    global ok; ok = False; print("  FALLA:", m)

for f in sorted(glob.glob(os.path.join(SAL, "*.svg"))):
    txt = open(f, encoding="utf-8").read()
    try:
        root = ET.fromstring(txt)
    except ET.ParseError as e:
        falla(f"{f}: XML inválido {e}"); continue
    nombre = os.path.basename(f)
    ns = "{http://www.w3.org/2000/svg}"
    paths = root.iter(ns + "path")
    npaths = sum(1 for _ in root.iter(ns + "path"))
    nums = re.findall(r"-?\d+(?:\.\d+)?", " ".join(p.get("d", "") for p in root.iter(ns + "path")))
    if any(n in ("nan", "inf") for n in nums):
        falla(f"{nombre}: coordenadas no numéricas")
    if root.find(ns + "title") is None:
        falla(f"{nombre}: sin <title>")
    linea = f"{nombre}: XML ok, {npaths} paths"
    style = root.find(ns + "style")
    if style is not None:
        css = style.text
        kfs = {}
        for nombre_kf, cuerpo in re.findall(r"@keyframes (\w+)\{(.*?\})\}", css):
            pasos = []
            for pct, props in re.findall(r"([\d.]+)%\{([^}]*)\}", cuerpo):
                d = dict(pr.split(":", 1) for pr in props.split(";") if pr)
                pasos.append((float(pct), d))
            kfs[nombre_kf] = pasos
        md = re.search(r"animation-duration:([\d.]+)s", css) or re.search(r"animation:\w+ ([\d.]+)s", css)
        dur = float(md.group(1))
        for k, pasos in kfs.items():
            pct = [p for p, _ in pasos]
            if pct != sorted(pct) or len(set(pct)) != len(pct) or pct[0] != 0 or pct[-1] != 100:
                falla(f"{nombre}/{k}: porcentajes mal ordenados o sin 0%/100%")
        fin_ = lambda k, prop: kfs[k][-1][1].get(prop)
        vivos = [k for k in kfs if re.fullmatch(r"s\d+", k)]
        encendidos = sum(1 for k in vivos if fin_(k, "opacity") == "1")
        if "loop" in nombre:
            pass
        elif "intro" in nombre:
            if encendidos != 21:
                falla(f"{nombre}: termina con {encendidos} segmentos encendidos, se esperaban 21")
            for k in vivos:
                if fin_(k, "opacity") == "1" and fin_(k, "transform") not in (None, "none"):
                    falla(f"{nombre}/{k}: termina desplazado")
            if "camara" in kfs and fin_("camara", "transform") != "none":
                falla(f"{nombre}: la cámara no vuelve a su sitio")
        elif encendidos != 0:
            falla(f"{nombre}: termina con {encendidos} segmentos encendidos, se esperaba 0")
        for k in kfs:
            if (k == "fantasma" or re.fullmatch(r"f[A-Z]", k)) and fin_(k, "opacity") != "0":
                falla(f"{nombre}/{k}: el fantasma no termina apagado")
        # destellos: cambios de sentido de la opacidad por segmento en cualquier ventana de 1 s
        peor = 0
        for k in vivos:
            ops = [(p / 100 * dur, float(d["opacity"])) for p, d in kfs[k] if "opacity" in d]
            giros, sentido = [], 0
            for (t0, o0), (t1, o1) in zip(ops, ops[1:]):
                s_ = (o1 > o0) - (o1 < o0)
                if s_ and s_ != sentido:
                    giros.append(t0); sentido = s_
            for t in giros:
                peor = max(peor, sum(1 for u in giros if t <= u < t + 1.0))
        # en un bucle, contar los cambios de un ciclo y llevarlos a cambios por segundo
        m = re.search(r"animation:\w+ ([\d.]+)s linear infinite", css)
        if m:
            ciclo = float(m.group(1))
            for k, pasos in kfs.items():
                ops = [float(d["opacity"]) for _, d in pasos if "opacity" in d]
                giros = sum(1 for a, b, c in zip(ops, ops[1:], ops[2:]) if (b - a) * (c - b) < 0) + 2
                peor = max(peor, math.ceil(giros / ciclo))
            linea += f", bucle de {ciclo:g} s"
        if peor > 6:
            falla(f"{nombre}: {peor} cambios en 1 s en un segmento (máximo 6 = 3 destellos)")
        if "prefers-reduced-motion" in css:
            falla(f"{nombre}: la pieza no debe depender de prefers-reduced-motion (lo decide quien la inserta)")
        linea += f", {len(vivos)} segmentos animados, dura {dur:g} s, termina con {encendidos} encendidos, máx. {peor} cambios/s por segmento"
    print(linea)

# contraste WCAG
def lum(h):
    h = h.lstrip("#"); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
pares = [("rojo LED sobre tarima", "#F0402A", "#110E0D"), ("blanco tiza sobre tarima", "#EFEBE7", "#110E0D"),
         ("negro tinta sobre papel", "#161212", "#FFFFFF"), ("rojo LED sobre papel", "#F0402A", "#FFFFFF"),
         ("apagado sobre tarima", "#2A2120", "#110E0D")]
for n, a, b in pares:
    print(f"contraste {n}: {ratio(a, b):.2f}:1")
print("RESULTADO:", "todo bien" if ok else "hay fallas")
