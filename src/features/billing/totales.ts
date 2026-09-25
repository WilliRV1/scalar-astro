/**
 * Totales de cartera, tal como los devuelve `public.cartera_totales()`.
 *
 * La base suma sobre TODOS los cobros abiertos; la lista del tablero trae solo
 * los primeros. Por eso estas cifras no se calculan a partir de la lista.
 */

export type Tramo = 'porVencer' | 'reciente' | 'seria' | 'critica';

export const TRAMOS_CARTERA: Tramo[] = ['porVencer', 'reciente', 'seria', 'critica'];

/** Una fila de public.cartera_totales(). */
export interface TramoCartera {
  tramo: Tramo;
  cobros: number;
  saldo_cents: number;
}

export interface CarteraTotales {
  porTramo: Record<Tramo, { cobros: number; saldo_cents: number }>;
  /** Todo lo abierto, incluido lo que todavía no vence. */
  pendiente_cents: number;
  cobros: number;
  /** Solo lo vencido: 1 día o más. */
  mora_cents: number;
  enMora: number;
}

/** Pasa las 4 filas de la base a lo que pinta el tablero. Faltantes valen cero. */
export function resumirTramos(filas: TramoCartera[]): CarteraTotales {
  const porTramo = Object.fromEntries(
    TRAMOS_CARTERA.map((t) => [t, { cobros: 0, saldo_cents: 0 }]),
  ) as CarteraTotales['porTramo'];

  for (const f of filas) {
    if (f.tramo in porTramo) {
      porTramo[f.tramo] = { cobros: f.cobros, saldo_cents: f.saldo_cents };
    }
  }

  const total = (pred: (t: Tramo) => boolean) =>
    TRAMOS_CARTERA.filter(pred).reduce(
      (acc, t) => ({
        cobros: acc.cobros + porTramo[t].cobros,
        saldo: acc.saldo + porTramo[t].saldo_cents,
      }),
      { cobros: 0, saldo: 0 },
    );

  const todo = total(() => true);
  const vencido = total((t) => t !== 'porVencer');

  return {
    porTramo,
    pendiente_cents: todo.saldo,
    cobros: todo.cobros,
    mora_cents: vencido.saldo,
    enMora: vencido.cobros,
  };
}
