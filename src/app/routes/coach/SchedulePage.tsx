import { useMemo, useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import {
  addDays,
  longDayLabel,
  shortDayLabel,
  todayInBox,
  weekDays,
  weekStart,
} from '../../../features/wods/dates';
import {
  BOGOTA,
  DIAS_SEMANA,
  RosterList,
  TemplateEditor,
  agruparPorDia,
  diaDeClase,
  esFestivo,
  etiquetaCupo,
  horaDeClase,
  horaDePlantilla,
  useCancelClass,
  useCheckIn,
  useClassRoster,
  useClassTemplates,
  useClasses,
  useCloseClass,
  useDeleteTemplate,
  useSaveTemplate,
  useUpdateClass,
} from '../../../features/reservations';
import type { ClassRow, ClassTemplate } from '../../../features/reservations';
import { Button, Drawer, EmptyState, ErrorNote, Field, Spinner, TextInput } from '../../../shared/ui';
import { mensajeAmigable } from '../../../shared/lib/errores';

/**
 * Horarios del box, desde el celular del coach.
 *
 * Dos cosas en una pantalla porque son dos momentos del mismo trabajo:
 *
 *  · La SEMANA: qué clases hay, cuántos reservaron y cuántos esperan. De un
 *    vistazo, sin entrar a ninguna.
 *  · La CLASE: la lista, con check-in masivo de un toque por persona. Es lo que
 *    el coach abre a las 5:58 a. m. con la gente entrando por la puerta.
 *
 * La parrilla semanal (la plantilla que genera las clases) vive abajo, en una
 * sección aparte: se toca una vez cada varios meses, no todos los días.
 */
export default function SchedulePage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const timezone = activeMembership?.organizations?.timezone ?? BOGOTA;

  const hoy = useMemo(() => todayInBox(timezone), [timezone]);
  const [semana, setSemana] = useState(() => weekStart(hoy));
  // Solo el id: la clase se busca en `clases` en cada render, así el cajón ve
  // el cupo y el estado nuevos en cuanto la consulta se refresca, en vez de
  // quedarse con la foto del momento en que se abrió.
  const [claseAbiertaId, setClaseAbiertaId] = useState<string | null>(null);
  const [plantillaAbierta, setPlantillaAbierta] = useState<ClassTemplate | null | undefined>(
    undefined,
  );

  const dias = useMemo(() => weekDays(semana), [semana]);
  // Un día de holgura a cada lado: los límites van en UTC y el día del box se
  // resuelve después con `agruparPorDia`, que sí conoce la zona horaria.
  const desde = `${addDays(semana, -1)}T00:00:00.000Z`;
  const hasta = `${addDays(semana, 8)}T00:00:00.000Z`;

  const { data: clases, isLoading, error } = useClasses(orgId, desde, hasta);
  const { data: parrilla } = useClassTemplates(orgId);

  const guardarPlantilla = useSaveTemplate();
  const quitarPlantilla = useDeleteTemplate();

  const porDia = useMemo(
    () => agruparPorDia(clases ?? [], timezone),
    [clases, timezone],
  );

  const activas = (parrilla ?? []).filter((p) => p.is_active);
  const claseAbierta = claseAbiertaId
    ? (clases ?? []).find((c) => c.id === claseAbiertaId) ?? null
    : null;

  if (!orgId) return <EmptyState title="Sin box activo" />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-black dark:text-white">Horarios</h1>
          <p className="text-xs text-gray-500">
            Semana del {shortDayLabel(semana)} al {shortDayLabel(addDays(semana, 6))}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSemana(addDays(semana, -7))}>
            ‹ Anterior
          </Button>
          {semana !== weekStart(hoy) && (
            <Button variant="ghost" onClick={() => setSemana(weekStart(hoy))}>
              Esta semana
            </Button>
          )}
          <Button variant="ghost" onClick={() => setSemana(addDays(semana, 7))}>
            Siguiente ›
          </Button>
        </div>
      </header>

      {error && (
        <ErrorNote>No se pudieron cargar las clases: {mensajeAmigable(error)}</ErrorNote>
      )}
      {isLoading && <Spinner label="Cargando la semana" />}

      <div className="space-y-4">
        {dias.map((d) => {
          const delDia = porDia.get(d) ?? [];
          const festivo = esFestivo(d);
          return (
            <section key={d}>
              <h2 className="mb-1.5 flex items-baseline gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
                <span className={d === hoy ? 'text-primary' : ''}>{longDayLabel(d)}</span>
                {festivo && <span className="text-gray-600">· festivo</span>}
              </h2>

              {delDia.length === 0 ? (
                <p className="border-l-2 border-gray-800 px-3 py-2 text-xs text-gray-600">
                  {festivo ? 'Festivo: sin clases.' : 'Sin clases.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {delDia.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClaseAbiertaId(c.id)}
                      className={`flex h-16 w-full items-center gap-3 border-l-4 px-4 text-left transition hover:border-primary ${
                        c.status === 'cancelled'
                          ? 'border-gray-700 bg-black/10 opacity-60 dark:bg-white/5'
                          : 'border-transparent bg-black/20 dark:bg-white/5'
                      }`}
                    >
                      <span className="w-20 shrink-0 font-display text-2xl leading-none text-black dark:text-white">
                        {horaDeClase(c.starts_at, timezone)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-black dark:text-white">
                          {c.name}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {c.status === 'cancelled'
                            ? `Cancelada: ${c.cancel_reason ?? 'sin motivo'}`
                            : etiquetaCupo(c)}
                        </span>
                      </span>
                      <span className="shrink-0 font-display text-2xl text-gray-500">
                        {c.reserved_count}
                        <span className="text-sm text-gray-600">/{c.capacity}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* --------------------------------------------------- parrilla semanal */}
      <section className="grunge-border bg-surface-light p-4 dark:bg-surface-dark">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-black dark:text-white">Parrilla semanal</h2>
          <Button variant="ghost" onClick={() => setPlantillaAbierta(null)}>
            + Franja
          </Button>
        </div>

        {activas.length === 0 ? (
          <p className="text-sm text-gray-500">
            Todavía no hay parrilla. Crea la primera franja ("Lunes 6:00 a. m., cupo 14") y
            de ahí salen las clases de las próximas semanas, saltándose los festivos.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {activas.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPlantillaAbierta(p)}
                  className="flex w-full items-center gap-3 py-3 text-left hover:text-primary"
                >
                  <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-widest text-gray-500">
                    {DIAS_SEMANA[p.weekday]}
                  </span>
                  <span className="font-display text-xl text-black dark:text-white">
                    {horaDePlantilla(p.start_time)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-400">{p.name}</span>
                  <span className="shrink-0 text-xs text-gray-500">cupo {p.capacity}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {claseAbierta && (
        <ClaseDrawer
          key={claseAbierta.id}
          orgId={orgId}
          clase={claseAbierta}
          timezone={timezone}
          onClose={() => setClaseAbiertaId(null)}
        />
      )}

      <Drawer
        open={plantillaAbierta !== undefined}
        title={plantillaAbierta ? 'Editar franja' : 'Nueva franja'}
        onClose={() => setPlantillaAbierta(undefined)}
      >
        {plantillaAbierta !== undefined && (
          <>
            {guardarPlantilla.error && (
              <div className="mb-3">
                <ErrorNote>{mensajeAmigable(guardarPlantilla.error)}</ErrorNote>
              </div>
            )}
            {quitarPlantilla.error && (
              <div className="mb-3">
                <ErrorNote>
                  No se pudo desactivar la franja: {mensajeAmigable(quitarPlantilla.error)}
                </ErrorNote>
              </div>
            )}
            <TemplateEditor
              plantilla={plantillaAbierta}
              guardando={guardarPlantilla.isPending || quitarPlantilla.isPending}
              onGuardar={(p) =>
                guardarPlantilla.mutate(
                  { orgId, plantilla: p },
                  { onSuccess: () => setPlantillaAbierta(undefined) },
                )
              }
              onDesactivar={
                plantillaAbierta
                  ? () =>
                      quitarPlantilla.mutate(
                        { orgId, templateId: plantillaAbierta.id },
                        { onSuccess: () => setPlantillaAbierta(undefined) },
                      )
                  : undefined
              }
            />
          </>
        )}
      </Drawer>
    </div>
  );
}

/**
 * La clase abierta: lista, check-in, cupo y cancelación.
 *
 * Cancelar una clase pide motivo porque el motivo VIAJA en el WhatsApp que
 * reciben los reservados ("se canceló la de 6:00, el coach está enfermo"). Un
 * aviso sin motivo genera más preguntas de las que evita.
 */
function ClaseDrawer({
  orgId,
  clase,
  timezone,
  onClose,
}: {
  orgId: string;
  clase: ClassRow;
  timezone: string;
  onClose: () => void;
}) {
  const { data: lista, isLoading, error: errorLista } = useClassRoster(orgId, clase.id);
  const checkIn = useCheckIn();
  const cerrar = useCloseClass();
  const cancelarClase = useCancelClass();
  const actualizar = useUpdateClass();

  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [cupo, setCupo] = useState(String(clase.capacity));

  const ocupado =
    checkIn.isPending || cerrar.isPending || cancelarClase.isPending || actualizar.isPending;
  const errorDeAccion =
    checkIn.error ?? cerrar.error ?? cancelarClase.error ?? actualizar.error;

  const cupoNum = /^\d+$/.test(cupo) ? Number(cupo) : NaN;
  const cupoValido = !Number.isNaN(cupoNum) && cupoNum >= 1;

  return (
    <Drawer
      open
      title={`${clase.name} · ${horaDeClase(clase.starts_at, timezone)}`}
      onClose={onClose}
      footer={
        clase.status === 'scheduled' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              disabled={ocupado}
              onClick={() => { setConfirmando(false); setConfirmandoCierre(true); }}
            >
              Cerrar clase
            </Button>
            <Button
              variant="ghost"
              disabled={ocupado}
              onClick={() => { setConfirmandoCierre(false); setConfirmando(true); }}
            >
              Cancelar la clase
            </Button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Clase cancelada{clase.cancel_reason ? `: ${clase.cancel_reason}` : ''}. Se les
            avisó a los reservados y se les devolvió el crédito.
          </p>
        )
      }
    >
      <div className="space-y-5">
        <p className="text-xs capitalize text-gray-500">
          {longDayLabel(diaDeClase(clase.starts_at, timezone))} · {etiquetaCupo(clase)}
        </p>

        {errorDeAccion && <ErrorNote>{mensajeAmigable(errorDeAccion)}</ErrorNote>}

        {confirmandoCierre && (
          <div className="grunge-border space-y-3 border-primary p-4">
            <p className="text-sm text-gray-300">
              Cerrar la clase marca como falta a quienes reservaron y no hicieron check-in.
              Revisa la lista antes de confirmar.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={ocupado}
                onClick={() =>
                  cerrar.mutate(
                    { orgId, classId: clase.id },
                    { onSuccess: () => setConfirmandoCierre(false) },
                  )
                }
              >
                Sí, cerrar
              </Button>
              <Button variant="ghost" onClick={() => setConfirmandoCierre(false)}>
                Volver
              </Button>
            </div>
          </div>
        )}

        {confirmando && (
          <div className="grunge-border space-y-3 border-primary p-4">
            <Field
              label="¿Por qué se cancela?"
              hint="Este texto le llega por WhatsApp a quien reservó."
            >
              <TextInput
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="El coach está enfermo"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                disabled={motivo.trim().length < 3 || ocupado}
                onClick={() =>
                  cancelarClase.mutate(
                    { orgId, classId: clase.id, motivo: motivo.trim() },
                    { onSuccess: onClose },
                  )
                }
              >
                Cancelar y avisar
              </Button>
              <Button variant="ghost" onClick={() => setConfirmando(false)}>
                Volver
              </Button>
            </div>
          </div>
        )}

        {clase.status === 'scheduled' && (
          <div className="flex items-end gap-2">
            <div className="w-32">
              <Field label="Cupo de hoy">
                <TextInput
                  inputMode="numeric"
                  value={cupo}
                  onChange={(e) => setCupo(e.target.value)}
                />
              </Field>
            </div>
            <Button
              variant="ghost"
              disabled={!cupoValido || ocupado || cupoNum === clase.capacity}
              onClick={() =>
                actualizar.mutate({ orgId, classId: clase.id, cambios: { capacity: cupoNum } })
              }
            >
              Ajustar
            </Button>
          </div>
        )}

        {isLoading ? (
          <Spinner label="Cargando la lista" />
        ) : errorLista ? (
          <ErrorNote>No se pudo cargar la lista: {mensajeAmigable(errorLista)}</ErrorNote>
        ) : (
          <RosterList
            filas={lista ?? []}
            ocupado={ocupado}
            onCheckIn={(athleteId, presente) =>
              checkIn.mutate({ orgId, classId: clase.id, athleteId, presente })
            }
          />
        )}
      </div>
    </Drawer>
  );
}
