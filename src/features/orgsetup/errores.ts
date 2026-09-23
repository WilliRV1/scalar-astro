/**
 * El texto de un error, para mostrárselo al dueño tal cual.
 *
 * Los errores de la base vienen redactados en español y dicen qué pasó ("El día
 * de corte por defecto debe estar entre 1 y 31. Recibí 40."). Taparlos con un
 * "algo salió mal" convierte un problema de treinta segundos en una llamada.
 */
export function mensaje(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
