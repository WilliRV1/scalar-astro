import { formatCents } from '../../shared/lib/money';
import { formatPhone } from '../../shared/lib/phone';
import type { EstadoFila, FilaNormalizada } from './parse';

const ETIQUETA_ESTADO: Record<EstadoFila, { texto: string; clase: string }> = {
  lista: { texto: 'Lista', clase: 'text-green-500' },
  aviso: { texto: 'Revisar', clase: 'text-yellow-500' },
  error: { texto: 'No entra', clase: 'text-primary' },
};

function Observaciones({ fila }: { fila: FilaNormalizada }) {
  const notas = [...fila.errores, ...fila.avisos];
  if (notas.length === 0) return <span className="text-gray-600">—</span>;
  return (
    <span className="text-xs text-gray-400">
      {notas[0].mensaje}
      {notas.length > 1 && <span className="text-gray-600"> (+{notas.length - 1} más)</span>}
    </span>
  );
}

/**
 * Vista previa con las filas ya normalizadas: lo que se ve aquí es exactamente
 * lo que se va a guardar. Nada de mostrar el Excel crudo y cruzar los dedos.
 */
export function TablaPrevia({
  filas, omitidas, onAlternarOmitir, limite = 25,
}: {
  filas: FilaNormalizada[];
  omitidas: Set<number>;
  onAlternarOmitir: (indice: number) => void;
  limite?: number;
}) {
  const visibles = filas.slice(0, limite);

  return (
    <div className="space-y-3">
      {/* Móvil: una tarjeta por atleta. */}
      <ul className="space-y-2 sm:hidden">
        {visibles.map((fila) => {
          const estado = ETIQUETA_ESTADO[fila.estado];
          const omitida = omitidas.has(fila.indice);
          return (
            <li key={fila.indice} className={`grunge-border bg-surface-dark p-3 ${omitida ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-white">
                    {fila.atleta
                      ? [fila.atleta.first_name, fila.atleta.last_name].filter(Boolean).join(' ')
                      : fila.nombreCrudo || '(sin nombre)'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Fila {fila.indice} · {formatPhone(fila.atleta?.phone)}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-widest ${estado.clase}`}>
                  {estado.texto}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {fila.suscripcion
                  ? `Corte ${fila.suscripcion.billing_day} · ${formatCents(fila.suscripcion.price_cents)}`
                  : 'Sin suscripción'}
                {fila.marcas.length > 0 && ` · ${fila.marcas.length} marcas`}
              </p>
              <div className="mt-1"><Observaciones fila={fila} /></div>
              {fila.duplicado && (
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={omitida}
                    onChange={() => onAlternarOmitir(fila.indice)}
                    className="h-4 w-4 accent-[#FF0000]"
                  />
                  Omitir esta fila (ya existe)
                </label>
              )}
            </li>
          );
        })}
      </ul>

      {/* Escritorio: tabla. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-[10px] uppercase tracking-widest text-gray-500">
              <th className="p-2 font-bold">Fila</th>
              <th className="p-2 font-bold">Estado</th>
              <th className="p-2 font-bold">Atleta</th>
              <th className="p-2 font-bold">Celular</th>
              <th className="p-2 font-bold">Corte</th>
              <th className="p-2 font-bold">Mensualidad</th>
              <th className="p-2 font-bold">Marcas</th>
              <th className="p-2 font-bold">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((fila) => {
              const estado = ETIQUETA_ESTADO[fila.estado];
              const omitida = omitidas.has(fila.indice);
              return (
                <tr
                  key={fila.indice}
                  className={`border-b border-gray-900 align-top ${omitida ? 'opacity-40' : ''}`}
                >
                  <td className="p-2 text-gray-600">{fila.indice}</td>
                  <td className={`p-2 text-[10px] font-bold uppercase tracking-widest ${estado.clase}`}>
                    {estado.texto}
                    {fila.duplicado && (
                      <label className="mt-1 flex items-center gap-1 text-[10px] normal-case tracking-normal text-gray-400">
                        <input
                          type="checkbox"
                          checked={omitida}
                          onChange={() => onAlternarOmitir(fila.indice)}
                          className="h-3 w-3 accent-[#FF0000]"
                        />
                        omitir
                      </label>
                    )}
                  </td>
                  <td className="p-2 font-bold text-white">
                    {fila.atleta
                      ? [fila.atleta.first_name, fila.atleta.last_name].filter(Boolean).join(' ')
                      : fila.nombreCrudo || '(sin nombre)'}
                  </td>
                  <td className="p-2 text-gray-400">{formatPhone(fila.atleta?.phone)}</td>
                  <td className="p-2 text-gray-400">{fila.suscripcion?.billing_day ?? '—'}</td>
                  <td className="p-2 text-gray-400">
                    {fila.suscripcion ? formatCents(fila.suscripcion.price_cents) : '—'}
                  </td>
                  <td className="p-2 text-gray-400">{fila.marcas.length || '—'}</td>
                  <td className="p-2"><Observaciones fila={fila} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filas.length > visibles.length && (
        <p className="text-center text-xs text-gray-600">
          … y {filas.length - visibles.length} filas más con el mismo tratamiento.
        </p>
      )}
    </div>
  );
}
