import { describe, expect, it } from 'vitest';
import {
  avisosDePlantilla,
  etiquetaDeCategoria,
  renderizarPlantilla,
  variablesDe,
  vistaPrevia,
} from '../plantillas';

describe('renderizarPlantilla', () => {
  it('reemplaza las variables por su valor', () => {
    expect(
      renderizarPlantilla('Hola {{nombre}}, son {{valor}}', { nombre: 'Ana', valor: '$ 180.000' }),
    ).toBe('Hola Ana, son $ 180.000');
  });

  it('borra la variable que no tiene valor: nunca viaja un {{hueco}} al atleta', () => {
    expect(renderizarPlantilla('Hola {{nombre}}{{sobra}}', { nombre: 'Ana' })).toBe('Hola Ana');
    expect(renderizarPlantilla('Hola {{nombre}}', { nombre: null })).toBe('Hola ');
  });

  it('reemplaza todas las apariciones de la misma variable', () => {
    expect(renderizarPlantilla('{{a}} y {{a}}', { a: 'x' })).toBe('x y x');
  });

  it('no toca lo que no es una variable', () => {
    expect(renderizarPlantilla('Cuesta {50.000} pesos', {})).toBe('Cuesta {50.000} pesos');
    expect(renderizarPlantilla('{{ nombre }}', { nombre: 'Ana' })).toBe('{{ nombre }}');
  });
});

describe('variablesDe', () => {
  it('lista las variables en orden y sin repetir', () => {
    expect(variablesDe('Hola {{nombre}}, tu pago de {{valor}} vence el {{fecha}}. {{nombre}}'))
      .toEqual(['nombre', 'valor', 'fecha']);
  });
  it('devuelve vacío si no hay variables', () => {
    expect(variablesDe('Nos vemos mañana')).toEqual([]);
  });
});

describe('vistaPrevia', () => {
  it('rellena la plantilla de fábrica con datos de ejemplo', () => {
    const texto = vistaPrevia(
      'Hola {{nombre}}, tu mensualidad de {{box}} vence el {{fecha}} ({{valor}}). Paga aquí: {{link}}',
    );
    expect(texto).toContain('Juan Camilo');
    expect(texto).toContain('$ 180.000');
    expect(texto).not.toContain('{{');
  });
});

describe('avisosDePlantilla', () => {
  it('exige la salida fácil en los mensajes publicitarios', () => {
    const avisos = avisosDePlantilla({ category: 'marketing', body: 'Te extrañamos, vuelve.' });
    expect(avisos.some((a) => a.includes('no le escriban más'))).toBe(true);
  });

  it('no la exige en un cobro, que es transaccional', () => {
    expect(avisosDePlantilla({ category: 'utility', body: 'Tu mensualidad vence el {{fecha}}.' }))
      .toEqual([]);
  });

  it('acepta el publicitario que sí dice cómo salirse', () => {
    expect(
      avisosDePlantilla({
        category: 'marketing',
        body: 'Te extrañamos. Si no quieres recibir más mensajes, responde NO.',
      }),
    ).toEqual([]);
  });

  it('avisa del mensaje vacío y del demasiado largo', () => {
    expect(avisosDePlantilla({ category: 'utility', body: '   ' }).length).toBeGreaterThan(0);
    expect(avisosDePlantilla({ category: 'utility', body: 'x'.repeat(1100) })
      .some((a) => a.includes('1.024'))).toBe(true);
  });

  it('detecta la variable escrita con espacios, que no se reemplaza', () => {
    expect(avisosDePlantilla({ category: 'utility', body: 'Hola {{ nombre }}' })
      .some((a) => a.includes('sin espacios'))).toBe(true);
  });
});

describe('etiquetaDeCategoria', () => {
  it('traduce la categoría de Meta a algo que el dueño entiende', () => {
    expect(etiquetaDeCategoria('utility')).toBe('Transaccional');
    expect(etiquetaDeCategoria('marketing')).toBe('Publicitario');
    expect(etiquetaDeCategoria('internal')).toContain('Interno');
  });
});
