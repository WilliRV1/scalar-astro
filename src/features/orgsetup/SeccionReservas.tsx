import { useState } from 'react';
import { Button, ErrorNote, Select, Spinner, TextInput } from '../../shared/ui';
import { useReservationSettings } from '../reservations/queries';
import type { ReservationSettings } from '../reservations/types';
import { mensaje } from './errores';
import { useGuardarAjustesReserva } from './mutations';
import { erroresPorCampo, esquemaReservas } from './esquema';
import { Guardado, Interruptor, Nota, Opcion } from './piezas';
import { AYUDA } from './textos';

/**
 * Las reglas de reserva.
 *
 * Tabla `reservation_settings` (migración 0014). Dos avisos que no son
 * decoración:
 *
 *   · El bloqueo por mora le cierra la puerta a un atleta que debe. Es una
 *     decisión del box, no del software, y arranca apagado a propósito.
 *   · Cuántos días de mora se toleran NO se configura aquí: lo decide la regla
 *     de corte de acceso en Mensajes. Dos plazos para la misma decisión en dos
 *     pantallas es cómo se llega a "el sistema lo bloqueó y nadie sabe por qué".
 */
export function SeccionReservas({
  orgId, onGuardado,
}: {
  orgId: string;
  onGuardado?: () => void;
}) {
  const { data, isLoading, error } = useReservationSettings(orgId);

  if (isLoading) return <Spinner label="Cargando las reglas de reserva" />;
  if (error) return <ErrorNote>No se pudieron cargar las reservas: {mensaje(error)}</ErrorNote>;
  if (!data) {
    return (
      <ErrorNote>
        Tu box todavía no tiene reglas de reserva. Recarga la página; si sigue así, escríbenos.
      </ErrorNote>
    );
  }

  return <Formulario key={orgId} orgId={orgId} ajustes={data} onGuardado={onGuardado} />;
}

const POLITICA_TARDE = [
  { value: 'free', label: 'No pasa nada' },
  { value: 'consume_credit', label: 'Le gasta la clase del bono' },
  { value: 'no_show', label: 'Cuenta como falta' },
];

const POLITICA_FALTA = [
  { value: 'record', label: 'Solo queda registrado' },
  { value: 'notify', label: 'Además se le avisa' },
  { value: 'block', label: 'Se le bloquea la reserva un tiempo' },
];

