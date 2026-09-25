"""Datos del video de lanzamiento: geometría de los segmentos, tomas, voz y mensajes del chat.

Escribe video/datos.js, que usa video/kovat-lanzamiento.html. La animación vive en
video/lanzamiento.js y se calcula entera a partir del tiempo, así que cualquier cuadro se puede
congelar, revisar y exportar igual.

Comprueba:
- el logo tiene 21 segmentos, uno por mensaje del chat (el chat se ordena y se vuelve la marca);
- cada segmento cabe en su rectángulo orientado (a ese rectángulo vuela cada mensaje);
- las tomas suman 60 s sin huecos y la voz no pasa de 3 palabras por segundo en ningún tramo;
- lo que dice la voz en video/guion.md es exactamente lo que dicen los subtítulos.
"""
import json, math, os, re
import gen
import build as B

S = gen.SPEC
SAL = os.path.join(B.SAL, "video")
os.makedirs(SAL, exist_ok=True)

def d(p):
    return "M" + " ".join(f"{B.fmt(x)} {B.fmt(y)}" for x, y in p) + "Z"

def area(p):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(p, p[1:] + p[:1]))) / 2

def orientado(p):
    """Rectángulo orientado por el lado más largo: centro, largo, grueso y ángulo en grados."""
    lados = [(p[i], p[(i + 1) % len(p)]) for i in range(len(p))]
    (x0, y0), (x1, y1) = max(lados, key=lambda l: math.dist(*l))
    ang = math.atan2(y1 - y0, x1 - x0)
    if ang <= -math.pi / 2: ang += math.pi
    if ang > math.pi / 2: ang -= math.pi
    u, n = (math.cos(ang), math.sin(ang)), (-math.sin(ang), math.cos(ang))
    pu = [x * u[0] + y * u[1] for x, y in p]
    pn = [x * n[0] + y * n[1] for x, y in p]
    cu, cn = (min(pu) + max(pu)) / 2, (min(pn) + max(pn)) / 2
    largo, grueso = max(pu) - min(pu), max(pn) - min(pn)
    cx, cy = cu * u[0] + cn * n[0], cu * u[1] + cn * n[1]
    return dict(cx=round(cx, 2), cy=round(cy, 2), largo=round(largo, 2), grueso=round(grueso, 2),
                ang=round(math.degrees(ang), 2)), area(p) / (largo * grueso)

# ------------------------------------------------------------------ geometría

letras, ANCHO = gen.palabra()
LOGO = []
for nombre, segs in letras:
    for p in segs:
        caja, llenado = orientado(p)
        assert llenado > 0.62, f"{nombre}: el segmento no se parece a su rectángulo ({llenado:.2f})"
        LOGO.append(dict(d=d(p), letra=nombre, **caja))
assert len(LOGO) == 21, "el logo tiene que tener 21 segmentos: uno por mensaje"

W_CEL = S["anchos"][1]                                  # la celda de la O: 74 de ancho
CELDA = {k: d(p) for k, p in gen.celda(W_CEL, S["s"], S["g"]).items()}

# el más: barra central de la celda y un palo vertical partido con el mismo corte g
s, g, H = S["s"], S["g"], gen.H
barra = gen.rect(6, H / 2 - s / 2, W_CEL - 6, H / 2 + s / 2)
palo_sup = gen.rect(W_CEL / 2 - s / 2, 18, W_CEL / 2 + s / 2, H / 2 - s / 2 - g)
palo_inf = gen.rect(W_CEL / 2 - s / 2, H / 2 + s / 2 + g, W_CEL / 2 + s / 2, H - 18)
MAS = [d(barra), d(palo_sup), d(palo_inf)]

# los dos puntos del reloj: cuadrados del grueso del segmento
DOS_PUNTOS = [d(gen.rect(0, 22, s, 22 + s)), d(gen.rect(0, H - 22 - s, s, H - 22))]

# ------------------------------------------------------------------ guion

TOMAS = [
    (1, "La hora", 0, 4),
    (2, "El chat", 4, 11),
    (3, "Kovat", 11, 17),
    (4, "La plata al día", 17, 28),
    (5, "Nadie se va en silencio", 28, 38),
    (6, "El cupo y la marca", 38, 49),
    (7, "La demo", 49, 56),
    (8, "Cierre", 56, 60),
]

# (toma, [(inicio, fin, texto, en_pantalla?)]): la voz se parte en subtítulos que caben en una línea.
# Lo que ya está escrito en pantalla (el logo, el lema) no se repite como subtítulo.
VOZ = [
    (1, [(1.7, 3.1, "Seis de la mañana."), (3.3, 4.4, "El box, lleno.")]),
    (2, [(4.8, 6.4, "La plata, los cupos"), (6.6, 8.4, "y quién dejó de venir:"),
         (8.7, 10.1, "todo en un chat.")]),
    (3, [(12.8, 13.5, "Kovat.", True), (13.8, 16.1, "La plataforma para boxes en Colombia.", True)]),
    (4, [(17.4, 20.0, "Cada atleta con su fecha de corte."),
         (20.3, 22.9, "Sabes quién debe, cuánto y desde cuándo."),
         (23.2, 25.8, "El recordatorio queda listo con un toque.")]),
    (5, [(29.2, 31.8, "Kovat nota cuando alguien deja de venir"), (32.1, 33.5, "y te lo muestra"),
         (33.8, 36.4, "antes de que se vaya del todo.")]),
    (6, [(38.5, 41.4, "Tus atletas reservan su cupo desde el celular,"), (41.6, 42.8, "sin instalar nada,"),
         (43.1, 45.3, "y ven cómo suben sus marcas.")]),
    (7, [(49.5, 51.8, "Pide una demo de veinte minutos"), (52.0, 54.6, "con los datos de tu propio box.")]),
]

