import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../features/auth/useAuth';
import {
  BarraProgreso,
  PASOS,
  RESUMEN_PASO,
  SeccionAtletas,
  SeccionBox,
  SeccionCobros,
  SeccionMensajes,
  SeccionPlanes,
  TITULO_PASO,
  useMarcarPaso,
  useOnboarding,
} from '../../../features/orgsetup';
import type { AvanceOnboarding, Paso } from '../../../features/orgsetup';
import { Button, Card, EmptyState, ErrorNote, Spinner } from '../../../shared/ui';

/**
 * Puesta en marcha del box.
 *
 * El objetivo es medible: que un dueño que nunca nos ha visto tenga su box
 * cobrando en diez minutos, sin que nadie le pida datos por WhatsApp.
 *
 * Tres decisiones que vienen de ver cómo se usa esto de verdad:
 *
 *   1. CADA PASO GUARDA SOLO. El avance vive en la base, no en el estado de
 *      este componente. Al dueño lo interrumpen —llega un atleta, suena el
 *      teléfono— y vuelve en la noche desde otro aparato. Si al volver
 *      encontrara el formulario en blanco, no vuelve una tercera vez.
 *   2. TODO SE PUEDE SALTAR. El que va a importar el Excel el lunes tiene que
 *      poder seguir hoy. Saltado se ve distinto de hecho: sigue faltando.
 *   3. NADA ES DEFINITIVO. Todo lo de aquí está también en Configuración, y se
 *      lo decimos, porque el miedo a equivocarse es lo que hace que un dueño
 *      abandone en el paso 2.
 */
export default function OnboardingPage() {
  const { activeMembership } = useAuth();
  const navegar = useNavigate();
  const orgId = activeMembership?.org_id;
  const esDueno = activeMembership?.role === 'owner' || activeMembership?.role === 'admin';

  const { data: avance, isLoading, error } = useOnboarding(esDueno ? orgId : undefined);
  const marcar = useMarcarPaso();

  // El paso que se está mirando. Empieza en null y cae al que dice el servidor:
  // así el componente no tiene que copiarse el estado del servidor en un efecto.
  const [pasoVisible, setPasoVisible] = useState<Paso | null>(null);
  const [errorPaso, setErrorPaso] = useState('');

  if (!esDueno || !orgId) {
    return (
      <EmptyState
        title="Solo el dueño y el administrador"
        hint="La puesta en marcha decide los precios y cómo se cobra, así que la hace quien responde por el box."
      />
    );
  }

  if (isLoading) return <Spinner label="Cargando tu puesta en marcha" />;
  if (error) {
    return <ErrorNote>No se pudo cargar la puesta en marcha: {textoDe(error)}</ErrorNote>;
  }

  const estado: AvanceOnboarding = avance ?? {
    org_id: orgId,
    current_step: 'box',
    steps_done: [],
    steps_skipped: [],
    completed_at: null,
  };

  const sugerido: Paso = estado.current_step === 'done' ? 'box' : estado.current_step;
  const paso: Paso = pasoVisible ?? sugerido;
  const indice = PASOS.indexOf(paso);

  const hecho = estado.steps_done.includes(paso);
  const saltado = estado.steps_skipped.includes(paso);

  async function avanzar(estadoPaso: 'done' | 'skipped') {
    setErrorPaso('');
    try {
      await marcar.mutateAsync({ orgId: orgId!, paso, estado: estadoPaso });
    } catch (err) {
      setErrorPaso(textoDe(err));
      return;
    }
    const siguiente = PASOS[indice + 1];
    if (siguiente) setPasoVisible(siguiente);
    else navegar('/admin');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-3xl text-black dark:text-white">Pon tu box a andar</h1>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Unos 10 minutos
          </span>
        </div>
        <BarraProgreso
          hechos={estado.steps_done.length}
          saltados={estado.steps_skipped.length}
          total={PASOS.length}
        />
      </header>

      {estado.completed_at && (
        <Card className="border-l-4 border-emerald-500">
          <p className="font-display text-2xl text-black dark:text-white">Ya está</p>
          <p className="mt-1 text-sm text-gray-500">
            Tu box está configurado. Todo esto se sigue cambiando cuando quieras en{' '}
            <Link to="/admin/configuracion" className="font-bold text-primary hover:underline">
              Configuración
            </Link>
            .
          </p>
        </Card>
      )}

      {/* Los pasos, para saltar de uno a otro sin orden. Se puede volver atrás:
          el que se arrepiente del precio en el paso 4 no tiene que terminar. */}
      <nav aria-label="Pasos" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {PASOS.map((p, i) => {
          const pHecho = estado.steps_done.includes(p);
          const pSaltado = estado.steps_skipped.includes(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPasoVisible(p)}
              aria-current={p === paso ? 'step' : undefined}
              className={`shrink-0 border-b-2 px-3 py-2 text-left transition ${
                p === paso
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-black dark:hover:text-white'
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-widest">
                {i + 1}. {pHecho ? 'Listo' : pSaltado ? 'Saltado' : 'Falta'}
              </span>
              <span className="block font-display text-lg">{TITULO_PASO[p]}</span>
            </button>
          );
        })}
      </nav>

      <Card className="space-y-4">
        <div>
          <h2 className="font-display text-2xl text-black dark:text-white">{TITULO_PASO[paso]}</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">{RESUMEN_PASO[paso]}</p>
        </div>

        {paso === 'box' && <SeccionBox orgId={orgId} onGuardado={() => marcarSilencioso('box')} />}
        {paso === 'plans' && <SeccionPlanes orgId={orgId} />}
        {paso === 'billing' && (
          <SeccionCobros orgId={orgId} onGuardado={() => marcarSilencioso('billing')} />
        )}
        {paso === 'athletes' && <SeccionAtletas orgId={orgId} />}
        {paso === 'automations' && (
          <SeccionMensajes orgId={orgId} onGuardado={() => marcarSilencioso('automations')} />
        )}
      </Card>

      {!hecho && !saltado && (
        <p className="text-xs text-gray-500">
          Este paso todavía no está marcado como listo. Puedes seguir y volver después: nada se
          pierde.
        </p>
      )}

      {errorPaso && <ErrorNote>{errorPaso}</ErrorNote>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          onClick={() => setPasoVisible(PASOS[indice - 1] ?? PASOS[0])}
          disabled={indice === 0}
        >
          ← Atrás
        </Button>

        <button
          type="button"
          onClick={() => void avanzar('skipped')}
          disabled={marcar.isPending}
          className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary disabled:opacity-40"
        >
          Saltar por ahora
        </button>

        <Button
          onClick={() => void avanzar('done')}
          disabled={marcar.isPending}
          className="ml-auto"
        >
          {marcar.isPending
            ? 'Guardando…'
            : indice === PASOS.length - 1
              ? 'Terminar'
              : 'Listo, siguiente →'}
        </Button>
      </div>
    </div>
  );

  /** Marca el paso como hecho cuando su formulario guardó. Sin mover al dueño de sitio. */
  function marcarSilencioso(cual: Paso) {
    if (estado.steps_done.includes(cual)) return;
    marcar.mutate({ orgId: orgId!, paso: cual, estado: 'done' });
  }
}

function textoDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
