import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import { formatCents } from '../../shared/lib/money';
import { normalizarEncabezado } from './parse';
import type { FilaNormalizada } from './parse';
import type { AthleteStatus, Movement, Plan, SubscriptionStatus } from '../../types/database';

/**
 * Ejecución de la importación.
 *
 * Tres reglas, aprendidas de migrar boxes a mano:
 *  1. Se inserta por lotes. Una petición por fila convierte una migración de
 *     300 atletas en cinco minutos de pantalla congelada.
 *  2. Una fila mala no bota el archivo. Si un lote falla, se reintenta fila por
 *     fila y solo se reporta la que de verdad no entró.
 *  3. Lo que no entró se dice, con nombre y número de fila, para poder
 *     arreglarlo en el Excel y volver a subirlo.
 */

const TAMANIO_LOTE = 50;

export type EtapaImportacion = 'atletas' | 'planes' | 'suscripciones' | 'marcas' | 'listo';

export interface ProgresoImportacion {
  etapa: EtapaImportacion;
  procesadas: number;
  total: number;
}

export interface FilaFallida {
  indice: number;
  nombre: string;
  etapa: EtapaImportacion;
  motivo: string;
}

export interface ResumenImportacion {
  atletas: number;
  suscripciones: number;
  marcas: number;
  planesCreados: number;
  fallidas: FilaFallida[];
}

export interface ArgsImportacion {
  orgId: string;
  /** Filas ya filtradas: sin errores y sin las que el coach decidió omitir. */
  filas: FilaNormalizada[];
  movimientos: Movement[];
  planes: Plan[];
  hoy?: string;
  onProgress?: (p: ProgresoImportacion) => void;
}

export function hoyISO(fecha = new Date()): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function enLotes<T>(items: T[], tamanio = TAMANIO_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamanio) lotes.push(items.slice(i, i + tamanio));
  return lotes;
}

function mensajeDeError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** La suscripción arranca en el mismo estado en el que viene el atleta. */
function estadoSuscripcion(estado: AthleteStatus): SubscriptionStatus {
  if (estado === 'overdue') return 'overdue';
  if (estado === 'frozen') return 'paused';
  if (estado === 'churned') return 'cancelled';
  return 'active';
}

interface FilaAtleta {
  org_id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  document_id: string | null;
  birth_date: string | null;
  status: AthleteStatus;
  referral_source: string | null;
  joined_on: string;
  // Importar una lista NO es un consentimiento de la persona (Ley 1581): el
  // atleta autoriza el WhatsApp después, desde su enlace.
  consent_whatsapp_at: null;
}

function filaAAtleta(orgId: string, fila: FilaNormalizada, hoy: string): FilaAtleta {
  const a = fila.atleta!;
  return {
    org_id: orgId,
    first_name: a.first_name,
    last_name: a.last_name,
    phone: a.phone,
    email: a.email,
    document_id: a.document_id,
    birth_date: a.birth_date,
    status: a.status,
    referral_source: a.referral_source,
    joined_on: a.joined_on || hoy,
    consent_whatsapp_at: null,
  };
}

function clavePlan(nombre: string | null, precioCents: number): string {
  return `${normalizarEncabezado(nombre ?? '')}|${precioCents}`;
}

/**
 * Los planes que hacen falta para las suscripciones del archivo. Si ya existe
 * uno con ese precio (y ese nombre, cuando el archivo lo trae) se reutiliza:
 * nadie quiere terminar la migración con ocho planes llamados "Mensualidad".
 */
