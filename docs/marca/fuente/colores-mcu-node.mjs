// Corre el <script type="module"> de colores-mcu.html en Node, con la misma versión de Material
// Color Utilities, y escribe el JSON que el HTML muestra en pantalla. Es la alternativa a abrir el
// HTML en el navegador y copiar el resultado; la lógica sigue viviendo solo en el HTML.
// Comprobado el 2026-09-25: la parte oscura sale idéntica a la que había calculado el navegador.
//
// Uso, desde una carpeta cualquiera fuera del repositorio:
//   npm i @material/material-color-utilities@0.3.0
//   node <repo>/docs/marca/fuente/colores-mcu-node.mjs <repo>/docs/marca/fuente/colores-mcu.html \
//        <repo>/docs/marca/colores/kovat-colores-mcu.json
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const [, , html, salida] = process.argv;
const fuente = readFileSync(html, 'utf8');
const script = fuente.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(
    "'https://cdn.jsdelivr.net/npm/@material/material-color-utilities@0.3.0/+esm'",
    JSON.stringify(pathToFileURL(join(process.cwd(), 'node_modules/@material/material-color-utilities/index.js')).href),
  );

globalThis.window = {};
globalThis.document = { getElementById: () => ({ set textContent(_) {} }) };

const modulo = join(process.cwd(), '_esquema.mjs');
writeFileSync(modulo, script);
await import(pathToFileURL(modulo).href);
writeFileSync(salida, JSON.stringify(window.KOVAT, null, 1) + '\n');
console.log('ok', Object.keys(window.KOVAT.opciones.tarima));
