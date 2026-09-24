import { useState } from 'react';
import type { ReactNode } from 'react';
import { mensajeAmigable } from '../../shared/lib/errores';
import { Field, Select, TextInput } from '../../shared/ui';

const NUEVO = '__nuevo__';

/**
 * Select con alta al vuelo.
 *
 * Un box recién creado no tiene ni categorías ni proveedores. Mandarlo a otra
 * pantalla a crearlos antes de poder registrar el primer gasto es la forma más
 * rápida de que nunca registre el primer gasto.
 */
export function SelectorConAlta({
  label, hint, value, options, vacio, textoNuevo, creando, error, onChange, onCreate, children,
}: {
  label: string;
  hint?: string;
  value: string;
  options: { id: string; name: string }[];
  /** Texto de la opción "ninguno". Si se omite, el campo es obligatorio. */
  vacio?: string;
  textoNuevo: string;
  creando: boolean;
  /** Error de la mutación de alta, por si el padre quiere pintarlo aquí. */
  error?: unknown;
  onChange: (id: string) => void;
  onCreate: (nombre: string) => Promise<string>;
  /** Campos extra del alta (por ejemplo el tipo de la categoría). */
  children?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [errorLocal, setErrorLocal] = useState('');

  async function crear() {
    const limpio = nombre.trim();
    if (!limpio) return;
    setErrorLocal('');
    try {
      const id = await onCreate(limpio);
      onChange(id);
      setNombre('');
      setAbierto(false);
    } catch (err) {
      // Se queda abierto con el nombre escrito: la persona corrige y reintenta.
      setErrorLocal(mensajeAmigable(err));
    }
  }

  const mensajeError = errorLocal || (error ? mensajeAmigable(error) : '');

  return (
    <div className="space-y-2">
      <Field label={label} hint={hint}>
        <Select
          value={abierto ? NUEVO : value}
          onChange={(e) => {
            if (e.target.value === NUEVO) return setAbierto(true);
            setAbierto(false);
            onChange(e.target.value);
          }}
        >
          {vacio !== undefined && <option value="">{vacio}</option>}
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value={NUEVO}>{textoNuevo}</option>
        </Select>
      </Field>

      {abierto && (
        <div className="space-y-2 border-l-2 border-primary/40 pl-4">
          <TextInput
            value={nombre}
            placeholder="Nombre"
            onChange={(e) => setNombre(e.target.value)}
            // Enter dentro de un formulario lo enviaría: aquí crea, que es lo
            // que la persona espera al estar escribiendo en este campo.
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crear(); } }}
          />
          {children}
          {mensajeError && (
            <p role="alert" className="text-xs font-bold text-primary">{mensajeError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void crear()}
              disabled={creando || !nombre.trim()}
              className="min-h-11 bg-primary px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white disabled:opacity-40"
            >
              {creando ? 'Creando…' : 'Crear'}
            </button>
            <button
              type="button"
              onClick={() => { setAbierto(false); setNombre(''); setErrorLocal(''); }}
              className="min-h-11 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
