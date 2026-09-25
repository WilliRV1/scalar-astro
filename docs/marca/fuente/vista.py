"""Página de vista previa: cada SVG va incrustado, así la página funciona sola, sin servidor."""
import os, json, base64
import gen
import estados
import tipografia

SAL = os.path.dirname(gen.OUT)  # docs/marca
leer = lambda n: open(os.path.join(SAL, n), encoding="utf-8").read()

GRUPOS = [
    ("Intros", "Para abrir videos, la app o la pantalla de una competencia. Todas duran menos de 3 s y terminan en el logo fijo.", [
        ("kovat-intro-encendido.svg", "Encendido", "1,9 s. La palabra se prende en un barrido de izquierda a derecha."),
        ("kovat-intro-cuenta-regresiva.svg", "Cuenta regresiva", "2,95 s. La O cuenta 3, 2, 1 y el 0 es la O de KOVAT; desde ahí se enciende el resto."),
        ("kovat-intro-barajado.svg", "Barajado", "2,5 s. Cada letra pasa por números como un marcador calculando y se fija de izquierda a derecha."),
        ("kovat-intro-acercamiento.svg", "Acercamiento", "2,6 s. Arranca dentro de una esquina de la O y la cámara se aleja hasta mostrar la palabra."),
        ("kovat-intro-21-15-9.svg", "21-15-9", "2,9 s. El marcador muestra 21, 15 y 9 repeticiones y se fija en KOVAT."),
    ]),
    ("Outros", "Para cerrar. Todas terminan en negro.", [
        ("kovat-outro-apagado.svg", "Apagado", "1,85 s. Se apaga de derecha a izquierda."),
        ("kovat-outro-al-cero.svg", "Al cero", "2,1 s. Las letras se apagan hacia la O, que queda sola como un 0."),
        ("kovat-outro-desarme.svg", "Desarme", "2 s. Los segmentos se sueltan y caen con gravedad."),
        ("kovat-outro-implosion.svg", "Implosión", "1,85 s. Todas las piezas son absorbidas por el cero, que se cierra."),
        ("kovat-outro-suelta-la-barra.svg", "Suelta la barra", "2,1 s. Toma impulso, cae, rebota como un disco de caucho y se apaga."),
    ]),
    ("Cargando", "Se repite sin salto mientras carga la app.", [
        ("kovat-loop-cargando.svg", "Cargando", "Ciclo de 1,2 s. Una luz le da la vuelta al cero."),
    ]),
]
ANIM = [a for _, _, lista in GRUPOS for a in lista]
FIJOS = [
    ("kovat-logo-rojo.svg", "Logo rojo", "oscuro"), ("kovat-logo-blanco.svg", "Logo blanco", "oscuro"),
    ("kovat-logo-negro.svg", "Logo negro (una tinta)", "claro"),
]
ICONOS = [("kovat-icono-app.svg", "Ícono de la app"), ("kovat-favicon.svg", "Favicon")]

datos = {n: leer(n) for n, *_ in ANIM + FIJOS + ICONOS}
EST_NORMAL = {n: par[0] for n, par in estados.VARIANTES.items()}
EST_REDUCIDO = {n: par[1] for n, par in estados.VARIANTES.items()}
WOFF64 = base64.b64encode(open(tipografia.WOFF, "rb").read()).decode()

fichas_estado = "".join(f"""
<figure class="estado">
  <div class="tile"><span class="e" data-estado="{a}" style="width:120px"></span><span class="e" data-estado="{a}" style="width:40px"></span><span class="e" data-estado="{a}" style="width:24px"></span></div>
  <figcaption><strong>{t}</strong> <span>{u}</span><br>{c}, {tipo.lower()}.<br><code>estados/{a}</code>{'' if tipo == 'Bucle' else ''}
  {'<button type="button" data-repetir-estado="' + a + '">Repetir</button>' if tipo != 'Bucle' else ''}</figcaption>
</figure>""" for a, t, u, c, tipo, ciclo in estados.FICHAS)

CARACTERES = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ ÁÉÍÓÚÜ 0123456789 .,:;-–+/%$()!¡?¿'\"=_"

def tarjeta(n, t, d):
    return f"""
<figure class="anim">
  <div class="marco" data-svg="{n}"></div>
  <figcaption><strong>{t}</strong> <span>{d}</span>
  <button type="button" data-repetir="{n}">Repetir</button></figcaption>
</figure>"""

