/**
 * Una línea de la lista de asistencia.
 *
 * El área que se toca ocupa toda la fila y mide 64 px de alto: es el tamaño con
 * el que no se falla marcando con el pulgar, de pie, mientras entra la clase.
 */
export function AttendanceRow({
  name,
  hint,
  present,
  disabled,
  onToggle,
}: {
  name: string;
  hint?: string;
  present: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={present}
      className={`flex h-16 w-full items-center gap-3 border-l-4 px-4 text-left transition disabled:opacity-50 ${
        present
          ? 'border-green-500 bg-green-500/10'
          : 'border-transparent bg-black/20 hover:border-primary dark:bg-white/5'
      }`}
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center text-xl ${
          present
            ? 'bg-green-500 text-black'
            : 'border-2 border-gray-600 text-transparent'
        }`}
      >
        ✓
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-black dark:text-white">{name}</span>
        {hint && <span className="block truncate text-xs text-gray-500">{hint}</span>}
      </span>
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-500">
        {present ? 'Vino' : 'Marcar'}
      </span>
    </button>
  );
}
