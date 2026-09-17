/**
 * Riesgo de fuga: presentación y mensaje de reenganche.
 *
 * El cálculo vive en `public.refresh_risk_scores` (migración 0011) y no se
 * repite aquí: un segundo cálculo en el cliente sería un segundo resultado.
 * Lo que sí vive aquí es lo que convierte ese número en una acción: la banda,
 * el motivo en una línea y el texto ya redactado para el botón de WhatsApp.
 *
 * Lógica pura, sin React y sin Supabase, para poder probarla sola.
 */

import { whatsappLink } from '../../shared/lib/phone';
import type { BandaRiesgo, MotivoRiesgo, RiesgoAtleta } from './types';

/** Espejo de las bandas de la base (docs/04 §Detección de fuga). */
export function bandaDeScore(score: number): BandaRiesgo {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'at_risk';
  if (score >= 25) return 'watch';
  return 'ok';
}

export interface EstiloDeBanda {
  etiqueta: string;
  /** Qué hacer. Es lo que el coach necesita, no el número. */
  accion: string;
  clase: string;
}

export function estiloDeBanda(banda: BandaRiesgo): EstiloDeBanda {
  switch (banda) {
    case 'critical':
      return {
        etiqueta: 'Crítico',
        accion: 'Llamada del dueño, hoy',
        clase: 'bg-primary text-white',
      };
    case 'at_risk':
      return {
        etiqueta: 'En riesgo',
        accion: 'Escríbele hoy',
        clase: 'bg-primary/20 text-primary',
      };
    case 'watch':
      return {
        etiqueta: 'Ojo',
        accion: 'Salúdalo cuando venga',
        clase: 'bg-amber-500/20 text-amber-500',
      };
    case 'ok':
      return {
        etiqueta: 'Al día',
        accion: 'Sin novedad',
        clase: 'bg-emerald-500/15 text-emerald-500',
      };
  }
}

/** El motivo principal: el de más peso. Es lo que se pinta en la fila. */
export function motivoPrincipal(motivos: MotivoRiesgo[]): string {
  if (!motivos || motivos.length === 0) return 'Sin señales de alerta';
  return [...motivos].sort((a, b) => b.puntos - a.puntos)[0].texto;
}

export function nombreCompleto(
  atleta: { first_name: string; last_name: string | null } | null,
): string {
  if (!atleta) return 'Atleta';
  return `${atleta.first_name} ${atleta.last_name ?? ''}`.trim();
}

/** El primer nombre, que es como se saluda en un box. */
export function primerNombre(
  atleta: { first_name: string; last_name: string | null } | null,
): string {
  return atleta?.first_name.split(' ')[0] ?? 'Atleta';
}

/**
 * El texto ya redactado para el botón de un clic.
 *
 * No es un "te extrañamos" genérico: cambia según POR QUÉ está en riesgo. Un
 * atleta que dejó de venir y uno que está en mora necesitan mensajes distintos,
 * y mandar el equivocado es peor que no mandar ninguno.
 */
export function mensajeDeReenganche(riesgo: RiesgoAtleta, nombreDelBox: string): string {
  const nombre = primerNombre(riesgo.athletes);
  const codigos = new Set((riesgo.reasons ?? []).map((m) => m.codigo));
  const dias = riesgo.days_since_last_visit;

  if (codigos.has('mora') && riesgo.days_overdue >= 8) {
    return `Hola ${nombre}, te escribo de ${nombreDelBox}. Tienes la mensualidad pendiente `
      + `hace ${riesgo.days_overdue} días. ¿Te ayudo a ponerte al día para que sigas entrenando?`;
  }
  if (codigos.has('nunca_vino')) {
    return `Hola ${nombre}, te escribo de ${nombreDelBox}. Te inscribiste y todavía no has `
      + 'venido a tu primera clase. ¿Te reservo un cupo esta semana? Te acompaño en la primera.';
  }
  if (dias != null && dias >= 7) {
    return `Hola ${nombre}, te escribo de ${nombreDelBox}. Llevas ${dias} días sin aparecer y `
      + 'te estamos extrañando. ¿Te esperamos esta semana? Dime qué horario te sirve.';
  }
  if (codigos.has('caida_frecuencia')) {
    return `Hola ${nombre}, te escribo de ${nombreDelBox}. Te he visto menos seguido este mes. `
      + '¿Todo bien? Si el horario no te está funcionando, cuadramos otro.';
  }
  if (codigos.has('sin_resultado')) {
    return `Hola ${nombre}, te escribo de ${nombreDelBox}. ¿Te ayudo a registrar tus marcas? `
      + 'Ver cómo subes es lo que más engancha, y todavía no tienes ninguna.';
  }
  return `Hola ${nombre}, te escribo de ${nombreDelBox}. ¿Cómo vas? ¿Te esperamos esta semana?`;
}

/** El enlace de un clic, o null si el atleta no tiene teléfono utilizable. */
export function enlaceDeReenganche(riesgo: RiesgoAtleta, nombreDelBox: string): string | null {
  const telefono = riesgo.athletes?.phone;
  if (!telefono) return null;
  return whatsappLink(telefono, mensajeDeReenganche(riesgo, nombreDelBox));
}

/**
 * ¿Se le puede escribir con el botón?
 *
 * El botón lo aprieta una persona, así que no es un envío automático y no le
 * aplica el opt-in de Meta. Pero si el atleta pidió que no le escribieran, se
 * respeta igual: la regla es del atleta, no del canal.
 */
export function puedeEscribirsele(riesgo: RiesgoAtleta): boolean {
  if (!riesgo.athletes?.phone) return false;
  return !(riesgo.athletes.tags ?? []).includes('no_marketing');
}

/** Orden del tablero: primero el que más urge. */
export function ordenarPorUrgencia(lista: RiesgoAtleta[]): RiesgoAtleta[] {
  return [...lista].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.days_since_last_visit ?? 0) - (a.days_since_last_visit ?? 0);
  });
}
