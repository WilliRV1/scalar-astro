"""Página para elegir entre las tres opciones de neutros: la misma pantalla de la app en cada una."""
import os
import colores as C

DESCRIPCION = {
    "tarima": ("Tarima", "Negro cálido casi neutro, como el caucho de la tarima de levantamiento. El rojo se lee como un LED sobre un marcador apagado."),
    "grafito": ("Grafito", "Gris frío, azulado. El rojo resalta más por el choque de temperatura; se siente más técnico y más frío."),
    "pista": ("Pista", "Neutros con tinte rojizo, como los que Material deriva del rojo. Todo parece de la misma familia; el rojo resalta menos."),
}
MUESTRAS = ["superficie", "superficie-contenedor", "superficie-mas-alta", "texto", "texto-secundario",
            "marca", "error", "exito", "aviso"]

def variables(o):
    reglas = []
    for n in C.NIVELES:
        sel = f'.op[data-opcion="{o}"]' if n == "estandar" else f'body[data-nivel="{n}"] .op[data-opcion="{o}"]'
        cuerpo = " ".join(f"--k-{k}:{v};" for k, v in C.TODAS[o][n].items())
        reglas.append(f"{sel}{{{cuerpo}}}")
    return "\n".join(reglas)

ICONO = {
    "error": '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.5v4.2M8 10.8v.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    "aviso": '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.8V8l2.2 1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    "exito": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l2.8 2.8 6.2-6.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}
MESES = [("abr", 3.1), ("may", 3.4), ("jun", 2.9), ("jul", 3.6), ("ago", 3.8), ("sep", 4.2)]

def grafica():
    alto, ancho, pad = 120, 300, 22
    maximo = 5.0
    paso = (ancho - pad) / len(MESES)
    barras, etiquetas, rejilla = [], [], []
    for y in (1, 2, 3, 4, 5):
        yy = alto - y / maximo * (alto - 10)
        rejilla.append(f'<line x1="{pad}" x2="{ancho}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="var(--k-grafica-rejilla)" stroke-width="1"/>'
                       f'<text x="{pad - 6}" y="{yy + 4:.1f}" text-anchor="end" class="eje">{y}</text>')
    for i, (mes, v) in enumerate(MESES):
        x = pad + i * paso + paso * 0.22
        w = paso * 0.56
        h = v / maximo * (alto - 10)
        barras.append(f'<path d="M{x:.1f},{alto} V{alto - h + 4:.1f} q0,-4 4,-4 h{w - 8:.1f} q4,0 4,4 V{alto} Z" fill="var(--k-grafica-1)">'
                      f'<title>{mes}: ${v:.1f} millones</title></path>')
        etiquetas.append(f'<text x="{x + w / 2:.1f}" y="{alto + 14}" text-anchor="middle" class="eje">{mes}</text>')
    ultimo = MESES[-1][1]
    x = pad + (len(MESES) - 1) * paso + paso / 2
    etiquetas.append(f'<text x="{x:.1f}" y="{alto - ultimo / maximo * (alto - 10) - 6:.1f}" text-anchor="middle" class="valor">$4,2 M</text>')
    return (f'<svg viewBox="0 0 {ancho} {alto + 20}" class="grafica" role="img" aria-label="Ingresos por mes, de abril a septiembre, en millones de pesos">'
            + "".join(rejilla) + f'<line x1="{pad}" x2="{ancho}" y1="{alto}" y2="{alto}" stroke="var(--k-contorno-variante)"/>'
            + "".join(barras) + "".join(etiquetas) + "</svg>")

def pantalla():
    fila = lambda nombre, estado, texto_estado, valor: (
        f'<div class="fila"><div><div class="quien">{nombre}</div>'
        f'<span class="chip {estado}">{ICONO[estado]}{texto_estado}</span></div><div class="plata">{valor}</div></div>')
    return f"""
  <div class="pantalla">
    <div class="barra-app"><div class="titulo">Cartera</div><div class="sub">3 atletas con saldo en septiembre</div></div>
    <div class="marcador"><span class="lbl">Momento de marca</span><span class="reloj">12:45</span></div>
    <div class="tarjeta">
      {fila("Juan Pérez", "error", "En mora hace 12 días", "$179.000")}
      {fila("Camila Ñústez", "aviso", "Vence el viernes", "$89.500")}
      {fila("Andrés Illera", "exito", "Al día", "$0")}
    </div>
    <label class="campo-lbl" for="v-{{o}}">Valor del pago</label>
    <div class="campo error-campo" id="v-{{o}}">$0</div>
    <div class="ayuda-error">{ICONO["error"]}El valor no puede ser cero.</div>
    <div class="botones">
      <button type="button" class="b-principal">Registrar pago</button>
      <button type="button" class="b-tonal">Escribir por WhatsApp</button>
      <button type="button" class="b-texto">Cancelar</button>
    </div>
    <div class="tarjeta grafica-caja"><div class="g-tit">Ingresos por mes</div>{grafica()}</div>
    <div class="aviso-flotante">Pago registrado <button type="button">Deshacer</button></div>
  </div>"""

