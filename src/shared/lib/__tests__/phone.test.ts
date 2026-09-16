import { describe, expect, it } from 'vitest';
import { formatPhone, toE164, whatsappLink } from '../phone';

/**
 * El teléfono es la llave del canal de WhatsApp: un número mal normalizado es
 * un cobro que nunca llega. Los boxes traen los números en todos los formatos
 * imaginables, así que esto se prueba en serio.
 */
describe('toE164', () => {
  it('normaliza un celular colombiano suelto', () => {
    expect(toE164('3001234567')).toBe('+573001234567');
    expect(toE164('300 123 4567')).toBe('+573001234567');
    expect(toE164('300-123-4567')).toBe('+573001234567');
    expect(toE164('(300) 123 4567')).toBe('+573001234567');
  });

  it('respeta el indicativo cuando ya viene', () => {
    expect(toE164('+573001234567')).toBe('+573001234567');
    expect(toE164('573001234567')).toBe('+573001234567');
    expect(toE164('0057 300 1234567')).toBe('+573001234567');
  });

  it('acepta un fijo con indicativo de área', () => {
    expect(toE164('6024851234')).toBe('+576024851234');
  });

  it('rechaza lo que no se puede resolver', () => {
    expect(toE164('4851234')).toBeNull();   // fijo sin indicativo: no se puede inferir
    expect(toE164('123')).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164('sin número')).toBeNull();
  });

  it('no inventa un número a partir de basura con dígitos sueltos', () => {
    expect(toE164('abc12def')).toBeNull();
  });
});

describe('formatPhone', () => {
  it('muestra el celular legible', () => {
    expect(formatPhone('+573001234567')).toBe('300 123 4567');
  });
  it('no rompe con un número de otro país', () => {
    expect(formatPhone('+12125550123')).toBe('+12125550123');
  });
  it('muestra un guion cuando no hay número', () => {
    expect(formatPhone(null)).toBe('—');
  });
});

describe('whatsappLink', () => {
  it('quita el + y codifica el mensaje', () => {
    expect(whatsappLink('+573001234567', 'Hola Ana, ¿pagas?')).toBe(
      'https://wa.me/573001234567?text=Hola%20Ana%2C%20%C2%BFpagas%3F',
    );
  });
});
