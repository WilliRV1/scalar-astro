export { AutorizarDebito } from './AutorizarDebito';
export { DebitoActivo } from './DebitoActivo';
export { CobrosAutomaticos } from './CobrosAutomaticos';
export { useMiDebito, useMisCobrosAutomaticos, usePreparacionDeAutorizacion } from './queries';
export {
  useConfirmarNequi,
  useIniciarNequi,
  usePagarAMano,
  useRevocarAutorizacion,
} from './mutations';
export { describirMetodo, etiquetaDelEstado, explicarFallo, fechaCorta, fechaLarga } from './textos';
export type {
  AutorizacionDeDebito,
  CausaDelFallo,
  CobroAutomatico,
  EstadoDelCobro,
  EstadoDelMetodo,
  MetodoDePago,
  TipoDeMetodo,
} from './types';
