"""Referencia del sistema de colores elegido (Tarima). La página usa el mismo kovat-colores.css."""
import os, html
import colores as C

GRUPOS = [
    ("Superficies", "Fondos y contenedores, de más bajo a más alto.",
     ["superficie", "superficie-mas-baja", "superficie-baja", "superficie-contenedor", "superficie-alta", "superficie-mas-alta", "superficie-brillante"]),
    ("Texto y líneas", "El texto nunca va en rojo de marca. Los enlaces van en el color del texto, subrayados.",
     ["texto", "texto-secundario", "enlace", "contorno", "contorno-variante"]),
    ("Marca", "Rellenos, indicadores, foco y momentos de marca. Nunca texto.",
     ["marca", "sobre-marca", "primario", "primario-contenedor", "sobre-primario-contenedor", "foco", "secundario-contenedor", "sobre-secundario-contenedor"]),
    ("Error", "Carmesí, distinto del rojo de la marca. Siempre con ícono y un mensaje que diga qué pasó.",
     ["error", "sobre-error", "error-contenedor", "sobre-error-contenedor", "error-indicador"]),
    ("Éxito y aviso", "Solo para estados, siempre con ícono y texto.",
     ["exito", "sobre-exito", "exito-contenedor", "sobre-exito-contenedor", "exito-indicador",
      "aviso", "sobre-aviso", "aviso-contenedor", "sobre-aviso-contenedor", "aviso-indicador"]),
    ("Invertidos", "Avisos flotantes sobre el resto de la interfaz.", ["invertida", "sobre-invertida", "velo"]),
    ("Gráficas", "Ocho series en orden fijo, validadas para daltonismo; secuencial en azul; divergente azul y rojo con centro gris.",
     ["grafica-superficie", "grafica-rejilla"] + [f"grafica-{i}" for i in range(1, 9)]
     + [f"grafica-secuencial-{k}" for k in C.SECUENCIAL] + ["grafica-diverge-negativo", "grafica-diverge-centro", "grafica-diverge-positivo"]),
]

def fila_token(k):
    celdas = "".join(f'<td class="hex">{C.T[n][k].upper()}</td>' for n in C.NIVELES)
    rol = C.MATERIAL.get(k, "")
    return (f'<tr><td><span class="sw" style="background:var(--k-{k})"></span></td>'
            f'<td><code>--k-{k}</code>{f"<br><span class=rol>{rol}</span>" if rol else ""}</td>{celdas}</tr>')

tablas = "".join(f"""
<h2>{t}</h2><p class="nota">{d}</p>
<table><thead><tr><th></th><th>Token</th><th>Estándar</th><th>Medio</th><th>Alto</th></tr></thead>
<tbody>{"".join(fila_token(k) for k in ks)}</tbody></table>""" for t, d, ks in GRUPOS)

def filas_contraste():
    pares = [(f[0], f[1], f[2]) for f in C.resultados["estandar"]]
    filas = []
    for tipo, fg, bg in pares:
        vals = []
        for n in C.NIVELES:
            f = next(x for x in C.resultados[n] if x[1] == fg and x[2] == bg and x[0] == tipo)
            vals.append(f'<td class="num">{f[5]:.2f}</td>')
        minimos = f"{C.MINIMO_TEXTO['estandar']} / {C.MINIMO_TEXTO['alto']}" if tipo == "texto" else "3"
        filas.append(f"<tr><td>{tipo}</td><td><code>{fg}</code> sobre <code>{bg}</code></td>{''.join(vals)}<td class='num'>{minimos}</td></tr>")
    return "".join(filas)

