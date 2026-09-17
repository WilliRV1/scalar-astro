import { describe, expect, it } from 'vitest';
import {
  bandaDeScore,
  enlaceDeReenganche,
  estiloDeBanda,
  mensajeDeReenganche,
  motivoPrincipal,
  ordenarPorUrgencia,
  primerNombre,
  puedeEscribirsele,
} from '../riesgo';
import type { RiesgoAtleta } from '../types';

function riesgo(parcial: Partial<RiesgoAtleta> = {}): RiesgoAtleta {
  return {
    org_id: 'org',
    athlete_id: 'atleta',
    computed_on: '2026-03-20',
    days_since_last_visit: null,
    visits_last_30d: 0,
    visits_prev_30d: 0,
    days_overdue: 0,
    no_shows_30d: 0,
    tenure_days: 200,
    never_logged_result: false,
    score: 0,
    band: 'ok',
    reasons: [],
    athletes: {
      first_name: 'Juan Camilo',
      last_name: 'Pérez',
      phone: '+573001234567',
      consent_whatsapp_at: null,
      tags: [],
    },
    ...parcial,
  };
}

describe('bandaDeScore', () => {
  it('respeta las bandas de docs/04', () => {
    expect(bandaDeScore(0)).toBe('ok');
    expect(bandaDeScore(24)).toBe('ok');
    expect(bandaDeScore(25)).toBe('watch');
    expect(bandaDeScore(49)).toBe('watch');
    expect(bandaDeScore(50)).toBe('at_risk');
    expect(bandaDeScore(74)).toBe('at_risk');
    expect(bandaDeScore(75)).toBe('critical');
    expect(bandaDeScore(100)).toBe('critical');
  });

  it('coincide con el ejemplo de la prueba de base de datos (58 = at_risk)', () => {
    expect(bandaDeScore(58)).toBe('at_risk');
  });
});

describe('estiloDeBanda', () => {
  it('dice QUÉ HACER, no solo cómo se ve', () => {
    expect(estiloDeBanda('critical').accion).toContain('Llamada');
    expect(estiloDeBanda('at_risk').accion).toContain('Escríbele');
    expect(estiloDeBanda('ok').etiqueta).toBe('Al día');
  });
});

describe('motivoPrincipal', () => {
  it('escoge el motivo de más peso', () => {
    expect(motivoPrincipal([
      { codigo: 'novato', texto: 'Lleva 30 días en el box', puntos: 8 },
      { codigo: 'sin_venir', texto: 'Lleva 21 días sin venir', puntos: 38 },
    ])).toBe('Lleva 21 días sin venir');
  });
  it('no se cae si no hay motivos', () => {
    expect(motivoPrincipal([])).toContain('Sin señales');
  });
});

describe('mensajeDeReenganche', () => {
  it('saluda por el primer nombre', () => {
    expect(primerNombre({ first_name: 'Juan Camilo', last_name: 'Pérez' })).toBe('Juan');
  });

  it('a quien está en mora le habla de la mensualidad, no de que lo extrañan', () => {
    const texto = mensajeDeReenganche(
      riesgo({ days_overdue: 12, reasons: [{ codigo: 'mora', texto: '12 días de mora', puntos: 12 }] }),
      'Box Cali',
    );
    expect(texto).toContain('mensualidad');
    expect(texto).toContain('12 días');
    expect(texto).not.toContain('extrañando');
  });

  it('a quien dejó de venir le dice cuántos días lleva', () => {
    const texto = mensajeDeReenganche(
      riesgo({
        days_since_last_visit: 14,
        reasons: [{ codigo: 'sin_venir', texto: 'Lleva 14 días sin venir', puntos: 28 }],
      }),
      'Box Cali',
    );
    expect(texto).toContain('14 días');
    expect(texto).toContain('extrañando');
  });

  it('a quien nunca vino le ofrece la primera clase', () => {
    const texto = mensajeDeReenganche(
      riesgo({ reasons: [{ codigo: 'nunca_vino', texto: 'nunca vino', puntos: 40 }] }),
      'Box Cali',
    );
    expect(texto).toContain('primera clase');
  });

  it('siempre dice de qué box viene: el atleta no tiene el número guardado', () => {
    expect(mensajeDeReenganche(riesgo(), 'Box Cali')).toContain('Box Cali');
  });
});

describe('enlaceDeReenganche', () => {
  it('arma el enlace de un clic con el texto ya redactado', () => {
    const enlace = enlaceDeReenganche(riesgo({ days_since_last_visit: 9 }), 'Box Cali');
    expect(enlace).toContain('https://wa.me/573001234567?text=');
    expect(decodeURIComponent(enlace!)).toContain('Box Cali');
  });

  it('devuelve null si el atleta no tiene teléfono', () => {
    const sinTelefono = riesgo({
      athletes: { first_name: 'Ana', last_name: null, phone: null, consent_whatsapp_at: null, tags: [] },
    });
    expect(enlaceDeReenganche(sinTelefono, 'Box Cali')).toBeNull();
  });
});

describe('puedeEscribirsele', () => {
  it('respeta a quien pidió que no le escriban más', () => {
    const optOut = riesgo({
      athletes: {
        first_name: 'Ana', last_name: null, phone: '+573001234567',
        consent_whatsapp_at: null, tags: ['no_marketing'],
      },
    });
    expect(puedeEscribirsele(optOut)).toBe(false);
  });

  it('permite escribirle a quien sí tiene teléfono y no se dio de baja', () => {
    expect(puedeEscribirsele(riesgo())).toBe(true);
  });
});

describe('ordenarPorUrgencia', () => {
  it('pone primero al de mayor puntaje', () => {
    const lista = [riesgo({ score: 30 }), riesgo({ score: 80 }), riesgo({ score: 55 })];
    expect(ordenarPorUrgencia(lista).map((r) => r.score)).toEqual([80, 55, 30]);
  });

  it('desempata por los días sin venir', () => {
    const lista = [
      riesgo({ score: 50, days_since_last_visit: 7 }),
      riesgo({ score: 50, days_since_last_visit: 21 }),
    ];
    expect(ordenarPorUrgencia(lista)[0].days_since_last_visit).toBe(21);
  });

  it('no modifica la lista original', () => {
    const lista = [riesgo({ score: 10 }), riesgo({ score: 90 })];
    ordenarPorUrgencia(lista);
    expect(lista[0].score).toBe(10);
  });
});
