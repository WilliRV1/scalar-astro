import { useState } from 'react';
import {
  Button, Checkbox, Drawer, ErrorNote, Field, Select, TextInput,
} from '../../shared/ui';
import { formatPhone } from '../../shared/lib/phone';
import {
  CamposPersonalizados, useCustomFieldDefs, validarCampos, valoresParaFormulario,
  type ValoresCrudos,
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

export function AthleteForm({
  orgId, athlete, open, onClose,
}: {
  orgId: string;
  athlete: Athlete | null;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSaveAthlete();
  const archive = useArchiveAthlete();

  const [campos, setCampos] = useState<Campos>(() => inicial(athlete));

  // Los campos que definió ESTE box. Si no definió ninguno, el componente no
  // pinta nada: la ficha se ve igual que antes.
  const { data: defs = [] } = useCustomFieldDefs(orgId);
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
      setErrorGeneral(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  return (
    <Drawer
      open={open}
      title={athlete ? 'Editar atleta' : 'Nuevo atleta'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-atleta" disabled={save.isPending} className="flex-1">
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-atleta" onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" error={errores.first_name}>
            <TextInput value={campos.first_name} onChange={(e) => set('first_name', e.target.value)} autoFocus />
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
            <TextInput value={campos.document_id} onChange={(e) => set('document_id', e.target.value)} />
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
            onClick={async () => {
              if (!confirm(`¿Marcar a ${athlete.first_name} como retirado? Su historial se conserva.`)) return;
              await archive.mutateAsync({ orgId, athleteId: athlete.id });
              onClose();
            }}
            className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
          >
            Marcar como retirado
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
    document_id: '',
    birth_date: a?.birth_date ?? '',
    status: a?.status ?? 'active',
    joined_on: a?.joined_on ?? new Date().toISOString().slice(0, 10),
    referral_source: a?.referral_source ?? '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  };
}