function Formulario({
  orgId, ajustes, onGuardado,
}: {
  orgId: string;
  ajustes: ReservationSettings;
  onGuardado?: () => void;
}) {
  const guardar = useGuardarAjustesReserva();
  const [abre, setAbre] = useState(String(ajustes.open_hours_before));
  const [cierra, setCierra] = useState(String(ajustes.close_minutes_before));
  const [cancela, setCancela] = useState(String(ajustes.cancel_minutes_before));
  const [politicaTarde, setPoliticaTarde] = useState(ajustes.late_cancel_policy);
  const [mora, setMora] = useState(ajustes.block_when_overdue);
  const [espera, setEspera] = useState(ajustes.waitlist_enabled);
  const [topeEspera, setTopeEspera] = useState(String(ajustes.waitlist_max));
  const [politicaFalta, setPoliticaFalta] = useState(ajustes.no_show_policy);
  const [faltaGasta, setFaltaGasta] = useState(ajustes.no_show_consumes_credit);
  const [faltas, setFaltas] = useState(String(ajustes.no_show_threshold));
  const [ventana, setVentana] = useState(String(ajustes.no_show_window_days));
  const [bloqueo, setBloqueo] = useState(String(ajustes.no_show_block_days));
  const [festivos, setFestivos] = useState(ajustes.skip_holidays);
  const [semanas, setSemanas] = useState(String(ajustes.weeks_ahead));
  const [sinReserva, setSinReserva] = useState(ajustes.allow_walk_in);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setListo(false);

    const revisado = esquemaReservas.safeParse({
      open_hours_before: abre,
      close_minutes_before: cierra,
      cancel_minutes_before: cancela,
      late_cancel_policy: politicaTarde,
      block_when_overdue: mora,
      waitlist_enabled: espera,
      waitlist_max: topeEspera,
      no_show_policy: politicaFalta,
      no_show_consumes_credit: faltaGasta,
      no_show_threshold: faltas,
      no_show_window_days: ventana,
      no_show_block_days: bloqueo,
      skip_holidays: festivos,
      weeks_ahead: semanas,
      allow_walk_in: sinReserva,
    });
    if (!revisado.success) {
      setErrores(erroresPorCampo(revisado.error));
      return;
    }

    try {
      await guardar.mutateAsync({ orgId, ajustes: revisado.data });
      setListo(true);
      onGuardado?.();
    } catch (err) {
      setErrores({ _: mensaje(err) });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="space-y-4">
        <h3 className="font-display text-xl text-black dark:text-white">Cuándo se puede reservar</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Opcion
            etiqueta="Se abre (horas antes)"
            ayuda={AYUDA.abreReserva}
            error={errores.open_hours_before}
          >
            <TextInput inputMode="numeric" value={abre} onChange={(e) => setAbre(e.target.value)} />
          </Opcion>
          <Opcion
            etiqueta="Se cierra (minutos antes)"
            ayuda={AYUDA.cierraReserva}
            error={errores.close_minutes_before}
          >
            <TextInput inputMode="numeric" value={cierra} onChange={(e) => setCierra(e.target.value)} />
          </Opcion>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Opcion
            etiqueta="Cancela sin costo (minutos antes)"
            ayuda={AYUDA.cancelaSinPenalizacion}
            error={errores.cancel_minutes_before}
          >
            <TextInput inputMode="numeric" value={cancela} onChange={(e) => setCancela(e.target.value)} />
          </Opcion>
          <Opcion
            etiqueta="Si cancela tarde"
            ayuda={AYUDA.politicaCancelacionTarde}
            error={errores.late_cancel_policy}
          >
            <Select
              value={politicaTarde}
              onChange={(e) => setPoliticaTarde(e.target.value as ReservationSettings['late_cancel_policy'])}
            >
              {POLITICA_TARDE.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </Opcion>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl text-black dark:text-white">Lista de espera</h3>
        <Interruptor
          etiqueta="Usar lista de espera"
          ayuda={AYUDA.listaEspera}
          activo={espera}
          onCambiar={setEspera}
        />
        {espera && (
          <Opcion etiqueta="Cuántos caben" ayuda={AYUDA.topeListaEspera} error={errores.waitlist_max}>
            <TextInput
              inputMode="numeric"
              value={topeEspera}
              onChange={(e) => setTopeEspera(e.target.value)}
            />
          </Opcion>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-xl text-black dark:text-white">El que no llega</h3>
        <Opcion etiqueta="Qué haces" ayuda={AYUDA.politicaNoShow} error={errores.no_show_policy}>
          <Select
            value={politicaFalta}
            onChange={(e) => setPoliticaFalta(e.target.value as ReservationSettings['no_show_policy'])}
          >
            {POLITICA_FALTA.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </Opcion>

        <Interruptor
          etiqueta="La falta le gasta la clase del bono"
          ayuda={AYUDA.noShowGastaBono}
          activo={faltaGasta}
          onCambiar={setFaltaGasta}
        />

        {politicaFalta === 'block' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Opcion etiqueta="Faltas" ayuda="Cuántas hacen falta." error={errores.no_show_threshold}>
              <TextInput inputMode="numeric" value={faltas} onChange={(e) => setFaltas(e.target.value)} />
            </Opcion>
            <Opcion etiqueta="En cuántos días" ayuda="Se miran las de este periodo." error={errores.no_show_window_days}>
              <TextInput inputMode="numeric" value={ventana} onChange={(e) => setVentana(e.target.value)} />
            </Opcion>
            <Opcion etiqueta="Días sin reservar" ayuda="Cuánto dura el bloqueo." error={errores.no_show_block_days}>
              <TextInput inputMode="numeric" value={bloqueo} onChange={(e) => setBloqueo(e.target.value)} />
            </Opcion>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl text-black dark:text-white">Mora y parrilla</h3>

        <Interruptor
          etiqueta="No dejar reservar al que debe"
          ayuda={AYUDA.bloqueoPorMora}
          activo={mora}
          onCambiar={setMora}
          destacado
        />
        {mora && (
          <Nota>
            Cuántos días de mora se toleran no se configura aquí: lo decide la regla de corte de
            acceso, en <span className="font-bold">Mensajes</span>. Un solo plazo, en un solo sitio.
          </Nota>
        )}

        <Interruptor
          etiqueta="Saltar los festivos"
          ayuda={AYUDA.saltarFestivos}
          activo={festivos}
          onCambiar={setFestivos}
        />
        <Interruptor
          etiqueta="Permitir marcar asistencia sin reserva"
          ayuda={AYUDA.permitirSinReserva}
          activo={sinReserva}
          onCambiar={setSinReserva}
        />
        <Opcion
          etiqueta="Semanas de clases por adelantado"
          ayuda={AYUDA.semanasAdelante}
          error={errores.weeks_ahead}
        >
          <TextInput inputMode="numeric" value={semanas} onChange={(e) => setSemanas(e.target.value)} />
        </Opcion>
      </section>

      {errores._ && <ErrorNote>{errores._}</ErrorNote>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        <Guardado visible={listo && !guardar.isPending} />
      </div>
    </form>
  );
}
