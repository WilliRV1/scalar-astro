import { useState } from 'react';
import {
  Button, Checkbox, Drawer, ErrorNote, Field, Select, Spinner, TextInput,
} from '../../shared/ui';
import { formatPhone } from '../../shared/lib/phone';
import { mensajeAmigable } from '../../shared/lib/errores';
import {
  CamposPersonalizados, useCustomFieldDefs, validarCampos, valoresParaFormulario,
  type DefinicionCampo, type ValoresCrudos,
} from '../customfields';
import { athleteSchema, ATHLETE_STATUSES } from './schema';
import { useArchiveAthlete, useSaveAthlete } from './mutations';
import type { Athlete } from '../../types/database';

const ETIQUETA_ESTADO: Record<(typeof ATHLETE_STATUSES)[number], string> = {
  lead: 'Prospecto',
  trial: 'En prueba',
  active: 'Activo',
  frozen: 'Congelado',
  overdue: 'En mora',
  churned: 'Retirado',
};

type Campos = Record<string, string>;

interface Props {
  orgId: string;
  athlete: Athlete | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Ficha del atleta.
 *
 * El formulario NO se monta hasta que llegan las definiciones de los campos
 * del box: los valores personalizados se inicializan una sola vez a partir de
 * ellas, y montarlo con la lista vacía hacía que la primera edición de la
 * sesión guardara `custom` en blanco y borrara lo que el box había escrito.
 */
export function AthleteForm({ orgId, athlete, open, onClose }: Props) {
  const defs = useCustomFieldDefs(orgId);

  if (defs.isPending) {
    return (
      <Drawer open={open} title={athlete ? 'Editar atleta' : 'Nuevo atleta'} onClose={onClose}>
        <Spinner label="Cargando la ficha" />
      </Drawer>
    );
  }

  if (defs.isError) {
    return (
      <Drawer open={open} title={athlete ? 'Editar atleta' : 'Nuevo atleta'} onClose={onClose}>
        <ErrorNote>
          No se pudieron cargar los campos del box: {mensajeAmigable(defs.error)}
        </ErrorNote>
      </Drawer>
    );
  }

  return (
    <FormularioAtleta
      orgId={orgId}
      athlete={athlete}
      open={open}
      onClose={onClose}
      defs={defs.data}
    />
  );
}

function FormularioAtleta({
  orgId, athlete, open, onClose, defs,
}: Props & { defs: DefinicionCampo[] }) {
  const save = useSaveAthlete();
  const archive = useArchiveAthlete();

  const [campos, setCampos] = useState<Campos>(() => inicial(athlete));

  // Los campos que definió ESTE box. Si no definió ninguno, el componente no
  // pinta nada: la ficha se ve igual que antes.
  const [extra, setExtra] = useState<ValoresCrudos>(() =>
    valoresParaFormulario(defs, athlete?.custom, 'normales'),
  );
  const [erroresExtra, setErroresExtra] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(Boolean(athlete?.consent_whatsapp_at));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState('');

  function set(k: string, v: string) {
    setCampos((c) => ({ ...c, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setErroresExtra({});
    setErrorGeneral('');

    // Los campos del box se validan con la MISMA función que usa el importador,
    // para que lo que se puede guardar a mano y lo que entra por Excel sean lo
    // mismo. La base vuelve a validarlo: esto es solo para dar buenos mensajes.
    const propios = validarCampos(defs, extra, 'normales');
    if (!propios.ok) {
      setErroresExtra(propios.errores);
      return;
    }

    const parsed = athleteSchema.safeParse({ ...campos, consent_whatsapp: consent });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const campo = String(issue.path[0] ?? 'general');
        errs[campo] = issue.message;
      }
      setErrores(errs);
      return;
    }

    try {
      await save.mutateAsync({
        orgId,
        athleteId: athlete?.id,
        input: parsed.data,
        custom: propios.valores,
      });
      onClose();
    } catch (err) {
      setErrorGeneral(mensajeAmigable(err));
    }
  }

  async function retirar() {
    if (!athlete) return;
    if (!confirm(`¿Marcar a ${athlete.first_name} como retirado? Su historial se conserva.`)) return;
    setErrorGeneral('');
    try {
      await archive.mutateAsync({ orgId, athleteId: athlete.id });
      onClose();
    } catch (err) {
      setErrorGeneral(`No se pudo marcar como retirado: ${mensajeAmigable(err)}`);
    }
  }

  const ocupado = save.isPending || archive.isPending;

  return (
    <Drawer
      open={open}
      title={athlete ? 'Editar atleta' : 'Nuevo atleta'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-atleta" disabled={ocupado} className="flex-1">
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-atleta" onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" error={errores.first_name}>
            <TextInput value={campos.first_name} onChange={(e) => set('first_name', e.target.value)} />
          </Field>
          <Field label="Apellido" error={errores.last_name}>
            <TextInput value={campos.last_name} onChange={(e) => set('last_name', e.target.value)} />
          </Field>
        </div>

        <Field
          label="Celular"
          error={errores.phone}
          hint={
            campos.phone
              ? `Se guardará como ${formatPhone(campos.phone.startsWith('+') ? campos.phone : null) !== '—' ? campos.phone : 'formato colombiano'}`
              : 'Sin celular no hay recordatorio de pago ni acceso del atleta'
          }
        >
          <TextInput
            type="tel"
            inputMode="tel"
            placeholder="300 123 4567"
            value={campos.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Correo" error={errores.email}>
            <TextInput type="email" value={campos.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Documento" error={errores.document_id}>
            <TextInput
              inputMode="numeric"
              autoComplete="off"
              value={campos.document_id}
              onChange={(e) => set('document_id', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Estado" error={errores.status}>
            <Select value={campos.status} onChange={(e) => set('status', e.target.value)}>
              {ATHLETE_STATUSES.map((s) => (
                <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ingresó el" error={errores.joined_on}>
            <TextInput type="date" value={campos.joined_on} onChange={(e) => set('joined_on', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nacimiento" error={errores.birth_date}>
            <TextInput type="date" value={campos.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
          </Field>
          <Field label="Cómo llegó" error={errores.referral_source} hint="Instagram, referido…">
            <TextInput value={campos.referral_source} onChange={(e) => set('referral_source', e.target.value)} />
          </Field>
        </div>

        <fieldset className="grunge-border space-y-3 p-3">
          <legend className="px-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Contacto de emergencia
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" error={errores.emergency_contact_name}>
              <TextInput
                value={campos.emergency_contact_name}
                onChange={(e) => set('emergency_contact_name', e.target.value)}
              />
            </Field>
            <Field label="Celular" error={errores.emergency_contact_phone}>
              <TextInput
                type="tel"
                inputMode="tel"
                placeholder="300 123 4567"
                value={campos.emergency_contact_phone}
                onChange={(e) => set('emergency_contact_phone', e.target.value)}
              />
            </Field>
          </div>
        </fieldset>

        <CamposPersonalizados
          defs={defs}
          valores={extra}
          onChange={setExtra}
          errores={erroresExtra}
          ambito="normales"
          titulo="Datos de tu box"
        />

        <Checkbox
          label="Autoriza recibir mensajes por WhatsApp"
          checked={consent}
          onChange={setConsent}
          hint="Queda registrada la fecha. Lo exige Meta y la ley de datos personales."
        />

        {errorGeneral && <ErrorNote>{errorGeneral}</ErrorNote>}

        {athlete && athlete.status !== 'churned' && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void retirar()}
            className="min-h-11 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary disabled:opacity-50"
          >
            {archive.isPending ? 'Marcando…' : 'Marcar como retirado'}
          </button>
        )}
      </form>
    </Drawer>
  );
}

function inicial(a: Athlete | null): Campos {
  return {
    first_name: a?.first_name ?? '',
    last_name: a?.last_name ?? '',
    phone: a?.phone ?? '',
    email: a?.email ?? '',
    document_id: a?.document_id ?? '',
    birth_date: a?.birth_date ?? '',
    status: a?.status ?? 'active',
    joined_on: a?.joined_on ?? new Date().toISOString().slice(0, 10),
    referral_source: a?.referral_source ?? '',
    emergency_contact_name: a?.emergency_contact_name ?? '',
    emergency_contact_phone: a?.emergency_contact_phone ?? '',
  };
}
