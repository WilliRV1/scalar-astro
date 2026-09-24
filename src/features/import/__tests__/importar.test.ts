import { describe, expect, it, vi } from 'vitest';
import { emparejarExistentes, esErrorDePermiso } from '../importar';
import type { AtletaExistente } from '../parse';

// Lo que se prueba aquí es lógica pura; el módulo importa el cliente de
// Supabase, que sin credenciales revienta al cargar. Se sustituye por un stub.
vi.mock('../../../shared/lib/supabase', () => ({ supabase: {} }));

const existentes: AtletaExistente[] = [
  { id: 'a1', first_name: 'María', last_name: 'Pérez', phone: '+573001234567' },
  { id: 'a2', first_name: 'Juan', last_name: 'Gómez', phone: null },
  { id: 'a3', first_name: 'Ana', last_name: null, phone: '+573009999999' },
];

describe('emparejarExistentes', () => {
  it('empareja por teléfono cuando la fila lo trae', () => {
    const r = emparejarExistentes(
      [{ first_name: 'Maria', last_name: 'Perez', phone: '+573001234567' }],
      existentes,
    );
    expect(r).toEqual(['a1']);
  });

  it('con teléfono distinto NO empareja aunque el nombre coincida', () => {
    // El teléfono es la identidad fuerte: dos "María Pérez" con celular
    // distinto son dos personas.
    const r = emparejarExistentes(
      [{ first_name: 'María', last_name: 'Pérez', phone: '+573005555555' }],
      existentes,
    );
    expect(r).toEqual([null]);
  });

  it('sin teléfono empareja por nombre y apellido normalizados', () => {
    const r = emparejarExistentes(
      [
        { first_name: '  juan ', last_name: 'GOMEZ', phone: null },
        { first_name: 'Juan', last_name: 'Gómez', phone: '' },
      ],
      existentes,
    );
    expect(r).toEqual(['a2', 'a2']);
  });

  it('sin teléfono y sin apellido empareja solo si el existente tampoco tiene', () => {
    const r = emparejarExistentes(
      [
        { first_name: 'Ana', last_name: null, phone: null },
        { first_name: 'Ana', last_name: 'López', phone: null },
      ],
      existentes,
    );
    expect(r).toEqual(['a3', null]);
  });

  it('devuelve una entrada por fila, en el mismo orden', () => {
    const r = emparejarExistentes(
      [
        { first_name: 'Nadie', last_name: 'Nuevo', phone: '+573000000001' },
        { first_name: 'María', last_name: 'Pérez', phone: '+573001234567' },
        { first_name: 'Otro', last_name: null, phone: null },
      ],
      existentes,
    );
    expect(r).toEqual([null, 'a1', null]);
  });

  it('con la base vacía nada existe', () => {
    expect(emparejarExistentes([{ first_name: 'X', last_name: null, phone: null }], [])).toEqual([null]);
  });
});

describe('esErrorDePermiso', () => {
  it('reconoce el código 42501 de Postgres', () => {
    expect(esErrorDePermiso({ code: '42501', message: 'x' })).toBe(true);
  });

  it('reconoce el mensaje de RLS aunque no venga código', () => {
    expect(esErrorDePermiso({ message: 'new row violates row-level security policy' })).toBe(true);
  });

  it('un error de red o de unicidad NO es de permiso', () => {
    expect(esErrorDePermiso({ message: 'Failed to fetch' })).toBe(false);
    expect(esErrorDePermiso({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(esErrorDePermiso(null)).toBe(false);
    expect(esErrorDePermiso('texto')).toBe(false);
  });
});
