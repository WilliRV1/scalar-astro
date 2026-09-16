/**
 * Dinero en centavos de peso colombiano.
 *
 * Toda la aplicación mueve `bigint` de centavos, igual que la base de datos.
 * Nunca se hace aritmética de dinero en coma flotante: 0.1 + 0.2 no es 0.3 y
 * un box que no cuadra su caja deja de pagar el software.
 */

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** 18000000 (centavos) -> "$ 180.000" */
export function formatCents(cents: number): string {
  return COP.format(Math.round(cents) / 100);
}

/** "180.000" o "180000" o "$180.000" -> 18000000 centavos. null si no es válido. */
export function parsePesosToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Días de mora: positivo si ya venció. */
export function daysOverdue(dueOn: string, today = new Date()): number {
  const due = new Date(`${dueOn}T00:00:00`);
  const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((ref.getTime() - due.getTime()) / 86_400_000);
}
