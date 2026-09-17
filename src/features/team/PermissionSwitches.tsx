import { Checkbox } from '../../shared/ui';
import type { Permissions } from '../../types/database';
import {
  ETIQUETA_ROL, PERMISOS_FINOS, rolConTodoIncluido,
} from './permissions';
import type { InvitationRole, StaffRole } from './types';

/**
 * Los interruptores de permisos finos.
 *
 * El texto de ayuda del primero no es decorativo: el caso más común de un box
 * pequeño es que el dueño sea también el coach, y la forma de resolverlo es
 * `coach` + este permiso, no un rol nuevo. Si no se explica ahí mismo, el box
 * llama a soporte a preguntar por qué su coach no ve los cobros.
 */
export function PermissionSwitches({
  role, permissions, onChange,
}: {
  role: StaffRole | InvitationRole;
  permissions: Permissions;
  onChange: (p: Permissions) => void;
}) {
  if (rolConTodoIncluido(role)) {
    return (
      <p className="grunge-border bg-black/20 p-3 text-xs text-gray-500">
        El {ETIQUETA_ROL[role].toLowerCase()} ya ve y gestiona todo el box —incluida la
        plata—, así que estos permisos no le suman nada.
      </p>
    );
  }

  function alternar(key: keyof Permissions, valor: boolean) {
    const siguiente: Permissions = { ...permissions };
    // Un permiso que no se concede se quita del jsonb en vez de guardarse en
    // `false`: así la fila dice solo lo que este coach SÍ puede hacer.
    if (valor) siguiente[key] = true;
    else delete siguiente[key];
    onChange(siguiente);
  }

  return (
    <fieldset className="grunge-border space-y-3 p-3">
      <legend className="px-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
        Permisos del coach
      </legend>
      {PERMISOS_FINOS.map((p) => (
        <Checkbox
          key={p.key}
          label={p.label}
          hint={p.hint}
          checked={permissions?.[p.key] === true}
          onChange={(v) => alternar(p.key, v)}
        />
      ))}
    </fieldset>
  );
}