pagina = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kovat: sistema de colores</title>
<link rel="stylesheet" href="kovat-colores.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @font-face {{ font-family:"Kovat Marcador"; src:url("../tipografia/KovatMarcador-Regular.woff") format("woff"); }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--k-superficie); color:var(--k-texto); font:15px/1.5 "Atkinson Hyperlegible Next", sans-serif; }}
  main {{ max-width:1040px; margin:0 auto; padding:28px 16px 64px; }}
  h1 {{ font:400 clamp(40px, 7vw, 64px)/1.1 "Kovat Marcador"; color:var(--k-marca); margin:0; }}
  h2 {{ font-size:20px; margin:40px 0 4px; }}
  .nota {{ color:var(--k-texto-secundario); margin:0 0 10px; max-width:72ch; }}
  ol {{ max-width:76ch; }} li {{ margin:4px 0; }}
  .niveles {{ display:flex; gap:8px; flex-wrap:wrap; margin:18px 0 0; }}
  .niveles button {{ font:600 14px "Atkinson Hyperlegible Next"; padding:8px 14px; background:transparent; color:var(--k-texto);
                    border:1px solid var(--k-contorno); cursor:pointer; }}
  .niveles button[aria-pressed="true"] {{ background:var(--k-primario-contenedor); color:var(--k-sobre-primario-contenedor); border-color:transparent; }}
  .niveles button:focus-visible {{ outline:2px solid var(--k-foco); outline-offset:2px; }}
  .tabla {{ overflow-x:auto; }}
  table {{ width:100%; border-collapse:collapse; font-size:14px; background:var(--k-superficie-baja); }}
  th {{ text-align:left; font-weight:600; color:var(--k-texto-secundario); padding:8px; border-bottom:1px solid var(--k-contorno-variante); }}
  td {{ padding:6px 8px; border-bottom:1px solid var(--k-contorno-variante); vertical-align:middle; }}
  .sw {{ display:block; width:44px; height:26px; border:1px solid var(--k-contorno-variante); }}
  .hex, .num {{ font-variant-numeric:tabular-nums; }}
  .num {{ text-align:right; }}
  .rol {{ font-size:12px; color:var(--k-texto-secundario); }}
  code {{ font-size:13px; }}
</style></head>
<body><main>
<h1>COLORES</h1>
<p class="nota">Sistema de color de Kovat, opción Tarima. Solo modo oscuro, hecho con el método de Material 3 (paletas tonales HCT y roles con contraste garantizado). Esta página usa el mismo <code>kovat-colores.css</code> que la app.</p>
<ol>
  <li>El texto rojo significa error. El rojo de la marca va en rellenos, indicadores, foco y momentos de marca con Kovat Marcador; nunca en texto.</li>
  <li>Éxito y aviso son solo para estados, siempre con ícono y texto.</li>
  <li>Cada <code>sobre-X</code> va encima de su <code>X</code>: así se garantiza el contraste medido abajo.</li>
  <li>El contraste estándar es el de siempre. <code>data-contraste="medio"</code> o <code>"alto"</code> en <code>&lt;html&gt;</code> lo cambia, y si la persona pidió más contraste en su sistema se usa el alto.</li>
</ol>
<div class="niveles" role="group" aria-label="Ver esta página en otro nivel de contraste">
  <button type="button" data-n="" aria-pressed="true">Estándar</button>
  <button type="button" data-n="medio" aria-pressed="false">Medio</button>
  <button type="button" data-n="alto" aria-pressed="false">Alto</button>
</div>
<div class="tabla">{tablas}</div>
<h2>Contrastes medidos</h2>
<p class="nota">Todos los pares de uso, en los tres niveles. Texto: mínimo 4,5 en estándar y medio, 7 en alto. Gráficos e indicadores: mínimo 3. Los tres rojos (marca, error e indicador de error) quedan a una distancia de color de al menos 15,5, el mínimo para distinguirlos a simple vista.</p>
<div class="tabla"><table><thead><tr><th>Tipo</th><th>Par</th><th>Estándar</th><th>Medio</th><th>Alto</th><th>Mínimo</th></tr></thead>
<tbody>{filas_contraste()}</tbody></table></div>
</main>
<script>
document.querySelectorAll('.niveles button').forEach(b => b.addEventListener('click', () => {{
  if (b.dataset.n) document.documentElement.dataset.contraste = b.dataset.n; else delete document.documentElement.dataset.contraste;
  document.querySelectorAll('.niveles button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
}}));
</script>
</body></html>"""
RUTA = os.path.join(C.SAL, "muestra.html")
open(RUTA, "w", encoding="utf-8", newline="\n").write(pagina)
print("ok", RUTA, len(pagina) // 1024, "KB")