secciones = "".join(f"""
<h2>{titulo}</h2>
<p>{nota}</p>
<div class="grilla">{"".join(tarjeta(*a) for a in lista)}</div>""" for titulo, nota, lista in GRUPOS)

fijos = "".join(f"""
<figure class="{c}"><div class="fijo" data-svg="{n}"></div><figcaption>{t}<br><code>{n}</code></figcaption></figure>"""
                for n, t, c in FIJOS)
iconos = "".join(f"""
<figure><div class="iconos">
  <span class="ico" style="width:180px;border-radius:40px" data-svg="{n}"></span>
  <span class="ico" style="width:60px;border-radius:13px" data-svg="{n}"></span>
  <span class="ico" style="width:32px;border-radius:6px" data-svg="{n}"></span>
  <span class="ico" style="width:16px;border-radius:3px" data-svg="{n}"></span>
</div><figcaption>{t}<br><code>{n}</code></figcaption></figure>""" for n, t in ICONOS)

html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700&display=swap" rel="stylesheet">
<title>Kovat: logotipo y animaciones</title>
<link rel="stylesheet" href="colores/kovat-colores.css">
<style>
  :root {{ --fondo:var(--k-superficie); --texto:var(--k-texto); --suave:var(--k-texto-secundario); --tarima:var(--k-pieza-tarima); }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--fondo); color:var(--texto);
         font:16px/1.5 "Atkinson Hyperlegible Next", sans-serif; }}
  main {{ max-width:1100px; margin:0 auto; padding:40px 16px 80px; }}
  h1 {{ font-size:26px; margin:0 0 4px; }}
  h2 {{ font-size:19px; margin:48px 0 12px; }}
  p {{ margin:0 0 12px; color:var(--suave); max-width:70ch; }}
  .grilla {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; }}
  figure {{ margin:0; }}
  figcaption {{ font-size:14px; color:var(--suave); padding-top:8px; }}
  figcaption strong {{ color:var(--texto); display:block; }}
  .marco img {{ display:block; width:100%; height:auto; aspect-ratio:16/9; background:var(--tarima); }}
  .fijo {{ padding:36px 28px; }}
  .fijo img {{ display:block; width:100%; max-width:420px; height:auto; }}
  .oscuro .fijo {{ background:var(--tarima); }}
  .claro .fijo {{ background:var(--k-pieza-papel); }}
  .iconos {{ display:flex; gap:20px; align-items:flex-end; flex-wrap:wrap; }}
  .ico {{ display:block; overflow:hidden; line-height:0; }}
  .ico img {{ width:100%; height:auto; display:block; }}
  code {{ font-size:13px; }}
  button {{ margin-top:8px; font:600 14px "Atkinson Hyperlegible Next", sans-serif; padding:8px 14px;
           border:1px solid var(--texto); background:transparent; color:var(--texto); cursor:pointer; }}
  button:hover {{ background:var(--texto); color:var(--fondo); }}
  button:focus-visible {{ outline:2px solid var(--k-foco); outline-offset:2px; }}
  @font-face {{ font-family:"Kovat Marcador"; src:url(data:font/woff;base64,{WOFF64}) format("woff"); font-display:block; }}
  .marcador {{ font-family:"Kovat Marcador", sans-serif; font-kerning:normal; }}
  .marcador-numeros {{ font-variant-numeric:tabular-nums; }}
  .estados .tile {{ background:var(--tarima); padding:20px; display:flex; gap:20px; align-items:flex-end; }}
  .e {{ display:block; line-height:0; }} .e img {{ width:100%; height:auto; display:block; }}
  .controles {{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }}
  .specimen {{ background:var(--tarima); color:var(--k-marca); font-size:clamp(28px, 5vw, 44px); line-height:1.35; padding:24px; word-break:break-all; }}
  .muestras {{ background:var(--tarima); color:var(--k-pieza-tiza); padding:0 24px 24px; }}
  .m1 {{ font-size:clamp(64px, 14vw, 140px); color:var(--k-marca); line-height:1.1; }}
  .m2 {{ font-size:clamp(26px, 4vw, 36px); line-height:1.4; }}
  .prueba {{ display:block; margin-top:16px; font-size:14px; color:var(--suave); }}
  #probar {{ width:100%; font-size:clamp(28px, 5vw, 40px); padding:10px 14px; background:var(--tarima); color:var(--k-marca);
            border:1px solid var(--k-contorno); }}
  #probar:focus-visible {{ outline:2px solid var(--k-foco); outline-offset:2px; }}
