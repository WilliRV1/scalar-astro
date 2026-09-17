// =============================================================================
// Lectura de configuración
// =============================================================================
// NINGUNA llave vive en el código. Todo sale del entorno de la función
// (`supabase secrets set`). Si falta un secreto, la función falla al arrancar
// con un mensaje que dice CUÁL falta, pero nunca imprime su valor.
// =============================================================================

/** Lee una variable obligatoria. Lanza si no está o está vacía. */
export function requiereEnv(nombre: string): string {
  const valor = Deno.env.get(nombre);
  if (!valor || valor.trim() === '') {
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  return valor.trim();
}

/** Lee una variable opcional. */
export function env(nombre: string): string | undefined {
  const valor = Deno.env.get(nombre);
  return valor && valor.trim() !== '' ? valor.trim() : undefined;
}

/** Lee un entero opcional con valor por defecto. */
export function envEntero(nombre: string, porDefecto: number): number {
  const valor = env(nombre);
  if (valor === undefined) return porDefecto;
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}
