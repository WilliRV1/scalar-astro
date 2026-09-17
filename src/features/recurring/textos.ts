/**
 * Cómo se le cuenta al atleta lo que pasó con su cobro.
 *
 * Regla: nunca "algo salió mal". Un débito fallido es plata que no entró y una
 * persona que puede quedar en mora sin saberlo; el mensaje tiene que decir qué
 * pasó y qué hacer, en dos líneas y sin jerga.
 */

import type { CausaDelFallo, EstadoDelCobro, MetodoDePago } from './types';

export interface ExplicacionDelFallo {
  titulo: string;
  queHacer: string;
  /** Si es true, no hay reintento: toca volver a autorizar. */
  vuelveAAutorizar: boolean;
}

export function explicarFallo(causa: CausaDelFallo | null): ExplicacionDelFallo {
  switch (causa) {
    case 'insufficient_funds':
      return {
        titulo: 'No había saldo suficiente en tu cuenta',
        queHacer: 'Lo intentamos de nuevo más adelante. Si prefieres, paga ahora desde aquí.',
        vuelveAAutorizar: false,
      };
    case 'revoked_token':
      return {
        titulo: 'Tu banco desvinculó el medio de pago',
        queHacer: 'Vuelve a autorizar el débito para que siga cobrándose solo.',
        vuelveAAutorizar: true,
      };
    case 'expired_card':
      return {
        titulo: 'Tu tarjeta venció',
        queHacer: 'Registra la tarjeta nueva y autoriza otra vez.',
        vuelveAAutorizar: true,
      };
    case 'invalid_source':
      return {
        titulo: 'El medio de pago ya no sirve',
        queHacer: 'Vuelve a autorizar el débito con un medio de pago vigente.',
        vuelveAAutorizar: true,
      };
    case 'over_authorized_amount':
      return {
        titulo: 'El cobro supera el tope que autorizaste',
        queHacer: 'Autoriza de nuevo con un tope mayor, o paga esta factura a mano.',
        vuelveAAutorizar: true,
      };
    case 'missing_email':
      return {
        titulo: 'Nos falta tu correo para poder cobrar',
        queHacer: 'Pídele a tu box que registre tu correo y vuelve a autorizar.',
        vuelveAAutorizar: true,
      };
    case 'gateway_error':
      return {
        titulo: 'La pasarela de pagos falló',
        queHacer: 'No es culpa tuya ni del box. Lo volvemos a intentar.',
        vuelveAAutorizar: false,
      };
    case 'declined':
    case 'other':
    case null:
    default:
      return {
        titulo: 'El banco rechazó el cobro',
        queHacer: 'Lo volvemos a intentar. Si prefieres, paga ahora desde aquí.',
        vuelveAAutorizar: false,
      };
  }
}

export function etiquetaDelEstado(estado: EstadoDelCobro): string {
  switch (estado) {
    case 'queued':
      return 'Programado';
    case 'processing':
      return 'En curso';
    case 'approved':
      return 'Cobrado';
    case 'declined':
      return 'Rechazado, se reintenta';
    case 'exhausted':
      return 'No se pudo cobrar';
    case 'failed':
      return 'Falló el medio de pago';
    case 'cancelled':
      return 'Cancelado';
  }
}

/** "Nequi +57 *** *** 4567" · "VISA ···· 4242". Nunca más que eso. */
export function describirMetodo(metodo: MetodoDePago): string {
  if (metodo.kind === 'nequi') {
    return `Nequi ${metodo.masked_phone ?? ''}`.trim();
  }
  const marca = metodo.brand ?? 'Tarjeta';
  return metodo.last_four ? `${marca} ···· ${metodo.last_four}` : marca;
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}
