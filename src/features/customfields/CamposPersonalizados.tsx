/**
 * Los campos que el box se inventó, pintados.
 *
 * Componente CONTROLADO y sin estado propio: recibe las definiciones y los
 * valores y avisa de cada cambio. No consulta la base, no sabe de TanStack
 * Query y no valida al escribir — eso es de quien lo enchufa, con
 * `validarCampos()` del mismo dominio. Así sirve igual en el formulario del
 * atleta, en la ficha (modo solo lectura) y en la vista previa de la pantalla
 * de configuración, sin tres copias del mismo código.
 *
 * Cómo se enchufa (ejemplo real, en AthleteForm):
 *
 *     const { data: defs = [] } = useCustomFieldDefs(orgId);
 *     const [extra, setExtra] = useState<ValoresCrudos>(
 *       () => valoresParaFormulario(defs, athlete?.custom, 'normales'));
 *
 *     <CamposPersonalizados
 *       defs={defs}
 *       valores={extra}
 *       onChange={setExtra}
 *       errores={erroresExtra}
 *       ambito="normales"
 *     />
 *
 *     // al guardar:
 *     const r = validarCampos(defs, extra, 'normales');
 *     if (!r.ok) { setErroresExtra(r.errores); return; }
 *     await save({ ...datos, custom: r.valores });
 */

import { Checkbox, Field, Select, TextInput } from '../../shared/ui';
import { camposDelAmbito } from './types';
import { textoDelValor } from './validacion';
import type {
  AmbitoCampos, DefinicionCampo, ValorCampo, ValorCrudo, ValoresCrudos,
} from './types';

export interface CamposPersonalizadosProps {
  /** Definiciones del box, tal como las devuelve `useCustomFieldDefs`. */
  defs: DefinicionCampo[];
  /** Valores actuales por clave. Lo que escribió la gente, sin normalizar. */
  valores: ValoresCrudos;
  /** Se llama con el objeto COMPLETO de valores ya actualizado. */
  onChange: (valores: ValoresCrudos) => void;
  /** Errores por clave, los que devuelve `validarCampos()`. */
  errores?: Record<string, string>;
  /**
   * Qué campos se pintan:
   *   'normales'  -> los que van en `athletes.custom`
   *   'sensibles' -> los que van en `athlete_custom_sensitive`
   *   'todos'     -> ambos (útil solo en la vista previa)
   * Por defecto 'normales': lo sensible se pide aparte, a conciencia.
   */
  ambito?: AmbitoCampos;
  /**
   * false oculta los campos sensibles aunque el ámbito los incluya. Es para
   * decidir QUÉ SE PINTA; a qué se accede lo decide la RLS: un coach sin
   * permiso simplemente no recibe esos valores del servidor.
   */
  puedeVerSensibles?: boolean;
  /** Pinta los valores en vez de los controles (ficha del atleta). */
  soloLectura?: boolean;
  /** Título de la sección. `null` la deja sin encabezado. */
  titulo?: string | null;
  /** Prefijo de los `id` del DOM, por si hay dos instancias en la misma página. */
  idPrefijo?: string;
}

/**
 * Pinta los campos personalizados de un box.
 *
 * Si el box no definió ninguno (o ninguno del ámbito pedido) no pinta NADA:
 * ni el título ni un hueco. Un formulario no puede crecer un espacio vacío
 * solo porque este componente esté enchufado.
 */
