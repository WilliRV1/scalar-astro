# 00 — Diagnóstico del código actual

Fecha del análisis: 2026-09-16. Rama base: `master` (12 commits).

## Qué hay hoy

Una SPA React 19 + Vite + TypeScript + Tailwind, con Supabase como backend, ~1.650
líneas repartidas en 5 componentes:

| Archivo | Líneas | Qué hace |
|---|---|---|
| `src/components/CoachDashboard.tsx` | 662 | Listado de atletas, edición en drawer, filtros, toggle de pago, borrado, importación |
| `src/components/AthletePersonalView.tsx` | 295 | Vista del atleta: PRs, sparkline de evolución, check-in diario (energía/RPE/notas) |
| `src/components/ExcelImport.tsx` | 292 | Carga de `.xlsx` con mapeo de columnas auto + manual |
| `src/supabaseClient.ts` | 163 | Cliente Supabase **+ un mock en memoria** si no hay credenciales |
| `src/components/AthleteLogin.tsx` | 106 | Login del atleta por dropdown de nombre + código |
| `src/App.tsx` | 80 | Router hecho a mano con `useState` |

Base de datos: 3 tablas (`athletes`, `workout_logs`, `athlete_progress`) definidas en
5 scripts `.sql` sueltos en la raíz, aplicados a mano en el editor de Supabase.

## Lo que sirve y se conserva

Esto no se bota, se migra:

1. **La intuición de producto.** Los campos que ya modelaste (`cut_day`, `payment_status`,
   `referral_source`, los benchmarks Karen / 100 burpees / RMs) son exactamente los que
   un box usa. Eso no se aprende leyendo documentación, sale de conocer el negocio.
2. **El registro histórico de PRs** (`athlete_progress`): guardar cada cambio de marca
   como una fila con `field_name` + `value` + fecha es la decisión correcta. Solo hay que
   normalizarla contra un catálogo de movimientos.
3. **El importador de Excel.** Es la herramienta de migración que todo box necesita el día
   1, porque todos llevan la información en una hoja de cálculo. Vale oro para las ventas.
4. **La identidad visual** (dark, display font, acentos por atleta, vibración háptica,
   confetti en PR). Se ve como un producto, no como un ERP. Se conserva tal cual.
5. **El stack.** React + Vite + Supabase es la elección correcta para un desarrollador
   solo. No hay razón para migrar a Next.js ni para montar un backend propio todavía.

## Lo que hay que reemplazar antes de vender

### Crítico — bloquea cualquier venta

1. **No hay autenticación.** La clave del coach está escrita en el código:
   `src/App.tsx:20` compara contra `'admin123'` con un `prompt()`. Cualquiera que abra
   el bundle la lee.
2. **El login del atleta es decorativo.** `src/components/AthleteLogin.tsx:44` acepta
   el PIN `'0000'` para *cualquier* atleta, y el dropdown lista los nombres de todos los
   atletas del box sin estar autenticado.
3. **RLS está deshabilitada a propósito** en las tres tablas (`disable_rls_athletes.sql`,
   `fix_schema.sql`, `migrate_history.sql`). Con RLS apagada, la llave anónima de Supabase
   —que viaja en el JavaScript del navegador, por diseño— da lectura y escritura completas
   sobre toda la base. **Hoy cualquier persona con la URL de la app puede descargar, editar
   o borrar todos los atletas.**
4. **El archivo `.env` está versionado en Git** (aparece en `git ls-files` aunque también
   esté en `.gitignore`: se agregó antes de ignorarlo). La URL y la llave del proyecto de
   Supabase están en el historial público del repositorio. Sumado al punto 3, esto es una
   fuga de datos en curso, no un riesgo teórico.
   → **Acción inmediata**: rotar las llaves en Supabase, habilitar RLS, y sacar `.env`
   del historial (`git filter-repo` o rotación + repo nuevo).
5. **No hay concepto de box.** Todas las tablas asumen un solo gimnasio. No hay `org_id`.
   Vender esto hoy significa levantar un proyecto de Supabase y un despliegue por cliente:
   inviable a partir del tercero.

### Importante — deuda que frena el desarrollo

6. **Sin migraciones versionadas.** Cinco `.sql` en la raíz, uno de ellos llamado
   "NUCLEAR OPTION" que hace `DROP TABLE`. No hay forma de saber qué estado tiene la base
   de un cliente. Hay que pasar a `supabase/migrations/` con numeración.
7. **Sin enrutamiento real.** `react-router-dom` está instalado pero `App.tsx` usa un
   `switch` sobre `useState`. No hay URLs compartibles, ni botón atrás, ni carga diferida
   por módulo.
8. **`any` en todas partes** (`currentAthlete: any`, `athletes: any[]`) y ningún tipo
   generado desde el esquema de la base.
9. **El mock en memoria dentro de `supabaseClient.ts`** (163 líneas reimplementando el
   SDK de Supabase) va a divergir del cliente real y a producir bugs fantasma. Se
   reemplaza por un proyecto de Supabase local (`supabase start`) con datos sembrados.
10. **Todos los valores numéricos son `text`** (`back_squat text`, `karen text`). No se
    puede ordenar, promediar ni graficar sin parsear en el cliente. Hay que separar
    valor numérico + unidad + tipo de marca.
11. **Sin pruebas, sin CI, sin monitoreo de errores.** Aceptable en un regalo; no
    aceptable cuando hay un contrato de por medio y un box no puede cobrar porque el
    sistema se cayó.
12. **`dist/` versionado.** Ruido en los diffs.

## Veredicto

El prototipo cumplió su función: validó el producto y se ve bien. Pero **no es la base
de un SaaS, es la maqueta**. El plan no es reescribir desde cero —el modelo de datos,
la interfaz y el importador se rescatan— sino **reconstruir los cimientos** (identidad,
multi-tenancy, permisos, migraciones) y montar encima lo que ya funciona.

Estimado de la fase de cimientos: ~2 semanas de trabajo efectivo. Ver
[06-roadmap.md](./06-roadmap.md).
