import { z } from 'zod';
import { toE164 } from '../../shared/lib/phone';

/**
 * Validación de la configuración del box.
 *
 * Los mismos rangos que valida la base (migración 20260923100000). Duplicado a
 * propósito, y en este orden: la base es la que MANDA —ahí se rechaza venga la
 * escritura de donde venga—, y esto es para que el dueño vea el error antes de
 * enviar el formulario en vez de después.
 *
 * Si los dos se separaran, lo que pasaría es que el formulario acepta algo que
 * la base rechaza, y el dueño ve un error del servidor. Molesto, pero no
 * peligroso: nunca al revés.
 */

/**
 * Un entero escrito por una persona.
 *
 * `Number('')` es 0, así que validar con `Number.isFinite()` dejaría pasar un
 * campo vacío como "cero días de gracia". Por eso primero se comprueba el
 * patrón y solo después se convierte. Lo mismo con "3 días" o "tres".
 *
 * El error se emite DENTRO del transform, que es el único sitio donde se
 * distingue "no escribió nada" de "escribió algo que no se entiende".
 */
function entero(campo: string, min: number, max: number) {
  return z.string().transform((valor, ctx) => {
    const limpio = valor.trim();

    if (limpio === '') {
      ctx.addIssue({ code: 'custom', message: `Falta ${campo}.` });
      return z.NEVER;
    }
    if (!/^\d+$/.test(limpio)) {
      ctx.addIssue({
        code: 'custom',
        message: `${campo} tiene que ser un número entero. Escribiste "${valor.trim()}".`,
      });
      return z.NEVER;
    }

    const n = Number(limpio);
    if (n < min || n > max) {
      ctx.addIssue({
        code: 'custom',
        message: `${campo} tiene que estar entre ${min} y ${max}. Escribiste ${n}.`,
      });
      return z.NEVER;
    }
    return n;
  });
}

/** Teléfono del box: opcional, pero si se escribe tiene que poder marcarse. */
const telefono = z
  .string()
  .optional()
  .transform((valor, ctx) => {
    if (!valor || valor.trim() === '') return null;
    const e164 = toE164(valor);
    if (!e164) {
      ctx.addIssue({
        code: 'custom',
        message: `No se entiende el teléfono "${valor.trim()}". Ejemplo: 300 123 4567`,
      });
      return z.NEVER;
    }
    return e164;
  });

const textoOpcional = (max: number) =>
  z.string().max(max).optional().transform((v) => {
    const limpio = (v ?? '').trim();
    return limpio === '' ? null : limpio;
  });

export const esquemaDatosBox = z.object({
  name: z.string().trim().min(2, 'Ponle el nombre de tu box.').max(80),
  city: textoOpcional(60),
  phone: telefono,
  tax_id: textoOpcional(32),
  timezone: z.string().min(3),
  brand_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'El color va en formato #RRGGBB, por ejemplo #EF4444.'),
  logo_url: textoOpcional(500),
});

export type DatosBox = z.infer<typeof esquemaDatosBox>;

export const esquemaCobros = z.object({
  default_billing_day: entero('El día de corte', 1, 31),
  grace_days: entero('Los días de gracia', 0, 60),
  accepts_online_payment: z.boolean(),
  payment_link: z
    .string()
    .optional()
    .transform((valor, ctx) => {
      const limpio = (valor ?? '').trim();
      if (limpio === '') return '';
      if (!/^https?:\/\//.test(limpio)) {
        ctx.addIssue({
          code: 'custom',
          message: 'El enlace de pago tiene que empezar por http:// o https://',
        });
        return z.NEVER;
      }
      return limpio;
    }),
});

export type Cobros = z.infer<typeof esquemaCobros>;

export const esquemaMensajes = z
  .object({
    is_enabled: z.boolean(),
    simulation_mode: z.boolean(),
    quiet_start_hour: entero('La hora de inicio', 0, 23),
    quiet_end_hour: entero('La hora de fin', 1, 24),
    max_messages_per_athlete_per_month: entero('El tope de mensajes al mes', 0, 60),
    max_messages_per_athlete_per_day: entero('El tope de mensajes al día', 0, 10),
    staff_phone: telefono,
  })
  .superRefine((v, ctx) => {
    if (v.quiet_end_hour <= v.quiet_start_hour) {
      ctx.addIssue({
        code: 'custom',
        path: ['quiet_end_hour'],
        message: `El horario queda al revés: empieza a las ${v.quiet_start_hour}:00 y termina a las ${v.quiet_end_hour}:00.`,
      });
    }
    if (
      v.max_messages_per_athlete_per_month > 0 &&
      v.max_messages_per_athlete_per_day > v.max_messages_per_athlete_per_month
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['max_messages_per_athlete_per_day'],
        message: 'El tope diario no puede ser mayor que el mensual.',
      });
    }
  });

export type Mensajes = z.infer<typeof esquemaMensajes>;

export const esquemaReservas = z
  .object({
    open_hours_before: entero('La antelación para reservar', 0, 2160),
    close_minutes_before: entero('El cierre de la reserva', 0, 1440),
    cancel_minutes_before: entero('El plazo para cancelar', 0, 10080),
    late_cancel_policy: z.enum(['free', 'consume_credit', 'no_show']),
    block_when_overdue: z.boolean(),
    waitlist_enabled: z.boolean(),
    waitlist_max: entero('El tope de la lista de espera', 0, 100),
    no_show_policy: z.enum(['record', 'notify', 'block']),
    no_show_consumes_credit: z.boolean(),
    no_show_threshold: entero('El número de faltas', 1, 20),
    no_show_window_days: entero('Los días que se miran', 1, 365),
    no_show_block_days: entero('Los días de bloqueo', 1, 365),
    skip_holidays: z.boolean(),
    weeks_ahead: entero('Las semanas por adelantado', 1, 12),
    allow_walk_in: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.open_hours_before * 60 <= v.close_minutes_before) {
      ctx.addIssue({
        code: 'custom',
        path: ['close_minutes_before'],
        message: 'La reserva se cerraría antes de abrirse. Sube la antelación o baja el cierre.',
      });
    }
    if (v.cancel_minutes_before > v.open_hours_before * 60) {
      ctx.addIssue({
        code: 'custom',
        path: ['cancel_minutes_before'],
        message: 'Nadie alcanzaría a cancelar: la reserva lleva menos tiempo abierta que ese plazo.',
      });
    }
  });

export type Reservas = z.infer<typeof esquemaReservas>;

/** Errores de zod indexados por campo, que es como los pinta el formulario. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path.join('.') || '_';
    if (!(campo in salida)) salida[campo] = issue.message;
  }
  return salida;
}
