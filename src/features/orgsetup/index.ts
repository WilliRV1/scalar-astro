/**
 * Configuración del box: lo que hasta hoy había que pedirnos.
 *
 * Todo lo que un cliente nuevo necesitaba que un desarrollador le metiera a
 * mano —sus datos, sus precios, su día de corte, sus avisos y sus llaves de
 * cobro— vive aquí y lo edita él.
 */

export { SeccionBox } from './SeccionBox';
export { SeccionCobros } from './SeccionCobros';
export { SeccionMensajes } from './SeccionMensajes';
export { SeccionReservas } from './SeccionReservas';
export { SeccionIntegraciones } from './SeccionIntegraciones';
export { SeccionPlanes } from './SeccionPlanes';
export { SeccionAtletas } from './SeccionAtletas';
export { BarraProgreso, Guardado, Interruptor, Nota, Opcion } from './piezas';

export { useBox, useCredenciales, useLogo, useOnboarding } from './queries';
export {
  useBorrarCredencial,
  useDesactivarPlan,
  useGuardarAjustesBox,
  useGuardarAjustesReserva,
  useGuardarCredencial,
  useGuardarDatosBox,
  useMarcarPaso,
  useSubirLogo,
} from './mutations';

export { PASOS } from './types';
export type {
  AjustesBox,
  Ambiente,
  AvanceOnboarding,
  Box,
  ClaveCredencial,
  Credencial,
  EstadoPaso,
  Pasarela,
  Paso,
  PasoActual,
} from './types';

export { AYUDA, CREDENCIALES, RESUMEN_PASO, TITULO_PASO } from './textos';