async function asegurarPlanes(
  orgId: string,
  filas: FilaNormalizada[],
  planes: Plan[],
): Promise<{ porClave: Map<string, string>; creados: number }> {
  const porClave = new Map<string, string>();
  const necesarios = new Map<string, { nombre: string | null; precio: number }>();

  for (const fila of filas) {
    if (!fila.suscripcion) continue;
    const { plan_name, price_cents } = fila.suscripcion;
    const clave = clavePlan(plan_name, price_cents);
    if (!necesarios.has(clave)) necesarios.set(clave, { nombre: plan_name, precio: price_cents });
  }

  const porCrear: Array<{ org_id: string; name: string; price_cents: number; billing_period: string }> = [];
  const clavesPorCrear: string[] = [];

  for (const [clave, { nombre, precio }] of necesarios) {
    const existente = planes.find(
      (p) => p.price_cents === precio
        && (nombre === null || normalizarEncabezado(p.name) === normalizarEncabezado(nombre)),
    );
    if (existente) {
      porClave.set(clave, existente.id);
      continue;
    }
    porCrear.push({
      org_id: orgId,
      name: nombre ?? `Mensualidad ${formatCents(precio)}`,
      price_cents: precio,
      billing_period: 'monthly',
    });
    clavesPorCrear.push(clave);
  }

  if (porCrear.length > 0) {
    const { data, error } = await supabase.from('plans').insert(porCrear).select('id');
    if (error) throw error;
    const creados = (data ?? []) as Array<{ id: string }>;
    creados.forEach((plan, i) => porClave.set(clavesPorCrear[i], plan.id));
  }

  return { porClave, creados: porCrear.length };
}

/**
 * Inserta un lote y, si el lote falla, lo reintenta fila por fila. Devuelve los
 * ids en el mismo orden en que se mandaron las filas (null donde falló).
 */
async function insertarLote<T extends object>(
  tabla: 'athletes' | 'subscriptions' | 'personal_records',
  registros: T[],
): Promise<Array<{ id: string } | { error: string }>> {
  const { data, error } = await supabase.from(tabla).insert(registros).select('id');
  const insertados = (data ?? []) as Array<{ id: string }>;

  if (!error && insertados.length === registros.length) return insertados;

  const resultados: Array<{ id: string } | { error: string }> = [];
  for (const registro of registros) {
    const uno = await supabase.from(tabla).insert(registro).select('id').single();
    if (uno.error) resultados.push({ error: mensajeDeError(uno.error) });
    else resultados.push(uno.data as { id: string });
  }
  return resultados;
}

