import { describe, expect, it } from 'vitest';
import { esErrorDeRed, mensajeAmigable } from '../errores';

describe('mensajeAmigable', () => {
  it('deja pasar los mensajes que la base redacta en español', () => {
    const m = 'El día de corte por defecto debe estar entre 1 y 31. Recibí 40.';
    expect(mensajeAmigable({ message: m, code: '22023' })).toBe(m);
  });

  it('traduce los errores genéricos de Postgres', () => {
    expect(mensajeAmigable({ message: 'duplicate key value violates unique constraint "x"', code: '23505' }))
      .toMatch(/Ya existe/);
    expect(mensajeAmigable({ message: 'new row violates row-level security policy for table "expenses"', code: '42501' }))
      .toMatch(/permiso/);
  });

  it('reconoce la falta de red', () => {
    expect(esErrorDeRed(new TypeError('Failed to fetch'))).toBe(true);
    expect(mensajeAmigable(new TypeError('Failed to fetch'))).toMatch(/Sin conexión/);
  });

  it('no muestra [object Object]', () => {
    expect(mensajeAmigable({})).toBe('Algo falló. Intenta de nuevo.');
  });

  it('el 503 de la pasarela se explica', () => {
    expect(mensajeAmigable(new Error('Edge Function returned a non-2xx status code'))).toMatch(/pagos/);
  });
});
