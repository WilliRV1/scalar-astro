"""Muestrario de Kovat Marcador: mapa de caracteres, cascada de tamaños y ejemplos de uso.

Sale de la misma lista de caracteres de tipografia.py, así que nunca muestra uno que no exista.
La fuente va incrustada: la página funciona sin internet.
"""
import os, base64, html
import tipografia as T

WOFF64 = base64.b64encode(open(T.WOFF, "rb").read()).decode()
GRUPOS = [
    ("Letras", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    ("Español", "ÑÁÉÍÓÚÜ"),
    ("Números", "0123456789"),
    ("Signos", ".,:;-–+/%$()!¡?¿'\"=_"),
]
todos = "".join(c for _, cs in GRUPOS for c in cs)
faltan = [c for c in T.G if c != " " and c not in todos]
assert not faltan, f"el muestrario no muestra: {faltan}"
NOMBRES = {".": "punto", ",": "coma", ":": "dos puntos", ";": "punto y coma", "-": "guion", "–": "raya corta",
           "+": "más", "/": "barra", "%": "por ciento", "$": "pesos", "#": "número", "(": "abre", ")": "cierra",
           "!": "cierra admiración", "¡": "abre admiración", "?": "cierra pregunta", "¿": "abre pregunta",
           "'": "apóstrofo", '"': "comillas", "=": "igual", "_": "guion bajo"}

def celda(c):
    nombre = NOMBRES.get(c, "")
    return (f'<figure class="gl"><span class="m" aria-hidden="true">{html.escape(c)}</span>'
            f'<figcaption>{html.escape(c)}{" · " + nombre if nombre else ""}</figcaption></figure>')

mapa = "".join(f'<h3>{t}</h3><div class="mapa">{"".join(celda(c) for c in cs)}</div>' for t, cs in GRUPOS)
cascada = "".join(f'<div class="paso"><span class="px">{px} px</span><span class="m" style="font-size:{px}px">KOVAT 21-15-9</span></div>'
                  for px in (160, 96, 64, 48, 32))

pagina = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700&display=swap" rel="stylesheet">
<title>Kovat Marcador</title>
<link rel="stylesheet" href="../colores/kovat-colores.css">
<style>
  @font-face {{ font-family:"Kovat Marcador"; src:url(data:font/woff;base64,{WOFF64}) format("woff"); font-display:block; }}
  :root {{ --tarima:var(--k-superficie); --panel:var(--k-superficie-contenedor); --linea:var(--k-contorno-variante); --led:var(--k-marca); --tiza:var(--k-texto); --hierro:var(--k-texto-secundario); }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--tarima); color:var(--tiza); font:15px/1.5 "Atkinson Hyperlegible Next", sans-serif; }}
  main {{ max-width:1100px; margin:0 auto; padding:40px 16px 80px; }}
  .m {{ font-family:"Kovat Marcador"; font-kerning:normal; line-height:1.1; }}
  .tab {{ font-variant-numeric:tabular-nums; }}
  h1 {{ margin:0; font-weight:400; font-size:clamp(56px, 12vw, 120px); color:var(--led); }}
  .intro {{ color:var(--hierro); max-width:68ch; margin:12px 0 0; }}
  h2 {{ font-size:13px; font-weight:600; color:var(--hierro); margin:56px 0 12px; }}
  h3 {{ font-size:13px; font-weight:400; color:var(--hierro); margin:24px 0 8px; }}
  .mapa {{ display:grid; grid-template-columns:repeat(auto-fill, minmax(92px, 1fr)); gap:1px; background:var(--linea);
          border:1px solid var(--linea); }}
  .gl {{ margin:0; background:var(--tarima); padding:14px 8px 8px; display:flex; flex-direction:column; align-items:center; }}
  .gl .m {{ font-size:64px; color:var(--tiza); height:84px; display:flex; align-items:center; }}
  .gl figcaption {{ font-size:11px; color:var(--hierro); text-align:center; min-height:16px; }}
  .paso {{ display:flex; align-items:baseline; gap:16px; border-top:1px solid var(--linea); padding:10px 0; overflow:hidden; }}
  .px {{ width:56px; flex:none; color:var(--hierro); font-size:12px; }}
  .paso .m {{ color:var(--led); white-space:nowrap; }}
  .usos {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; }}
  .uso {{ background:var(--panel); padding:20px; }}
  .uso p {{ margin:8px 0 0; color:var(--hierro); font-size:13px; }}
  .reloj {{ font-size:clamp(72px, 14vw, 132px); color:var(--led); }}
  table {{ width:100%; border-collapse:collapse; }}
  td {{ padding:6px 4px; border-top:1px solid var(--linea); font-size:30px; }}
  td.n {{ color:var(--hierro); width:1%; }} td.t {{ text-align:right; color:var(--led); }}
  .compara {{ display:grid; gap:8px; }}
  .compara div {{ font-size:40px; }}
  .compara span {{ font-family:"Atkinson Hyperlegible Next", sans-serif; font-size:12px; color:var(--hierro); margin-left:10px; }}
  label {{ display:block; color:var(--hierro); font-size:13px; margin:0 0 6px; }}
  input {{ width:100%; font-family:"Kovat Marcador"; font-size:clamp(32px, 6vw, 56px); padding:12px 16px;
          background:var(--panel); color:var(--led); border:1px solid var(--linea); }}
  input:focus-visible {{ outline:2px solid var(--led); outline-offset:2px; }}
  ul {{ color:var(--hierro); padding-left:18px; max-width:72ch; }}
  li {{ margin:4px 0; }} code {{ color:var(--tiza); }}
