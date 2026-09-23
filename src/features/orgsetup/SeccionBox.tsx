import { useState } from 'react';
import { Button, ErrorNote, Select, Spinner, TextInput } from '../../shared/ui';
import { formatPhone } from '../../shared/lib/phone';
import { mensaje } from './errores';
import { useBox, useLogo } from './queries';
import { useGuardarDatosBox, useSubirLogo } from './mutations';
import { erroresPorCampo, esquemaDatosBox, type DatosBox } from './esquema';
import { Guardado, Nota, Opcion } from './piezas';
import { AYUDA } from './textos';
import type { Box } from './types';

/**
 * Los datos del box: lo que ven los atletas y lo que decide qué día es "hoy".
 *
 * La zona horaria parece un detalle de configuración y es lo contrario: las
 * fechas de negocio se evalúan en la hora del box, así que si queda mal el
 * cobro del día 5 se genera el 4 a las 7 de la noche y el dueño llama a
 * preguntar por qué le cobraron antes de tiempo.
 */

const ZONAS = [
  { value: 'America/Bogota', label: 'Colombia (Bogotá)' },
  { value: 'America/Lima', label: 'Perú (Lima)' },
  { value: 'America/Guayaquil', label: 'Ecuador (Guayaquil)' },
  { value: 'America/Panama', label: 'Panamá' },
  { value: 'America/Caracas', label: 'Venezuela (Caracas)' },
  { value: 'America/Mexico_City', label: 'México (Ciudad de México)' },
  { value: 'America/Santiago', label: 'Chile (Santiago)' },
];

export function SeccionBox({ orgId, onGuardado }: { orgId: string; onGuardado?: () => void }) {
  const { data: box, isLoading, error } = useBox(orgId);

  if (isLoading) return <Spinner label="Cargando los datos del box" />;
  if (error) {
    return <ErrorNote>No se pudieron cargar los datos del box: {mensaje(error)}</ErrorNote>;
  }
  if (!box) {
    return <ErrorNote>No encontramos tu box. Vuelve a entrar o escríbenos.</ErrorNote>;
  }

  // `key`: cuando llegan los datos el formulario se monta ya con ellos dentro,
  // en vez de montarse vacío y rellenarse desde un efecto.
  return <Formulario key={box.id} orgId={orgId} box={box} onGuardado={onGuardado} />;
}

function Formulario({
  orgId, box, onGuardado,
}: {
  orgId: string;
  box: Box;
  onGuardado?: () => void;
}) {
  const guardar = useGuardarDatosBox();
  const subir = useSubirLogo();
  const [nombre, setNombre] = useState(box.name);
  const [ciudad, setCiudad] = useState(box.city ?? '');
  const [telefono, setTelefono] = useState(box.phone ?? '');
  const [nit, setNit] = useState(box.tax_id ?? '');
  const [zona, setZona] = useState(box.timezone);
  const [color, setColor] = useState(box.brand_color);
  const [logo, setLogo] = useState(box.logo_url ?? '');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState(false);

  const vistaPrevia = useLogo(logo || null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setListo(false);

    const revisado = esquemaDatosBox.safeParse({
      name: nombre,
      city: ciudad,
      phone: telefono,
      tax_id: nit,
      timezone: zona,
      brand_color: color,
      logo_url: logo,
    });
    if (!revisado.success) {
      setErrores(erroresPorCampo(revisado.error));
      return;
    }

    try {
      await guardar.mutateAsync({ orgId, datos: revisado.data satisfies DatosBox });
      // El teléfono se guardó normalizado; que se vea así evita que el dueño
      // crea que no se guardó porque lo escribió de otra forma.
      setTelefono(revisado.data.phone ?? '');
      setListo(true);
      onGuardado?.();
    } catch (err) {
      setErrores({ _: mensaje(err) });
    }
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setErrores({});
    try {
      const ruta = await subir.mutateAsync({ orgId, archivo });
      setLogo(ruta);
    } catch (err) {
      setErrores({ logo_url: `No se pudo subir el logo: ${mensaje(err)}` });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Opcion etiqueta="Nombre del box" ayuda={AYUDA.nombre} error={errores.name}>
        <TextInput value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </Opcion>

      <div className="grid gap-4 sm:grid-cols-2">
        <Opcion etiqueta="Ciudad" ayuda={AYUDA.ciudad} error={errores.city}>
          <TextInput value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Cali" />
        </Opcion>

        <Opcion
          etiqueta="Teléfono"
          ayuda={
            box.phone
              ? `${AYUDA.telefono} Hoy: ${formatPhone(box.phone)}.`
              : AYUDA.telefono
          }
          error={errores.phone}
        >
          <TextInput
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="300 123 4567"
          />
        </Opcion>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Opcion etiqueta="NIT o cédula" ayuda={AYUDA.nit} error={errores.tax_id}>
          <TextInput value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900123456-1" />
        </Opcion>

        <Opcion etiqueta="Zona horaria" ayuda={AYUDA.zonaHoraria} error={errores.timezone}>
          <Select value={zona} onChange={(e) => setZona(e.target.value)}>
            {ZONAS.map((z) => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
          </Select>
        </Opcion>
      </div>

      <Opcion etiqueta="Color de tu box" ayuda={AYUDA.color} error={errores.brand_color}>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#EF4444'}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
            aria-label="Color de tu box"
            className="h-12 w-16 shrink-0 cursor-pointer border border-gray-700 bg-transparent"
          />
          <TextInput
            value={color}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
            placeholder="#EF4444"
          />
        </div>
      </Opcion>

      <Opcion etiqueta="Logo" ayuda={AYUDA.logo} error={errores.logo_url}>
        <div className="flex flex-wrap items-center gap-3">
          {vistaPrevia.data && (
            <img
              src={vistaPrevia.data}
              alt="Logo de tu box"
              className="h-16 w-16 shrink-0 border border-gray-700 object-contain"
            />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onArchivo}
            className="text-xs text-gray-400 file:mr-3 file:border-0 file:bg-primary file:px-3 file:py-2 file:font-display file:text-base file:text-white"
          />
          {subir.isPending && <span className="text-xs text-gray-500">Subiendo…</span>}
          {logo && (
            <button
              type="button"
              onClick={() => setLogo('')}
              className="text-xs font-bold uppercase text-gray-500 hover:text-primary"
            >
              Quitar
            </button>
          )}
        </div>
      </Opcion>

      <Nota>
        La dirección de tu box (<span className="font-bold">{box.slug}.scalar.app</span>) no se
        cambia desde aquí: es el enlace que ya tienen tus atletas. Si de verdad la necesitas
        distinta, escríbenos y la cambiamos avisándoles.
      </Nota>

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
