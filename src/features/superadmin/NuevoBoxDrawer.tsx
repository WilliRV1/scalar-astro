import { useState } from 'react';
import { Button, Drawer, ErrorNote, Field, Select, TextInput } from '../../shared/ui';
import { formatCents } from '../../shared/lib/money';
import { useCrearBox } from './mutations';
import {
  CORREO,
  ENTRADA_FUNDADOR_CENTAVOS,
  IMPLEMENTACION_CENTAVOS,
  PRECIO_CENTAVOS,
  PRECIO_FUNDADOR_CENTAVOS,
  dominioDelBox,
  enlaceDePropiedad,
  problemaDelSlug,
  slugSugerido,
} from './altas';
import { ETIQUETA_PLAN, type AltaDeBox, type TramoDePlan } from './types';

const PLANES: TramoDePlan[] = ['trial', 'starter', 'box', 'pro', 'chain'];

/**
 * Alta de un box nuevo.
 *
 * Es la primera mitad del onboarding de 48 horas (docs/05 § "Cómo vender" y el
 * runbook en docs/11). Lo que pasa acá adentro es una sola transacción en la
 * base: si algo falla, no queda un box a medio crear.
 */
export function NuevoBoxDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const crear = useCrearBox();

  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);
  const [correo, setCorreo] = useState('');
  const [plan, setPlan] = useState<TramoDePlan>('box');
  const [ciudad, setCiudad] = useState('Cali');
  const [telefono, setTelefono] = useState('');
  const [esFundador, setEsFundador] = useState(false);
  const [errorServidor, setErrorServidor] = useState('');
  const [creado, setCreado] = useState<AltaDeBox | null>(null);

  const slugEfectivo = slugTocado ? slug : slugSugerido(nombre);
  const problemaSlug = slugEfectivo ? problemaDelSlug(slugEfectivo) : null;
  const correoMal = correo.trim() !== '' && !CORREO.test(correo.trim());

  const mensual = esFundador ? PRECIO_FUNDADOR_CENTAVOS : PRECIO_CENTAVOS[plan];
  const entrada =
    plan === 'trial' ? 0 : esFundador ? ENTRADA_FUNDADOR_CENTAVOS : IMPLEMENTACION_CENTAVOS;

  function limpiar() {
    setNombre('');
    setSlug('');
    setSlugTocado(false);
    setCorreo('');
    setPlan('box');
    setCiudad('Cali');
    setTelefono('');
    setEsFundador(false);
    setErrorServidor('');
    setCreado(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorServidor('');
    if (problemaSlug || !nombre.trim() || !CORREO.test(correo.trim())) return;

    try {
      const alta = await crear.mutateAsync({
        slug: slugEfectivo,
        nombre,
        correoDelDueno: correo,
        plan,
        ciudad,
        telefono,
        esFundador,
      });
      setCreado(alta);
    } catch (err) {
      // El mensaje del servidor se muestra tal cual: "Ya existe un box con el
      // slug X" explica el problema mejor que cualquier genérico nuestro.
      setErrorServidor(err instanceof Error ? err.message : 'No se pudo crear el box');
    }
  }

  return (
    <Drawer
      open={open}
      title={creado ? 'Box creado' : 'Dar de alta un box'}
      onClose={() => {
        limpiar();
        onClose();
      }}
      footer={
        creado ? (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              limpiar();
              onClose();
            }}
          >
            Listo
          </Button>
        ) : (
          <Button type="submit" form="form-nuevo-box" disabled={crear.isPending} className="w-full">
            {crear.isPending ? 'Creando…' : 'Crear el box'}
          </Button>
        )
      }
    >
      {creado ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            <span className="font-bold text-white">{nombre}</span> quedó creado en{' '}
            <span className="font-mono text-gray-300">{dominioDelBox(creado.slug)}</span>, con sus
            planes por defecto sembrados.
          </p>

          {creado.invite_token ? (
            <div className="space-y-2">
              <div className="grunge-border bg-black/40 p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  Enlace para el dueño
                </p>
                <p className="select-all break-all font-mono text-xs text-gray-300">
                  {enlaceDePropiedad(creado.invite_token)}
                </p>
              </div>
              <p className="border-l-4 border-gray-700 bg-black/20 px-3 py-2 text-xs text-gray-500">
                Mándaselo por WhatsApp. Solo sirve para{' '}
                <span className="text-gray-400">{correo.trim().toLowerCase()}</span> y vence en 30
                días.
              </p>
            </div>
          ) : (
            <p className="border-l-4 border-emerald-600 bg-emerald-600/10 px-3 py-2 text-xs text-emerald-300">
              Ese correo ya tenía cuenta: quedó como dueño del box de una vez, sin enlace que
              mandar.
            </p>
          )}

          <p className="text-xs text-gray-500">
            Sigue el runbook de <span className="text-gray-400">docs/11-operacion.md</span>: migrar
            el Excel, fechas de corte, plantillas de WhatsApp y capacitación.
          </p>
        </div>
      ) : (
        <form id="form-nuevo-box" onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <Field label="Nombre del box" hint="Como lo dice el dueño, con tildes y todo.">
            <TextInput
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Box Rubio"
              autoFocus
              required
            />
          </Field>

          <Field
            label="Slug (subdominio)"
            error={problemaSlug ?? undefined}
            hint={`El box va a vivir en ${dominioDelBox(slugEfectivo)}`}
          >
            <TextInput
              value={slugEfectivo}
              onChange={(e) => {
                setSlugTocado(true);
                setSlug(e.target.value.toLowerCase());
              }}
              placeholder="box-rubio"
            />
          </Field>

          <Field
            label="Correo del dueño"
            error={correoMal ? 'Escribe un correo válido: con ese entra a su box.' : undefined}
            hint="Si ya tiene cuenta queda como dueño de una vez; si no, se genera un enlace."
          >
            <TextInput
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="dueno@boxrubio.co"
              required
            />
          </Field>

          <Field label="Plan">
            <Select value={plan} onChange={(e) => setPlan(e.target.value as TramoDePlan)}>
              {PLANES.map((p) => (
                <option key={p} value={p}>
                  {ETIQUETA_PLAN[p]}
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={esFundador}
              onChange={(e) => setEsFundador(e.target.checked)}
              className="mt-0.5 h-5 w-5 accent-[#FF0000]"
            />
            <span>
              <span className="block text-sm font-bold text-black dark:text-white">
                Precio de fundador
              </span>
              <span className="block text-xs text-gray-500">
                Solo para los primeros 3–5 boxes, y solo con contrato: testimonio, caso de estudio
                y dos referidos. Vence a los 12 meses.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ciudad">
              <TextInput value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
            </Field>
            <Field label="Teléfono" hint="Con indicativo: +57…">
              <TextInput
                type="tel"
                inputMode="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+573001234567"
              />
            </Field>
          </div>

          <div className="grunge-border bg-black/40 p-3 text-sm">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">
              Lo que se le va a cobrar
            </p>
            <p className="text-gray-300">
              {formatCents(mensual)} al mes
              {entrada > 0 && (
                <>
                  {' '}
                  · {formatCents(entrada)}{' '}
                  {esFundador ? 'de entrada' : 'de implementación (una vez)'}
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              La implementación incluye migrar el Excel, cargar atletas y marcas, dejar las
              plantillas escritas y capacitar al equipo.
            </p>
          </div>

          {errorServidor && <ErrorNote>{errorServidor}</ErrorNote>}
        </form>
      )}
    </Drawer>
  );
}
