/**
 * Panel de plataforma (interno).
 *
 * Esto es para nosotros, no para el cliente: alta de boxes, estado de cada
 * suscripción, métricas del negocio y suplantación con bitácora. Prioriza la
 * información sobre la belleza.
 *
 * Lo importante de este módulo es lo que NO hace: ninguna consulta lee las
 * tablas de los boxes. Todo pasa por funciones de plataforma que devuelven
 * agregados. El aislamiento entre boxes no se toca ni para dar soporte.
 */
export { useEsSuperadmin, useMetricasDePlataforma, useBoxesDePlataforma, useDetalleDeBox } from './queries';
export { useCrearBox, useSuspenderBox, useReactivarBox, useSuplantar, useCerrarSuplantacion } from './mutations';
export { NuevoBoxDrawer } from './NuevoBoxDrawer';
export { SoporteDrawer } from './SoporteDrawer';
export { SuspenderDrawer } from './SuspenderDrawer';
export { ReclamarPropiedad } from './ReclamarPropiedad';
export { dominioDelBox, enlaceDePropiedad, problemaDelSlug, slugSugerido } from './altas';
export { ETIQUETA_ESTADO, ETIQUETA_PLAN, colorDeEstado } from './types';
export type {
  BoxDePlataforma, MetricasDePlataforma, AltaDeBox, SesionDeSoporte, DetalleDeBox,
  EstadoDeBox, TramoDePlan, EstadoDeSuscripcion,
} from './types';
