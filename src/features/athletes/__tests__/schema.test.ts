import { describe, expect, it } from 'vitest';
import { athleteSchema, validatePhone } from '../schema';

const base = { first_name: 'Ana', status: 'active' as const, consent_whatsapp: false };

describe('athleteSchema · teléfono', () => {
  it('normaliza a E.164 lo que escribe la gente', () => {
    const r = athleteSchema.safeParse({ ...base, phone: '300 123 4567' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.phone).toBe('+573001234567');
  });

  it('acepta que no haya teléfono', () => {
    for (const valor of ['', null, undefined]) {
      const r = athleteSchema.safeParse({ ...base, phone: valor });
      expect(r.success).toBe(true);
      expect(r.success && r.data.phone).toBeNull();
    }
  });

  /**
   * La regresión. Antes esto pasaba la validación y guardaba null: el atleta
   * quedaba sin teléfono sin que nadie se enterara, y no volvía a recibir un
   * recordatorio de pago.
   */
  it('RECHAZA un teléfono escrito que no se entiende, en vez de anularlo', () => {
    const r = athleteSchema.safeParse({ ...base, phone: '123' });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toContain('No se entiende');
  });

  it('rechaza también un fijo sin indicativo, que es ambiguo', () => {
    expect(athleteSchema.safeParse({ ...base, phone: '4851234' }).success).toBe(false);
  });

  it('aplica la misma regla al contacto de emergencia', () => {
    expect(
      athleteSchema.safeParse({ ...base, emergency_contact_phone: 'no sé' }).success,
    ).toBe(false);
  });
});

describe('athleteSchema · resto de campos', () => {
  it('exige el nombre', () => {
    expect(athleteSchema.safeParse({ ...base, first_name: '  ' }).success).toBe(false);
  });

  it('convierte las cadenas vacías en null, para no guardar basura', () => {
    const r = athleteSchema.safeParse({ ...base, last_name: '', email: '', referral_source: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.last_name).toBeNull();
      expect(r.data.email).toBeNull();
      expect(r.data.referral_source).toBeNull();
    }
  });

  it('rechaza un correo inválido', () => {
    expect(athleteSchema.safeParse({ ...base, email: 'arroba.com' }).success).toBe(false);
  });
});

describe('validatePhone', () => {
  it('separa "vacío" de "ilegible"', () => {
    expect(validatePhone('')).toEqual({ ok: true, value: null });
    expect(validatePhone('300 123 4567')).toEqual({ ok: true, value: '+573001234567' });

    const malo = validatePhone('abc');
    expect(malo.ok).toBe(false);
    expect(malo.error).toContain('No se entiende');
  });
});