</style></head>
<body><main>
<h1 class="m">KOVAT MARCADOR</h1>
<p class="intro">La tipografía del logo. Cada carácter está hecho con la misma celda de segmentos, las mismas puntas y el mismo corte. {len(T.G) - 1} caracteres; las minúsculas muestran la mayúscula, como en un marcador.</p>

<h2>Escribe para probarla</h2>
<label for="probar">Tu texto</label>
<input id="probar" type="text" value="BOX NORTE 21-15-9" maxlength="48" autocomplete="off" spellcheck="false">

<h2>Todos los caracteres</h2>
{mapa}

<h2>Tamaños</h2>
{cascada}
<p class="intro">Desde 32 px. Más chico, las uniones en punta se funden y algunas letras se confunden.</p>

<h2>Así se usa</h2>
<div class="usos">
  <div class="uso"><div class="m reloj tab">12:45</div><p>Cronómetro de la clase o del heat, con números tabulares.</p></div>
  <div class="uso">
    <table class="m tab">
      <tr><td class="n">1</td><td>MUÑOZ</td><td class="t">4:32</td></tr>
      <tr><td class="n">2</td><td>PEÑA</td><td class="t">4:51</td></tr>
      <tr><td class="n">3</td><td>ÁLVAREZ</td><td class="t">5:08</td></tr>
    </table>
    <p>Pantalla de resultados de una competencia (nombres y tiempos de ejemplo).</p>
  </div>
  <div class="uso"><div class="m" style="font-size:48px;color:var(--tiza)">$179.000</div>
    <div class="m" style="font-size:30px;color:var(--led);margin-top:6px">HEAT 3 - ESCALADO</div><p>Plata y rótulos cortos.</p></div>
</div>

<h2>Números</h2>
<div class="compara">
  <div class="m" style="color:var(--tiza)">11:01 21-15-9<span>por defecto: el 1 es angosto</span></div>
  <div class="m tab" style="color:var(--led)">11:01 21-15-9<span>tabular-nums: todos miden lo mismo</span></div>
</div>

<h2>Cómo instalarla</h2>
<ul>
  <li>En tu computador (Canva, Figma, Word): abre <code>KovatMarcador-Regular.ttf</code> y dale "Instalar".</li>
  <li>En la web: enlaza <code>kovat-marcador.css</code> y usa la clase <code>marcador</code>; para cronómetros y columnas de plata, agrega <code>marcador-numeros</code>.</li>
  <li>No le agregues espaciado entre letras: ya viene en la fuente.</li>
</ul>
</main>
<script>
  const campo = document.getElementById('probar');
  const muestra = document.querySelector('h1');
  campo.addEventListener('input', () => {{ muestra.textContent = campo.value || 'KOVAT MARCADOR'; }});
</script>
</body></html>
"""
RUTA = os.path.join(T.SAL, "muestra.html")
with open(RUTA, "w", encoding="utf-8", newline="\n") as f:
    f.write(pagina)
print("ok", RUTA, len(pagina) // 1024, "KB")
