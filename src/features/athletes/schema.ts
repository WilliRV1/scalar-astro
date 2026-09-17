import { z } from 'zod';
import { toE164 } from '../../shared/lib/phone';

/**
 * Validación del atleta. La misma para el formulario y para el importador de
 * Excel: si se separaran, el Excel acabaría metiendo datos que el formulario
 * rechaza, y la base los rechazaría a su vez con un error incomprensible.
 */

export const ATHLETE_STATUSES = [
  'lead', 'trial', 'active', 'frozen', 'overdue', 'churned',
] as const;

/**
 * Acepta lo que escribe la gente y devuelve E.164, o falla con un mensaje claro.
 *
 * Aquí hubo un bug: el `.refine(v => v !== undefined)` de la primera versión
 * nunca fallaba, porque `toE164()` devuelve `null`, no `undefined`. Resultado:
 * un teléfono mal escrito se guardaba como null EN SILENCIO y ese atleta no
 * volvía a recibir un cobro nunca. Es exactamente el fallo que este campo
 * existía para impedir.
 *
 * La distinción que importa es entre "no escribió teléfono" (válido, null) y
 * "escribió algo que no se entiende" (error). Por eso el fallo se emite dentro
 * del transform, que es donde se conoce la diferencia.
 */
const phoneField = z
  .union([z.string(), z.null()])
  // El .optional() va ANTES del transform: en zod 4, una unión que incluya
  // `undefined` no basta para que la clave sea opcional en el objeto.
  .optional()
  .transform((v, ctx) => {
    if (v == null || v.trim() === '') return null;

    const e164 = toE164(v);
    if (!e164) {
      ctx.addIssue({
        code: 'custom',
        message: `No se entiende el teléfono "${v.trim()}". Ejemplo: 300 123 4567`,
      });
      return z.NEVER;
    }
    return e164;
  });

export const athleteSchema = z.object({
  first_name: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  last_name: z.string().trim().max(80).optional().nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  phone: phoneField,
  email: z.string().trim().email('Correo inválido').optional().nullable()
    .or(z.literal('')).transform((v) => (v ? v : null)),
  document_id: z.string().trim().max(32).optional().nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  birth_date: z.string().optional().nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  status: z.enum(ATHLETE_STATUSES).default('active'),
  referral_source: z.string().trim().max(60).optional().nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  joined_on: z.string().optional().nullable(),
  emergency_contact_name: z.string().trim().max(80).optional().nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  emergency_contact_phone: phoneField,
  /** Autorización de contacto por WhatsApp. Exigida por Meta y por la Ley 1581. */
  consent_whatsapp: z.boolean().default(false),
});

export type AthleteInput = z.infer<typeof athleteSchema>;

/**
 * Un teléfono que la persona escribió pero que no se pudo normalizar es un
 * error, no un campo vacío: guardarlo como null perdería el dato en silencio y
 * ese atleta nunca recibiría un cobro.
 */
export function validatePhone(raw: string | null | undefined): {
  ok: boolean;
  value: string | null;
  error?: string;
} {
  if (!raw || raw.trim() === '') return { ok: true, value: null };
  const e164 = toE164(raw);
  if (!e164) {
    return { ok: false, value: null, error: `No se entiende el teléfono "${raw}"` };
  }
  return { ok: true, value: e164 };
}
