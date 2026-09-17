/**
 * Sparkline de una sola serie, en SVG puro y sin librería.
 *
 * Decisiones tomadas siguiendo la guía de visualización:
 * - Serie única -> sin leyenda; el título de la casilla nombra el movimiento.
 * - Sin número sobre cada punto: el valor actual ya es la cifra grande de la
 *   casilla, y el resto lo cuenta el tooltip nativo de cada punto.
 * - Trazo de 2 px y punto final marcado; el resto del recorrido es contexto.
 * - En tiempo el eje se invierte, porque bajar es mejorar: así la línea sube
 *   cuando al atleta le va mejor, que es lo que su ojo espera.
 */
export function Sparkline({
  values, labels, invert = false, width = 120, height = 36,
}: {
  values: number[];
  labels?: string[];
  /** true para métricas donde menos es mejor (tiempos). */
  invert?: boolean;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const pad = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const puntos = values.map((v, i) => {
    const x = pad + (i * (width - pad * 2)) / (values.length - 1);
    const t = (v - min) / span;
    const norm = invert ? t : 1 - t;   // en SVG el 0 está arriba
    const y = pad + norm * (height - pad * 2);
    return { x, y, v };
  });

  const d = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fin = puntos[puntos.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Evolución: ${values.length} marcas registradas`}
      className="overflow-visible"
    >
      <path d={d} fill="none" stroke="#FF0000" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
      {/* Anillo del color de la superficie para que el punto final se despegue
          del trazo, en vez de dibujarle un borde. */}
      <circle cx={fin.x} cy={fin.y} r={4} fill="#FF0000" stroke="#0a0a0a" strokeWidth={2} />
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={7} fill="transparent">
          <title>{labels?.[i] ?? String(p.v)}</title>
        </circle>
      ))}
    </svg>
  );
}
