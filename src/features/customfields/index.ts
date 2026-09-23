/**
 * Campos personalizados · punto de entrada del dominio.
 *
 * Lo que hay que saber para enchufarlo:
 *
 *   1. `useCustomFieldDefs(orgId)` trae las definiciones del box.
 *   2. `valoresParaFormulario(defs, athlete.custom, 'normales')` convierte lo
 *      guardado en lo que quieren los `<input>`.
 *   3. `<CamposPersonalizados …/>` los pinta.
 *   4. `validarCampos(defs, valores, 'normales')` devuelve `{ok, valores,
 *      errores}`. `valores` es lo que se guarda en `athletes.custom`.
 *
 * Los campos marcados como SENSIBLES no van en `athletes.custom`: van en
 * `athlete_custom_sensitive`, con `useAthleteSensitiveCustom` y
 * `useSaveAthleteSensitiveCustom`, y con `ambito: 'sensibles'`. La base rechaza
 * mezclarlos, en las dos direcciones. El motivo está en la cabecera de la
 * migración y en docs/07-legal-colombia.md.
 */

export { CamposPersonalizados } from './CamposPersonalizados';
export type { CamposPersonalizadosProps } from './CamposPersonalizados';

export {
  validarCampos, esquemaDeCampo, esquemaDeCampos, valoresParaFormulario,
  textoDelValor, estaVacio,
} from './validacion';
export type { ResultadoCampos } from './validacion';

export { camposDelAmbito, TIPOS_CAMPO, ETIQUETA_TIPO, AYUDA_TIPO, MAXIMO_CAMPOS } from './types';
export type {
  AmbitoCampos, DefinicionCampo, TipoCampo, ValorCampo, ValorCrudo,
  ValoresCampos, ValoresCrudos,
} from './types';

export { useCustomFieldDefs, useAthleteSensitiveCustom } from './queries';
export {
  useSaveFieldDef, useToggleFieldDef, useReorderFieldDefs, useDeleteFieldDef,
  useSaveAthleteSensitiveCustom,
} from './mutations';