def columna(o):
    nombre, desc = DESCRIPCION[o]
    fichas = "".join(f'<div class="ficha"><span class="color" style="background:var(--k-{k})"></span>'
                     f'<span class="fn">{k.replace("-", " ")}</span><span class="hex" data-token="{k}"></span></div>' for k in MUESTRAS)
    return f"""
<section class="op" data-opcion="{o}">
  <h2>{nombre}</h2>
  <p class="desc">{desc}</p>
  {pantalla().replace("{o}", o)}
  <div class="fichas">{fichas}</div>
</section>"""

pagina = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kovat: opciones de color</title>
<link rel="stylesheet" href="kovat-colores.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@font-face {{ font-family:"Kovat Marcador"; src:url("../tipografia/KovatMarcador-Regular.woff") format("woff"); }}
{chr(10).join(variables(o) for o in C.OPCIONES)}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--k-superficie-mas-baja); color:var(--k-texto); font:15px/1.5 "Atkinson Hyperlegible Next", sans-serif; }}
main {{ max-width:1240px; margin:0 auto; padding:28px 16px 64px; }}
h1 {{ font:400 clamp(40px, 7vw, 64px)/1.1 "Kovat Marcador"; color:var(--k-marca); margin:0; }}
.intro {{ color:var(--k-texto-secundario); max-width:72ch; margin:10px 0 0; }}
.reglas {{ color:var(--k-texto-secundario); max-width:80ch; padding-left:18px; }}
.niveles {{ display:flex; gap:8px; flex-wrap:wrap; margin:16px 0 8px; align-items:center; }}
.niveles button {{ font:600 14px "Atkinson Hyperlegible Next"; padding:8px 14px; background:transparent; color:var(--k-texto); border:1px solid var(--k-contorno); cursor:pointer; }}
.niveles button[aria-pressed="true"] {{ background:var(--k-texto); color:var(--k-superficie); }}
.niveles button:focus-visible {{ outline:2px solid var(--k-foco); outline-offset:2px; }}
.grilla {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:20px; margin-top:12px; }}
.op {{ background:var(--k-superficie); color:var(--k-texto); padding:18px; border:1px solid var(--k-contorno-variante); }}
.op h2 {{ margin:0; font-size:22px; }}
.desc {{ color:var(--k-texto-secundario); font-size:13px; margin:4px 0 14px; min-height:60px; }}
.pantalla {{ display:grid; gap:10px; }}
.barra-app .titulo {{ font-size:20px; font-weight:700; }}
.barra-app .sub {{ color:var(--k-texto-secundario); font-size:13px; }}
.marcador {{ background:var(--k-superficie-mas-baja); padding:8px 12px; display:flex; justify-content:space-between; align-items:center; }}
.marcador .lbl {{ font-size:12px; color:var(--k-texto-secundario); }}
.marcador .reloj {{ font:400 40px/1 "Kovat Marcador"; color:var(--k-marca); font-variant-numeric:tabular-nums; }}
.tarjeta {{ background:var(--k-superficie-contenedor); padding:4px 12px; }}
.fila {{ display:flex; justify-content:space-between; gap:10px; padding:9px 0; border-bottom:1px solid var(--k-contorno-variante); }}
.fila:last-child {{ border-bottom:0; }}
.quien {{ font-weight:600; }}
.plata {{ font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap; }}
.chip {{ display:inline-flex; gap:5px; align-items:center; font-size:12px; font-weight:600; padding:2px 8px 2px 6px; margin-top:3px; }}
.chip svg {{ width:14px; height:14px; }}
.chip.error {{ background:var(--k-error-contenedor); color:var(--k-sobre-error-contenedor); }}
.chip.aviso {{ background:var(--k-aviso-contenedor); color:var(--k-sobre-aviso-contenedor); }}
.chip.exito {{ background:var(--k-exito-contenedor); color:var(--k-sobre-exito-contenedor); }}
.campo-lbl {{ font-size:13px; color:var(--k-texto-secundario); margin-bottom:-6px; }}
.campo {{ border:1px solid var(--k-contorno); padding:10px 12px; font-size:16px; font-variant-numeric:tabular-nums; }}
.error-campo {{ border:2px solid var(--k-error); }}
.ayuda-error {{ color:var(--k-error); font-size:13px; display:flex; gap:6px; align-items:center; margin-top:-4px; }}
.ayuda-error svg {{ width:14px; height:14px; }}
.botones {{ display:flex; flex-wrap:wrap; gap:8px; }}
.botones button {{ font:700 15px "Atkinson Hyperlegible Next"; padding:11px 16px; border:0; cursor:pointer; }}
.b-principal {{ background:var(--k-primario-contenedor); color:var(--k-sobre-primario-contenedor); }}
.b-tonal {{ background:var(--k-secundario-contenedor); color:var(--k-sobre-secundario-contenedor); }}
.b-texto {{ background:transparent; color:var(--k-enlace); text-decoration:underline; text-underline-offset:3px; }}
.botones button:focus-visible {{ outline:2px solid var(--k-foco); outline-offset:2px; }}
.botones button:hover {{ filter:brightness(1.08); }}
.grafica-caja {{ background:var(--k-grafica-superficie); padding:10px 12px; }}
.g-tit {{ font-size:13px; font-weight:600; margin-bottom:4px; }}
.grafica {{ width:100%; height:auto; display:block; }}
.grafica .eje {{ font-size:10px; fill:var(--k-texto-secundario); }}
.grafica .valor {{ font-size:11px; font-weight:700; fill:var(--k-texto); }}
.aviso-flotante {{ background:var(--k-invertida); color:var(--k-sobre-invertida); padding:10px 12px; display:flex; justify-content:space-between; align-items:center; font-size:14px; }}
.aviso-flotante button {{ background:none; border:0; color:var(--k-sobre-invertida); font:700 14px "Atkinson Hyperlegible Next"; text-decoration:underline; cursor:pointer; }}
.fichas {{ display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:14px; }}
.ficha {{ font-size:11px; color:var(--k-texto-secundario); display:grid; gap:2px; }}
.ficha .color {{ height:34px; border:1px solid var(--k-contorno-variante); display:block; }}
.ficha .fn {{ color:var(--k-texto); }}
.ficha .hex {{ font-variant-numeric:tabular-nums; }}
</style></head>
<body data-nivel="estandar"><main>
<h1>COLORES</h1>
<p class="intro">Tres opciones del mismo sistema, hechas con el método de Material 3 y la misma pantalla de la app. Lo único que cambia es la familia de neutros, que es lo que cubre casi toda la pantalla. Las tres pasan todos los contrastes en los tres niveles.</p>
<ul class="reglas">
  <li>El texto rojo significa error. El rojo de la marca va en rellenos e indicadores, y en los momentos de marca con Kovat Marcador.</li>
  <li>Verde y ámbar solo para estados, siempre con ícono y texto.</li>
  <li>Nombres y cifras de ejemplo.</li>
</ul>
<div class="niveles" role="group" aria-label="Nivel de contraste">
  <button type="button" data-n="estandar" aria-pressed="true">Contraste estándar</button>
  <button type="button" data-n="medio" aria-pressed="false">Medio</button>
  <button type="button" data-n="alto" aria-pressed="false">Alto</button>
</div>
<div class="grilla">{"".join(columna(o) for o in C.OPCIONES)}</div>
</main>
<script>
function pintarHex() {{
  document.querySelectorAll('.hex').forEach(el => {{
    const v = getComputedStyle(el.closest('.op')).getPropertyValue('--k-' + el.dataset.token).trim();
    el.textContent = v.toUpperCase();
  }});
}}
document.querySelectorAll('.niveles button').forEach(b => b.addEventListener('click', () => {{
  document.body.dataset.nivel = b.dataset.n;
  document.querySelectorAll('.niveles button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  pintarHex();
}}));
pintarHex();
</script>
</body></html>"""

RUTA = os.path.join(C.SAL, "opciones.html")
open(RUTA, "w", encoding="utf-8", newline="\n").write(pagina)
print("ok", RUTA, len(pagina) // 1024, "KB")