export function CamposPersonalizados({
  defs,
  valores,
  onChange,
  errores = {},
  ambito = 'normales',
  puedeVerSensibles = true,
  soloLectura = false,
  titulo = null,
  idPrefijo = 'campo',
}: CamposPersonalizadosProps) {
  const visibles = camposDelAmbito(defs, ambito)
    .filter((d) => puedeVerSensibles || !d.is_sensitive);

  if (visibles.length === 0) return null;

  function set(clave: string, valor: ValorCrudo) {
    onChange({ ...valores, [clave]: valor });
  }

  return (
    <div className="space-y-4">
      {titulo && (
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{titulo}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {visibles.map((def) => (
          <div key={def.id} className={def.field_type === 'multiselect' ? 'sm:col-span-2' : ''}>
            {soloLectura ? (
              <ValorLeido def={def} valor={valores[def.key] as ValorCampo | undefined} />
            ) : (
              <ControlDeCampo
                def={def}
                valor={valores[def.key]}
                error={errores[def.key]}
                idPrefijo={idPrefijo}
                onChange={(v) => set(def.key, v)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Un campo en modo lectura, para la ficha del atleta. */
function ValorLeido({ def, valor }: { def: DefinicionCampo; valor: ValorCampo | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
        {def.label}
        {def.is_sensitive && <SelloSensible />}
      </p>
      <p className="text-sm text-black dark:text-white">{textoDelValor(def, valor)}</p>
    </div>
  );
}

function SelloSensible() {
  return (
    <span
      className="ml-2 border border-primary px-1 text-[9px] font-bold uppercase tracking-widest text-primary"
      title="Dato sensible: no lo ve el atleta ni un coach sin permiso."
    >
      Sensible
    </span>
  );
}

/** El control que corresponde al tipo del campo. */
function ControlDeCampo({
  def, valor, error, onChange, idPrefijo,
}: {
  def: DefinicionCampo;
  valor: ValorCrudo;
  error?: string;
  onChange: (v: ValorCrudo) => void;
  idPrefijo: string;
}) {
  const etiqueta = def.is_required ? `${def.label} *` : def.label;
  const id = `${idPrefijo}-${def.key}`;
  const ayuda = def.help_text ?? undefined;

  // El "Sí / No" no es un <input> con etiqueta encima, así que se pinta aparte.
  if (def.field_type === 'boolean') {
    return (
      <div className="pt-6">
        <Checkbox
          label={etiqueta}
          hint={ayuda}
          checked={valor === true || valor === 'true'}
          onChange={(v) => onChange(v)}
        />
        {error && <p className="mt-1 text-xs font-bold text-primary">{error}</p>}
      </div>
    );
  }

  if (def.field_type === 'multiselect') {
    const marcados = Array.isArray(valor) ? valor : [];
    return (
      <Field label={etiqueta} error={error} hint={ayuda}>
        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          {def.options.map((op) => (
            <Checkbox
              key={op}
              label={op}
              checked={marcados.includes(op)}
              onChange={(activo) =>
                onChange(activo ? [...marcados, op] : marcados.filter((x) => x !== op))
              }
            />
          ))}
        </div>
      </Field>
    );
  }

  if (def.field_type === 'select') {
    return (
      <Field label={etiqueta} error={error} hint={ayuda}>
        <Select id={id} value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => onChange(e.target.value)}>
          <option value="">— Sin elegir —</option>
          {def.options.map((op) => <option key={op} value={op}>{op}</option>)}
        </Select>
      </Field>
    );
  }

  const comun = {
    id,
    value: typeof valor === 'string' || typeof valor === 'number' ? String(valor) : '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
  };

  if (def.field_type === 'date') {
    return (
      <Field label={etiqueta} error={error} hint={ayuda}>
        <TextInput type="date" {...comun} />
      </Field>
    );
  }

  if (def.field_type === 'phone') {
    return (
      <Field
        label={etiqueta}
        error={error}
        hint={ayuda ?? 'Se guarda en formato internacional (+573001234567).'}
      >
        <TextInput type="tel" inputMode="tel" placeholder="300 123 4567" {...comun} />
      </Field>
    );
  }

  if (def.field_type === 'number') {
    return (
      <Field label={etiqueta} error={error} hint={ayuda}>
        <TextInput inputMode="decimal" {...comun} />
      </Field>
    );
  }

  return (
    <Field label={etiqueta} error={error} hint={ayuda}>
      <TextInput {...comun} />
    </Field>
  );
}