</style></head>
<body><main>
<h1>Kovat: logotipo y animaciones</h1>
<p>KOVAT escrito con segmentos, como el marcador de una final. Todos los cortes miden lo mismo y cada segmento es una pieza aparte, por eso la marca se puede encender y apagar.</p>
<p>Cada animación es un SVG de 1920 × 1080 que se anima solo, sin código aparte. Abre el archivo en el navegador o úsalo como imagen.</p>
{secciones}
<h2>Logo</h2>
<div class="grilla">{fijos}</div>
<h2>Estados de la interfaz</h2>
<p>Solo la O, que es la celda de display del logo. Para superficies oscuras, a 120, 40 y 24 px. Respetan la opción del sistema "reducir movimiento": lo que gira, se llena o se sacude pasa a una respiración suave o a su estado final.</p>
<div class="controles"><button type="button" id="modo">Ver con movimiento reducido</button> <span id="modo-txt">Mostrando: movimiento normal</span></div>
<div class="grilla estados">{fichas_estado}</div>

<h2>Tipografía: Kovat Marcador</h2>
<p>La fuente del logo, completa: A–Z, Ñ, vocales con tilde, Ü, números y signos para tiempos, plata, fechas y marcadores. Solo mayúsculas, como un marcador. Para títulos, números y pantallas de competencia desde 32 px; no para textos largos. Archivos: <code>tipografia/KovatMarcador-Regular.woff</code>, <code>.ttf</code> y <code>kovat-marcador.css</code>.</p>
<div class="specimen marcador">{CARACTERES}</div>
<div class="muestras marcador">
  <div class="m1 marcador-numeros">12:45</div>
  <div class="m2">$179.000 &nbsp; 21-15-9 &nbsp; 100%</div>
  <div class="m2">MUÑOZ, PEÑA, ÁLVAREZ</div>
  <div class="m2">HEAT 3 - ESCALADO - CARRIL 4</div>
</div>
<label class="prueba" for="probar">Escribe para probarla</label>
<input id="probar" class="marcador" type="text" value="BOX NORTE 21-15-9" maxlength="40" autocomplete="off">

<h2>Ícono</h2>
<p>La K en rojo sobre negro, a 180, 60, 32 y 16 px.</p>
<div class="grilla">{iconos}</div>
</main>
<script>
const SVG = {json.dumps(datos)};
function pintar(el) {{
  const url = URL.createObjectURL(new Blob([SVG[el.dataset.svg]], {{ type: 'image/svg+xml' }}));
  const img = new Image();
  img.alt = el.dataset.svg;
  img.src = url;
  el.replaceChildren(img);
}}
document.querySelectorAll('[data-svg]').forEach(pintar);
const EST = {{ normal: {json.dumps(EST_NORMAL)}, reducido: {json.dumps(EST_REDUCIDO)} }};
let modo = 'normal';
function pintarEstado(el) {{
  const url = URL.createObjectURL(new Blob([EST[modo][el.dataset.estado]], {{ type: 'image/svg+xml' }}));
  const img = new Image(); img.alt = el.dataset.estado; img.src = url; el.replaceChildren(img);
}}
const todosEstados = () => document.querySelectorAll('[data-estado]').forEach(pintarEstado);
todosEstados();
document.getElementById('modo').addEventListener('click', (ev) => {{
  modo = modo === 'normal' ? 'reducido' : 'normal';
  ev.target.textContent = modo === 'normal' ? 'Ver con movimiento reducido' : 'Ver con movimiento normal';
  document.getElementById('modo-txt').textContent = 'Mostrando: movimiento ' + modo;
  todosEstados();
}});
document.querySelectorAll('[data-repetir-estado]').forEach(b => b.addEventListener('click', () => {{
  document.querySelectorAll('[data-estado="' + b.dataset.repetirEstado + '"]').forEach(pintarEstado);
}}));
document.querySelectorAll('[data-repetir]').forEach(b => b.addEventListener('click', () => {{
  pintar(document.querySelector('.marco[data-svg="' + b.dataset.repetir + '"]'));
}}));
</script>
</body></html>"""

with open(os.path.join(SAL, "vista-previa.html"), "w", encoding="utf-8", newline="\n") as f:
    f.write(html)
print("ok", len(html) // 1024, "KB")
