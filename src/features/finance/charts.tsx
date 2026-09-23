import type { ReactNode } from 'react';
import { Sparkline } from '../performance/Sparkline';
import { formatCents } from '../../shared/lib/money';
import { formatMonth, formatPct, type Variacion } from './pnl';
import type { PnlMonth } from './types';

/**
 * Gráficas del módulo, en SVG a mano.
 *
 * No hay librería de gráficas en el proyecto y no se agrega una para pintar
 * cuatro barras. Decisiones tomadas siguiendo la guía de visualización, las
 * mismas que ya adoptó `features/performance/Sparkline`:
 *
 *  · Un número actual + su tendencia NO es una gráfica: es una casilla de dato
 *    con la cifra grande y una línea diminuta al lado (CasillaDato).
 *  · Serie única -> sin leyenda. El título de la casilla dice qué se está viendo.
 *  · Nada de números sobre cada punto: se rotula el último y el resto lo cuenta
 *    el tooltip. Un valor al lado de cada barra es ruido que nadie lee.
 *  · NUNCA dos ejes Y. Ingresos y egresos no comparten gráfica: el neto se ve en
 *    barras y el detalle mes a mes en la tabla que la acompaña.
 *  · Toda gráfica tiene su tabla gemela en la página: el color nunca es la única
 *    forma de leer un dato.
 */

// ---------------------------------------------------------------------------
// Casilla de dato
// ---------------------------------------------------------------------------

export function CasillaDato({
  label, value, hint, variacion: v, metrica = 'ingreso', trend, trendLabels,
}: {
  label: string;
  value: string;
  hint?: string;
  variacion?: Variacion;
  /** En egresos, subir es mala noticia: cambia el color de la variación. */
  metrica?: 'ingreso' | 'egreso';
  /** Serie para la línea de tendencia. Menos de 2 puntos no dibuja nada. */
  trend?: number[];
  trendLabels?: string[];
}) {
  const buena = v && v.direction !== 'flat'
    ? (metrica === 'ingreso' ? v.direction === 'up' : v.direction === 'down')
    : null;

  return (
    <div className="grunge-border bg-surface-light p-4 dark:bg-surface-dark">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
      <div className="flex items-end justify-between gap-3">
        {/* Cifra grande con dígitos proporcionales: tabular-nums a este tamaño
            deja los números sueltos y desalineados. */}
        <p className="font-display text-4xl leading-tight text-black dark:text-white">{value}</p>
        {trend && trend.length > 1 && (
          <Sparkline values={trend} labels={trendLabels} width={84} height={30} />
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        {v && (
          <span
            className={`text-xs font-bold ${
              buena === null ? 'text-gray-500' : buena ? 'text-gray-300' : 'text-primary'
            }`}
          >
            {v.direction === 'up' ? '▲' : v.direction === 'down' ? '▼' : '='} {formatPct(v.pct)}
          </span>
        )}
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Neto por mes
// ---------------------------------------------------------------------------

const ANCHO = 320;
const ALTO_PLOT = 104;
const BANDA_EJE = 22;   // el alto reservado para los nombres de los meses

/**
 * Barras del neto mes a mes, con la línea del cero como referencia.
 *
 * Un mes en pérdida se pinta en rojo porque aquí el color SÍ significa
 * bueno/malo; no es la identidad de una serie.
 */
export function NetoPorMes({ rows }: { rows: PnlMonth[] }) {
  if (rows.length === 0) return null;

  const valores = rows.map((r) => r.net_cents);
  const techo = Math.max(0, ...valores);
  const piso = Math.min(0, ...valores);
  const rango = techo - piso || 1;
  const yCero = (techo / rango) * ALTO_PLOT;
  const slot = ANCHO / rows.length;
  const ancho = Math.min(slot * 0.62, 34);
  const ultimo = rows.length - 1;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO_PLOT + BANDA_EJE}`}
        className="h-36 w-full"
        role="img"
        aria-label={`Resultado neto de los últimos ${rows.length} meses`}
      >
        {/* Línea del cero: hairline sólida, nunca punteada. */}
        <line
          x1={0} y1={yCero} x2={ANCHO} y2={yCero}
          className="stroke-gray-300 dark:stroke-gray-800" strokeWidth={1}
        />
        {rows.map((r, i) => {
          const alto = Math.max((Math.abs(r.net_cents) / rango) * ALTO_PLOT, 1.5);
          const x = i * slot + (slot - ancho) / 2;
          const y = r.net_cents >= 0 ? yCero - alto : yCero;
          return (
            <rect
              key={r.month}
              x={x} y={y} width={ancho} height={alto}
              className={r.net_cents < 0
                ? 'fill-primary'
                : i === ultimo ? 'fill-gray-800 dark:fill-white' : 'fill-gray-400 dark:fill-gray-500'}
            >
              <title>{`${formatMonth(r.month)}: ${formatCents(r.net_cents)}`}</title>
            </rect>
          );
        })}
        {rows.map((r, i) => (
          <text
            key={r.month}
            x={i * slot + slot / 2}
            y={ALTO_PLOT + 15}
            textAnchor="middle"
            className="fill-gray-500 text-[10px] tabular-nums"
          >
            {formatMonth(r.month).slice(0, 3)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-1 text-xs text-gray-500">
        Neto por mes. El último mes va resaltado; los meses en pérdida, en rojo.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Barras ordenadas (origen de los atletas)
// ---------------------------------------------------------------------------

const FILA = 26;

/**
 * Barras horizontales de una sola serie: un solo color para todas.
 *
 * Pintar cada barra de un color distinto (o más oscura donde es más grande)
 * gastaría el único canal libre en repetir lo que ya dice el largo de la barra.
 */
export function BarrasOrdenadas({
  items, total,
}: {
  items: { label: string; value: number }[];
  total: number;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);
  const alto = items.length * FILA;

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${alto}`}
      className="w-full"
      style={{ height: alto }}
      role="img"
      aria-label="Origen de los atletas"
    >
      {items.map((it, i) => {
        const y = i * FILA;
        // 110 de la etiqueta + barra + 40 para el número de la derecha: si la
        // barra más larga llegara al borde, su número quedaría recortado.
        const ancho = (it.value / max) * (ANCHO - 150);
        const pct = total > 0 ? Math.round((it.value / total) * 100) : 0;
        return (
          <g key={it.label}>
            <text x={0} y={y + 13} className="fill-gray-500 text-[11px]">
              {it.label.length > 16 ? `${it.label.slice(0, 15)}…` : it.label}
            </text>
            <rect
              x={110} y={y + 3} width={Math.max(ancho, 2)} height={13}
              className="fill-primary"
            >
              <title>{`${it.label}: ${it.value} atleta(s), ${pct}%`}</title>
            </rect>
            {/* El valor va FUERA de la barra: dentro se recorta en las cortas. */}
            <text
              x={110 + Math.max(ancho, 2) + 6} y={y + 14}
              className="fill-gray-400 text-[11px] tabular-nums"
            >
              {it.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------

/** Sección con título, para no repetir el encabezado en las tres páginas. */
export function Seccion({
  title, action, children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl text-black dark:text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
