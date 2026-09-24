import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../features/auth/useAuth';
import { useAtletasEnRiesgo } from '../../../features/automations/queries';
import {
  enlaceDeReenganche,
  estiloDeBanda,
  mensajeDeReenganche,
  motivoPrincipal,
  nombreCompleto,
  ordenarPorUrgencia,
  puedeEscribirsele,
} from '../../../features/automations/riesgo';
import type { BandaRiesgo, RiesgoAtleta } from '../../../features/automations/types';
import { formatPhone } from '../../../shared/lib/phone';
import { Card, EmptyState, ErrorNote, Spinner } from '../../../shared/ui';

/**
 * Quién se está yendo.
 *
 * Esta pantalla es el argumento de venta del producto. Hoy esta información
 * existe en la cabeza del dueño y se le olvida; aquí aparece sola cada mañana,
 * ordenada, CON EL MOTIVO y con un botón que abre WhatsApp con el mensaje ya
 * redactado. El coach no tiene que decidir a quién escribirle, ni buscar el
 * chat, ni pensar qué decir: eso es el 90% del trabajo.
 *
 * El puntaje lo calcula la base (refresh_risk_scores) de madrugada. Aquí no se
 * recalcula nada: un segundo cálculo sería un segundo resultado.
 */

const FILTROS: { key: BandaRiesgo | 'accionables'; label: string }[] = [
  { key: 'accionables', label: 'Hay que actuar' },
  { key: 'critical', label: 'Críticos' },
  { key: 'at_risk', label: 'En riesgo' },
  { key: 'watch', label: 'Ojo' },
  { key: 'ok', label: 'Al día' },
];

export default function RiskPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const nombreDelBox = activeMembership?.organizations?.name ?? 'tu box';

  const [filtro, setFiltro] = useState<BandaRiesgo | 'accionables'>('accionables');
  const bandas = filtro === 'accionables' ? ['critical', 'at_risk', 'watch'] : [filtro];

  const { data, isLoading, error } = useAtletasEnRiesgo(orgId, bandas);
  const lista = useMemo(() => ordenarPorUrgencia(data?.lista ?? []), [data]);

  const criticos = lista.filter((r) => r.band === 'critical').length;

  if (isLoading) return <Spinner label="Revisando quién se está yendo" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-black dark:text-white">Quién se está yendo</h1>
          <p className="text-xs uppercase tracking-widest text-gray-500">
            {data?.fecha
              ? `Calculado el ${new Date(`${data.fecha}T12:00:00`).toLocaleDateString('es-CO', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}`
              : 'Todavía sin calcular'}
          </p>
        </div>
        {criticos > 0 && (
          <span className="bg-primary px-3 py-2 font-display text-xl text-white">
            {criticos} para llamar hoy
          </span>
        )}
      </div>

      <p className="max-w-2xl text-sm text-gray-500">
        Ordenados por urgencia, con el motivo. El botón abre WhatsApp con el mensaje ya escrito:
        solo tienes que leerlo y darle enviar.
      </p>

      {error && (
        <ErrorNote>
          No se pudo cargar la lista. Si eres coach y no ves nada, puede ser que tu box todavía
          no haya corrido el cálculo.
        </ErrorNote>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={`grunge-border min-h-11 px-3 text-[11px] font-bold uppercase tracking-widest transition ${
              filtro === f.key ? 'border-primary text-primary' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {lista.length === 0 && (
        <EmptyState
          title={filtro === 'accionables' ? 'Nadie en riesgo hoy' : 'Nadie en esta banda'}
          hint={
            data?.fecha
              ? 'Buena señal: todos los atletas están viniendo y al día.'
              : 'La lista aparece sola cada mañana en cuanto el cálculo corra por primera vez.'
          }
        />
      )}

      <div className="space-y-2">
        {lista.map((riesgo) => (
          <FilaDeRiesgo key={riesgo.athlete_id} riesgo={riesgo} nombreDelBox={nombreDelBox} />
        ))}
      </div>
    </div>
  );
}

function FilaDeRiesgo({ riesgo, nombreDelBox }: { riesgo: RiesgoAtleta; nombreDelBox: string }) {
  const [abierto, setAbierto] = useState(false);
  const estilo = estiloDeBanda(riesgo.band);
  const enlace = enlaceDeReenganche(riesgo, nombreDelBox);
  const escribible = puedeEscribirsele(riesgo);

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3">
        {/* El puntaje a la izquierda: se lee la columna de un vistazo. */}
        <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center ${estilo.clase}`}>
          <span className="font-display text-2xl leading-none">{riesgo.score}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest">{estilo.etiqueta}</span>
        </div>

        <div className="min-w-[12rem] flex-1">
          <Link
            to={`/coach/atletas/${riesgo.athlete_id}`}
            className="font-bold text-black hover:text-primary dark:text-white"
          >
            {nombreCompleto(riesgo.athletes)}
          </Link>
          <p className="mt-0.5 text-sm text-gray-400">{motivoPrincipal(riesgo.reasons)}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-600">
            {estilo.accion}
            {riesgo.athletes?.phone && ` · ${formatPhone(riesgo.athletes.phone)}`}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-1.5">
          {escribible && enlace ? (
            <a
              href={enlace}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-primary px-4 py-3 font-display text-xl tracking-wide text-white transition hover:bg-red-700"
            >
              Escribirle
            </a>
          ) : (
            <span className="grunge-border inline-flex min-h-11 items-center justify-center px-4 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-gray-600">
              {riesgo.athletes?.phone ? 'Pidió no recibir mensajes' : 'Sin teléfono'}
            </span>
          )}
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="min-h-11 px-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
          >
            {abierto ? 'Ocultar' : 'Por qué'}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-800">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">
              Señales
            </p>
            <ul className="space-y-1">
              {(riesgo.reasons ?? []).map((m) => (
                <li key={m.codigo + m.puntos} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-gray-300">{m.texto}</span>
                  <span className="shrink-0 text-xs font-bold text-primary">+{m.puntos}</span>
                </li>
              ))}
              {(riesgo.reasons ?? []).length === 0 && (
                <li className="text-sm text-gray-500">Sin señales de alerta.</li>
              )}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 sm:grid-cols-4">
            <Dato
              etiqueta="Sin venir"
              valor={riesgo.days_since_last_visit == null ? 'nunca vino' : `${riesgo.days_since_last_visit} días`}
            />
            <Dato etiqueta="Este mes / anterior" valor={`${riesgo.visits_last_30d} / ${riesgo.visits_prev_30d}`} />
            <Dato etiqueta="Mora" valor={riesgo.days_overdue > 0 ? `${riesgo.days_overdue} días` : 'al día'} />
            <Dato etiqueta="Antigüedad" valor={`${riesgo.tenure_days} días`} />
          </div>

          {escribible && (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">
                El mensaje que se va a abrir
              </p>
              <p className="grunge-border bg-emerald-950/30 p-3 text-sm text-gray-200">
                {mensajeDeReenganche(riesgo, nombreDelBox)}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">{etiqueta}</p>
      <p className="text-sm text-gray-300">{valor}</p>
    </div>
  );
}
