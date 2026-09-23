import { useState } from 'react';
import { Button, ErrorNote, Spinner, TextInput } from '../../shared/ui';
import { useAjustesAutomatizacion } from '../automations/queries';
import { useGuardarAjustes } from '../automations/mutations';
import type { AjustesAutomatizacion } from '../automations/types';
import { mensaje } from './errores';
import { erroresPorCampo, esquemaMensajes } from './esquema';
import { Guardado, Interruptor, Nota, Opcion } from './piezas';
import { AYUDA } from './textos';

/**
 * Los mensajes automáticos.
 *
 * La tabla es `automation_settings` (migración 0011), no una nueva: esta
 * pantalla solo la pone al alcance del dueño. El motor de automatizaciones lee
 * de ahí y lo que se toque aquí tiene efecto en la siguiente corrida, sin que
 * nosotros despleguemos nada.
 *
 * El modo simulación es el interruptor más importante de todo el producto y por
 * eso va arriba, destacado y explicado en dos líneas: encendido, el sistema
 * prepara los mensajes y no los manda. Apagarlo sin entenderlo es escribirle a
 * cien atletas de golpe.
 */
export function SeccionMensajes({
  orgId, onGuardado,
}: {
  orgId: string;
  onGuardado?: () => void;
}) {
  const { data, isLoading, error } = useAjustesAutomatizacion(orgId);

  if (isLoading) return <Spinner label="Cargando los avisos" />;
  if (error) return <ErrorNote>No se pudieron cargar los avisos: {mensaje(error)}</ErrorNote>;

  // Un box dado de alta antes de la migración 0011 puede no tener fila. La
  // base responde con los valores por defecto y el formulario los crea al
  // guardar; pintar un formulario vacío sería mentirle sobre lo que hay puesto.
  const ajustes: AjustesAutomatizacion = data ?? {
    org_id: orgId,
    is_enabled: true,
    simulation_mode: true,
    quiet_start_hour: 8,
    quiet_end_hour: 21,
    max_messages_per_athlete_per_month: 4,
    max_messages_per_athlete_per_day: 1,
    provider: 'wa_me',
    staff_phone: null,
  };

  return <Formulario key={orgId} orgId={orgId} ajustes={ajustes} onGuardado={onGuardado} />;
}

function Formulario({
  orgId, ajustes, onGuardado,
}: {
  orgId: string;
  ajustes: AjustesAutomatizacion;
  onGuardado?: () => void;
}) {
  const guardar = useGuardarAjustes();
  const [encendido, setEncendido] = useState(ajustes.is_enabled);
  const [simulacion, setSimulacion] = useState(ajustes.simulation_mode);
  const [desde, setDesde] = useState(String(ajustes.quiet_start_hour));
  const [hasta, setHasta] = useState(String(ajustes.quiet_end_hour));
  const [mes, setMes] = useState(String(ajustes.max_messages_per_athlete_per_month));
  const [dia, setDia] = useState(String(ajustes.max_messages_per_athlete_per_day));
  const [alertas, setAlertas] = useState(ajustes.staff_phone ?? '');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setListo(false);

    const revisado = esquemaMensajes.safeParse({
      is_enabled: encendido,
      simulation_mode: simulacion,
      quiet_start_hour: desde,
      quiet_end_hour: hasta,
      max_messages_per_athlete_per_month: mes,
      max_messages_per_athlete_per_day: dia,
      staff_phone: alertas,
    });
    if (!revisado.success) {
      setErrores(erroresPorCampo(revisado.error));
      return;
    }

    try {
      await guardar.mutateAsync({ orgId, cambios: revisado.data });
      setAlertas(revisado.data.staff_phone ?? '');
      setListo(true);
      onGuardado?.();
    } catch (err) {
      setErrores({ _: mensaje(err) });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Interruptor
        etiqueta="Modo simulación"
        ayuda={AYUDA.simulacion}
        activo={simulacion}
        onCambiar={setSimulacion}
        destacado
      />

      {!simulacion && (
        <Nota>
          Con la simulación apagada, los mensajes <span className="font-bold">salen de verdad</span>
          {' '}a tus atletas. Revisa antes la bitácora de avisos y mira qué se habría enviado esta
          semana.
        </Nota>
      )}

      <Interruptor
        etiqueta="Avisos automáticos encendidos"
        ayuda={AYUDA.mensajesEncendidos}
        activo={encendido}
        onCambiar={setEncendido}
      />

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Horario para escribir
        </p>
        <p className="mb-3 text-xs leading-relaxed text-gray-500">{AYUDA.horarioSilencioso}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Opcion etiqueta="Desde" ayuda="Hora de tu box." error={errores.quiet_start_hour}>
            <TextInput inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Opcion>
          <Opcion etiqueta="Hasta" ayuda="Hora de tu box." error={errores.quiet_end_hour}>
            <TextInput inputMode="numeric" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Opcion>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Opcion
          etiqueta="Tope al mes por atleta"
          ayuda={AYUDA.topeMensual}
          error={errores.max_messages_per_athlete_per_month}
        >
          <TextInput inputMode="numeric" value={mes} onChange={(e) => setMes(e.target.value)} />
        </Opcion>
        <Opcion
          etiqueta="Tope al día por atleta"
          ayuda={AYUDA.topeDiario}
          error={errores.max_messages_per_athlete_per_day}
        >
          <TextInput inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} />
        </Opcion>
      </div>

      <Opcion
        etiqueta="Teléfono para alertas internas"
        ayuda={AYUDA.telefonoAlertas}
        error={errores.staff_phone}
      >
        <TextInput
          inputMode="tel"
          value={alertas}
          onChange={(e) => setAlertas(e.target.value)}
          placeholder="300 123 4567"
        />
      </Opcion>

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