# 21 mensajes: se leen los primeros, después se amontonan. El último repite el primero.
MENSAJES = [
    ("Luisa", "¿Hay cupo a las 6?", "5:41 a. m."),
    ("Mateo", "Profe, ya le transferí. ¿Le mando el pantallazo?", "5:42 a. m."),
    ("Valentina", "¿Mañana sí hay clase o es festivo?", "5:44 a. m."),
    ("Andrés", "Me congela el plan, que me voy de viaje", "5:45 a. m."),
    ("Daniela", "¿Cuánto debo?", "5:47 a. m."),
    ("Camilo", "Me anotan para las 7, porfa", "5:48 a. m."),
    ("Julián", "¿El plan de 12 clases cuánto vale?", "5:49 a. m."),
    ("Laura", "Ya pagué por Nequi", "5:50 a. m."),
    ("Santiago", "¿Todavía hay cupo?", "5:51 a. m."),
    ("Manuela", "No puedo ir hoy, ¿me guardan la clase?", "5:51 a. m."),
    ("Felipe", "¿A quién le pago?", "5:52 a. m."),
    ("Paula", "Llevo tres semanas sin ir, ¿me pausan?", "5:53 a. m."),
    ("Sebastián", "¿Qué entrenamos hoy?", "5:54 a. m."),
    ("Carolina", "¿Me confirma si le llegó?", "5:55 a. m."),
    ("David", "Voy con un amigo, ¿puede entrar?", "5:55 a. m."),
    ("Isabela", "¿El jueves a qué hora?", "5:56 a. m."),
    ("Tomás", "Profe, se me pasó la fecha de pago", "5:57 a. m."),
    ("Mariana", "¿Hay cupo?", "5:57 a. m."),
    ("Juan José", "¿Cuánto es la mensualidad?", "5:58 a. m."),
    ("Sara", "¿Quién tiene la lista de hoy?", "5:59 a. m."),
    ("Luisa", "¿Hay cupo a las 6?", "6:00 a. m."),
]
# cada vez más seguido: los cinco primeros dan tiempo de leer
APARECE = [4.3, 5.0, 5.6, 6.1, 6.55]
paso = 0.40
while len(APARECE) < 20:
    APARECE.append(round(APARECE[-1] + paso, 2))
    paso = max(0.12, paso * 0.86)
APARECE.append(round(APARECE[-1] + 0.45, 2))            # el último llega solo, un instante después
assert len(MENSAJES) == len(LOGO) == len(APARECE) and APARECE[-1] < 10.6

# ------------------------------------------------------------------ comprobaciones del guion

t = 0
for n, _, ini, fin in TOMAS:
    assert ini == t and fin > ini, f"toma {n}: hueco o solape"
    t = fin
assert t == 60, "el video dura 60 s"

SUBS = [(a, b, txt, bool(resto and resto[0])) for _, tramos in VOZ for a, b, txt, *resto in tramos]
fin_ant = 0
for a, b, txt, _ in SUBS:
    palabras = len(re.findall(r"\w+", txt))
    assert a >= fin_ant + 0.15, f"«{txt}»: pegado al anterior"
    assert palabras / (b - a) <= 3.0, f"«{txt}»: {palabras / (b - a):.1f} palabras por segundo"
    assert 0 <= a < b <= 60
    fin_ant = b

guion = os.path.join(SAL, "guion.md")
if os.path.exists(guion):
    texto = open(guion, encoding="utf-8").read()
    en_md = re.findall(r"\*\*Voz:\*\* “([^”]+)”", texto)
    esperado = [" ".join(tr[2] for tr in tramos) for _, tramos in VOZ]
    assert en_md == esperado, f"guion.md y los subtítulos no coinciden:\n{en_md}\n{esperado}"
    tomas_md = [tuple(map(int, m)) for m in re.findall(r"### Toma (\d), de 0:(\d\d) a (?:0|1):(\d\d)", texto)]
    esperado = [(n, ini, fin % 60) for n, _, ini, fin in TOMAS]
    assert tomas_md == esperado, f"guion.md y las tomas no coinciden:\n{tomas_md}\n{esperado}"

# ------------------------------------------------------------------ salida

DATOS = dict(
    H=H, anchoLogo=round(ANCHO, 2), logo=LOGO, anchoCelda=W_CEL, espacio=S["track"], grueso=s,
    celda=CELDA, mas=MAS, dosPuntos=DOS_PUNTOS, digitos=gen.DIGITOS,
    tomas=[dict(n=n, nombre=nom, inicio=a, fin=b) for n, nom, a, b in TOMAS],
    subtitulos=[dict(inicio=a, fin=b, texto=txt, enPantalla=ep) for a, b, txt, ep in SUBS],
    mensajes=[dict(quien=q, texto=txt, hora=h, t=t) for (q, txt, h), t in zip(MENSAJES, APARECE)],
)
cuerpo = json.dumps(DATOS, ensure_ascii=False, separators=(",", ":"))
ruta = B.escribir(os.path.join("video", "datos.js"),
                  "// Generado por docs/marca/fuente/video.py. No editar a mano.\n"
                  f"window.KOVAT_DATOS = {cuerpo};\n")

if __name__ == "__main__":
    print(os.path.basename(ruta), os.path.getsize(ruta), "bytes")
    print("segmentos del logo:", len(LOGO), "| mensajes:", len(MENSAJES), "| último mensaje:", APARECE[-1], "s")
    for a, b, txt, _ in SUBS:
        n = len(re.findall(r"\w+", txt))
        print(f"  {a:5.1f}–{b:5.1f}  {n / (b - a):.1f} p/s  {txt}")
    print("palabras de voz:", sum(len(re.findall(r"\w+", x)) for _, _, x, _ in SUBS))