export async function ejecutarImportacion(args: ArgsImportacion): Promise<ResumenImportacion> {
  const { orgId, movimientos, planes, onProgress } = args;
  const hoy = args.hoy ?? hoyISO();
  const filas = args.filas.filter((f) => f.estado !== 'error' && f.atleta !== null);

  const resumen: ResumenImportacion = {
    atletas: 0, suscripciones: 0, marcas: 0, planesCreados: 0, fallidas: [],
  };

  const totalUnidades =
    filas.length
    + filas.filter((f) => f.suscripcion).length
    + filas.reduce((n, f) => n + f.marcas.length, 0);
  let procesadas = 0;
  const avisar = (etapa: EtapaImportacion) =>
    onProgress?.({ etapa, procesadas, total: Math.max(totalUnidades, 1) });

  avisar('atletas');

  // --- 1 · Atletas --------------------------------------------------------
  const idPorFila = new Map<number, string>();

  for (const lote of enLotes(filas)) {
    const resultados = await insertarLote('athletes', lote.map((f) => filaAAtleta(orgId, f, hoy)));
    resultados.forEach((r, i) => {
      const fila = lote[i];
      if ('id' in r) {
        idPorFila.set(fila.indice, r.id);
        resumen.atletas += 1;
      } else {
        resumen.fallidas.push({
          indice: fila.indice, nombre: fila.nombreCrudo, etapa: 'atletas', motivo: r.error,
        });
      }
    });
    procesadas += lote.length;
    avisar('atletas');
  }

  const importados = filas.filter((f) => idPorFila.has(f.indice));

  // --- 2 · Planes y suscripciones ----------------------------------------
  const conSuscripcion = importados.filter((f) => f.suscripcion !== null);

  if (conSuscripcion.length > 0) {
    avisar('planes');
    try {
      const { porClave, creados } = await asegurarPlanes(orgId, conSuscripcion, planes);
      resumen.planesCreados = creados;

      avisar('suscripciones');
      for (const lote of enLotes(conSuscripcion)) {
        const registros = lote.map((f) => ({
          org_id: orgId,
          athlete_id: idPorFila.get(f.indice)!,
          plan_id: porClave.get(clavePlan(f.suscripcion!.plan_name, f.suscripcion!.price_cents))!,
          price_cents: f.suscripcion!.price_cents,
          billing_day: f.suscripcion!.billing_day,
          started_on: hoy,
          status: estadoSuscripcion(f.atleta!.status),
        }));
        const resultados = await insertarLote('subscriptions', registros);
        resultados.forEach((r, i) => {
          if ('id' in r) resumen.suscripciones += 1;
          else {
            resumen.fallidas.push({
              indice: lote[i].indice, nombre: lote[i].nombreCrudo,
              etapa: 'suscripciones', motivo: r.error,
            });
          }
        });
        procesadas += lote.length;
        avisar('suscripciones');
      }
    } catch (err) {
      // Sin planes no hay suscripciones, pero los atletas ya entraron: se
      // reporta y se sigue con las marcas.
      resumen.fallidas.push({
        indice: 0, nombre: 'Planes y suscripciones', etapa: 'planes', motivo: mensajeDeError(err),
      });
      procesadas += conSuscripcion.length;
    }
  }

  // --- 3 · Marcas ---------------------------------------------------------
  const movimientoPorClave = new Map<string, string>();
  for (const m of movimientos) {
    if (!m.legacy_key) continue;
    // El movimiento propio del box le gana al del catálogo global.
    if (m.org_id === orgId || !movimientoPorClave.has(m.legacy_key)) {
      movimientoPorClave.set(m.legacy_key, m.id);
    }
  }

  interface MarcaPendiente {
    registro: {
      org_id: string; athlete_id: string; movement_id: string;
      value_numeric: number; unit: string; achieved_on: string; source: 'import';
    };
    fila: FilaNormalizada;
  }

  const marcas: MarcaPendiente[] = [];
  for (const fila of importados) {
    for (const marca of fila.marcas) {
      const movementId = movimientoPorClave.get(marca.clave);
      if (!movementId) continue;
      marcas.push({
        fila,
        registro: {
          org_id: orgId,
          athlete_id: idPorFila.get(fila.indice)!,
          movement_id: movementId,
          value_numeric: marca.valor,
          unit: marca.unidad,
          achieved_on: hoy,
          source: 'import',
        },
      });
    }
  }

  if (marcas.length > 0) {
    avisar('marcas');
    for (const lote of enLotes(marcas)) {
      const resultados = await insertarLote('personal_records', lote.map((m) => m.registro));
      resultados.forEach((r, i) => {
        if ('id' in r) resumen.marcas += 1;
        else {
          resumen.fallidas.push({
            indice: lote[i].fila.indice, nombre: lote[i].fila.nombreCrudo,
            etapa: 'marcas', motivo: r.error,
          });
        }
      });
      procesadas += lote.length;
      avisar('marcas');
    }
  }

  procesadas = totalUnidades;
  avisar('listo');
  return resumen;
}

/** La importación, envuelta para la interfaz. */
export function useImportar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: ArgsImportacion) => ejecutarImportacion(args),
    onSuccess: (_r, vars) => {
      void qc.invalidateQueries({ queryKey: ['athletes', vars.orgId] });
      void qc.invalidateQueries({ queryKey: ['plans', vars.orgId] });
      void qc.invalidateQueries({ queryKey: ['import-existentes', vars.orgId] });
      void qc.invalidateQueries({ queryKey: ['cartera', vars.orgId] });
    },
  });
}
