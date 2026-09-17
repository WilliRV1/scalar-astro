import { useState } from 'react';
import { Button, Field, Select, TextInput } from '../../shared/ui';
import type { ClassTemplate, Weekday } from './types';
import type { PlantillaForm } from './mutations';
import { DIAS_SEMANA } from './ventanas';

/**
 * Alta y edición de una franja de la parrilla semanal.
 *
 * "Lunes 6:00 a. m., cupo 14" es como piensa el dueño su horario; las clases
 * concretas de las próximas semanas las genera la base a partir de esto,
 * saltándose los festivos colombianos.
 */
export function TemplateEditor({
  plantilla,
  guardando,
  onGuardar,
  onDesactivar,
}: {
  plantilla: ClassTemplate | null;
  guardando: boolean;
  onGuardar: (p: PlantillaForm) => void;
  onDesactivar?: () => void;
}) {
  const [nombre, setNombre] = useState(plantilla?.name ?? 'Entrenamiento funcional');
  const [dia, setDia] = useState<Weekday>(plantilla?.weekday ?? 1);
  const [hora, setHora] = useState((plantilla?.start_time ?? '06:00:00').slice(0, 5));
  const [duracion, setDuracion] = useState(String(plantilla?.duration_min ?? 60));
  const [cupo, setCupo] = useState(String(plantilla?.capacity ?? 14));

  // `Number('')` es 0, así que comprobar solo con Number.isFinite dejaría pasar
  // un campo vacío como "cupo 0". Se valida el patrón antes.
  const cupoNum = /^\d+$/.test(cupo) ? Number(cupo) : NaN;
  const duracionNum = /^\d+$/.test(duracion) ? Number(duracion) : NaN;

  const errorCupo =
    Number.isNaN(cupoNum) || cupoNum < 1 ? 'Escribe cuántas personas caben (mínimo 1).' : undefined;
  const errorDuracion =
    Number.isNaN(duracionNum) || duracionNum < 5 || duracionNum > 480
      ? 'Entre 5 y 480 minutos.'
      : undefined;
  const errorHora = /^\d{2}:\d{2}$/.test(hora) ? undefined : 'Escribe la hora como HH:MM.';
  const valido = !errorCupo && !errorDuracion && !errorHora && nombre.trim().length > 0;

  return (
    <div className="space-y-4">
      <Field label="Nombre de la clase">
        <TextInput
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Entrenamiento funcional"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Día">
          <Select value={dia} onChange={(e) => setDia(Number(e.target.value) as Weekday)}>
            {DIAS_SEMANA.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hora de inicio" error={errorHora}>
          <TextInput type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Duración (min)" error={errorDuracion}>
          <TextInput
            inputMode="numeric"
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
          />
        </Field>
        <Field
          label="Cupo"
          error={errorCupo}
          hint="Cuántas personas caben en esa hora."
        >
          <TextInput inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          disabled={!valido || guardando}
          onClick={() =>
            onGuardar({
              id: plantilla?.id,
              name: nombre.trim(),
              weekday: dia,
              start_time: `${hora}:00`,
              duration_min: duracionNum,
              capacity: cupoNum,
              coach_id: plantilla?.coach_id ?? null,
              is_active: true,
            })
          }
        >
          {guardando ? 'Guardando…' : 'Guardar franja'}
        </Button>
        {plantilla && onDesactivar && (
          <Button variant="ghost" disabled={guardando} onClick={onDesactivar}>
            Quitar del horario
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Quitar una franja no borra las clases ya generadas ni el historial de quién
        entrenó: solo deja de crear nuevas.
      </p>
    </div>
  );
}
