import { useMemo, useState } from 'react';
import { Button, Card, ErrorNote, Field, Select, Spinner, Stat, TextInput } from '../../shared/ui';
import { formatCents } from '../../shared/lib/money';
import { ATHLETE_STATUSES } from '../athletes/schema';
import { usePlans } from '../billing/queries-athlete';
import { MapeoColumnas } from './MapeoColumnas';
import { TablaPrevia } from './TablaPrevia';
import { ZonaArchivo } from './ZonaArchivo';
import { useImportar } from './importar';
import { useAtletasExistentes, useMovimientosImportables } from './queries';
import { leerArchivo } from './readWorkbook';
import {
  analizarArchivo, celdaATexto, esCeldaVacia, mapearColumnas, parsePrecioCents, separarEncabezados,
} from './parse';
import type { CampoDestino, MapeoColumnas as Mapeo } from './parse';
import type { EtapaImportacion, ProgresoImportacion, ResumenImportacion } from './importar';
import type { HojaCruda } from './readWorkbook';
import type { AthleteStatus } from '../../types/database';

const ETIQUETA_ESTADO: Record<AthleteStatus, string> = {
  lead: 'Prospecto',
  trial: 'En prueba',
  active: 'Activo',
  frozen: 'Congelado',
  overdue: 'En mora',
  churned: 'Retirado',
};

const ETIQUETA_ETAPA: Record<EtapaImportacion, string> = {
  atletas: 'Creando atletas',
  planes: 'Preparando los planes',
  suscripciones: 'Creando suscripciones',
  marcas: 'Guardando marcas',
  listo: 'Terminando',
};

/**
 * Importador de Excel.
 *
 * El recorrido es: subir → revisar el mapeo y la vista previa → importar.
 * La regla de oro es que nada se guarda hasta que el coach vea, fila por fila,
 * lo que va a quedar en la base. Es la herramienta con la que entra cada box
 * nuevo: si falla, el cliente se pierde en el primer día.
 */
export function ImportWizard({ orgId }: { orgId: string }) {
  const [hojas, setHojas] = useState<HojaCruda[]>([]);
  const [hojaActiva, setHojaActiva] = useState(0);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState('');

  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [precioTexto, setPrecioTexto] = useState('');
  const [estadoPorDefecto, setEstadoPorDefecto] = useState<AthleteStatus>('active');
  const [omitirDuplicados, setOmitirDuplicados] = useState(true);
  const [excepciones, setExcepciones] = useState<Set<number>>(new Set());

  const [progreso, setProgreso] = useState<ProgresoImportacion | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [errorImportacion, setErrorImportacion] = useState('');

  const existentes = useAtletasExistentes(orgId);
  const movimientos = useMovimientosImportables(orgId);
  const planes = usePlans(orgId);
  const importar = useImportar();

  const hoja = hojas[hojaActiva] as HojaCruda | undefined;

  const separado = useMemo(
    () => (hoja ? separarEncabezados(hoja.matriz) : null),
    [hoja],
  );

  /** Primer valor no vacío de cada columna: sirve para no mapear a ciegas. */
  const muestras = useMemo(() => {
    if (!separado) return [];
    return separado.encabezados.map((_, columna) => {
      const celda = separado.filas.find((f) => !esCeldaVacia(f[columna]));
      return celda ? celdaATexto(celda[columna]) : '';
    });
  }, [separado]);

  const precioPorDefectoCents = parsePrecioCents(precioTexto);

  const analisis = useMemo(() => {
    if (!separado) return null;
    return analizarArchivo(separado.encabezados, separado.filas, mapeo, {
      precioPorDefectoCents,
      estadoPorDefecto,
      existentes: existentes.data ?? [],
    });
  }, [separado, mapeo, precioPorDefectoCents, estadoPorDefecto, existentes.data]);

  /**
   * Qué filas se omiten. El coach decide de a bloque (todos los duplicados) y
   * puede corregir fila por fila; las correcciones son las excepciones.
   */
  const omitidas = useMemo(() => {
    const set = new Set<number>();
    if (!analisis) return set;
    for (const fila of analisis.filas) {
      if (!fila.duplicado) continue;
      const corregida = excepciones.has(fila.indice);
      if (omitirDuplicados !== corregida) set.add(fila.indice);
    }
    return set;
  }, [analisis, omitirDuplicados, excepciones]);

  const aImportar = useMemo(
    () => (analisis?.filas ?? []).filter((f) => f.estado !== 'error' && !omitidas.has(f.indice)),
    [analisis, omitidas],
  );

  function reiniciar() {
    setHojas([]);
    setHojaActiva(0);
    setNombreArchivo('');
    setMapeo({});
    setExcepciones(new Set());
    setResumen(null);
    setErrorImportacion('');
    setProgreso(null);
  }

  function prepararHoja(nueva: HojaCruda) {
    setMapeo(mapearColumnas(separarEncabezados(nueva.matriz).encabezados));
    setExcepciones(new Set());
  }

  async function onArchivo(archivo: File) {
    setLeyendo(true);
    setErrorArchivo('');
    setResumen(null);
    try {
      const leidas = await leerArchivo(archivo);
      const conDatos = leidas.filter((h) => h.matriz.length > 1);
      if (conDatos.length === 0) {
        setErrorArchivo('El archivo no tiene filas con datos. ¿Seguro que es la hoja correcta?');
        return;
      }
      setHojas(conDatos);
      setHojaActiva(0);
      setNombreArchivo(archivo.name);
      prepararHoja(conDatos[0]);
    } catch {
      setErrorArchivo('No se pudo leer el archivo. Debe ser un .xlsx, .xls o .csv sin contraseña.');
    } finally {
      setLeyendo(false);
    }
  }

  function onCambiarHoja(indice: number) {
    setHojaActiva(indice);
    const nueva = hojas[indice];
    if (nueva) prepararHoja(nueva);
  }

  function onCambioMapeo(columna: number, campo: CampoDestino) {
    setMapeo((actual) => {
      const siguiente: Mapeo = { ...actual, [columna]: campo };
      // Un campo no puede venir de dos columnas: la anterior se libera sola.
      if (campo !== 'ignorar') {
        for (const [col, valor] of Object.entries(siguiente)) {
          if (Number(col) !== columna && valor === campo) siguiente[Number(col)] = 'ignorar';
        }
      }
      return siguiente;
    });
  }

  function onAlternarOmitir(indice: number) {
    setExcepciones((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(indice)) siguiente.delete(indice);
      else siguiente.add(indice);
      return siguiente;
    });
  }

  async function onImportar() {
    if (!analisis) return;
    setErrorImportacion('');
    setProgreso({ etapa: 'atletas', procesadas: 0, total: Math.max(aImportar.length, 1) });
    try {
      const hecho = await importar.mutateAsync({
        orgId,
        filas: aImportar,
        movimientos: movimientos.data ?? [],
        planes: planes.data ?? [],
        onProgress: setProgreso,
      });
      setResumen(hecho);
    } catch (err) {
      setErrorImportacion(
        err instanceof Error ? err.message : 'La importación falló antes de empezar.',
      );
    } finally {
      setProgreso(null);
    }
  }

  // --- Resumen final ------------------------------------------------------
  if (resumen) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-3xl text-black dark:text-white">Importación terminada</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Atletas" value={String(resumen.atletas)} />
          <Stat label="Suscripciones" value={String(resumen.suscripciones)} />
          <Stat label="Marcas" value={String(resumen.marcas)} />
          <Stat label="Planes creados" value={String(resumen.planesCreados)} />
        </div>

        {resumen.fallidas.length > 0 ? (
          <Card>
            <p className="font-display text-2xl text-primary">
              {resumen.fallidas.length} cosas no entraron
            </p>
            <p className="mt-1 text-xs text-gray-500">
              El resto sí quedó guardado. Corrige estas filas en el Excel y vuelve a subirlo:
              se detectarán como duplicadas las que ya existen.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-gray-400">
              {resumen.fallidas.slice(0, 20).map((f, i) => (
                <li key={`${f.indice}-${i}`}>
                  <span className="text-gray-600">Fila {f.indice} · </span>
                  <span className="font-bold text-white">{f.nombre}</span>
                  <span className="text-gray-600"> ({ETIQUETA_ETAPA[f.etapa]}): </span>
                  {f.motivo}
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card>
            <p className="font-display text-2xl text-green-500">Todo entró sin errores</p>
            <p className="mt-1 text-sm text-gray-500">
              Revisa los nombres compuestos en la lista de atletas: partir «nombre y apellidos»
              siempre es una suposición.
            </p>
          </Card>
        )}

        <Button variant="ghost" onClick={reiniciar}>Importar otro archivo</Button>
      </div>
    );
  }

  // --- Importando ---------------------------------------------------------
  if (importar.isPending || progreso) {
    const p = progreso ?? { etapa: 'atletas' as EtapaImportacion, procesadas: 0, total: 1 };
    const porcentaje = Math.min(100, Math.round((p.procesadas / Math.max(p.total, 1)) * 100));
    return (
      <Card className="space-y-4">
        <p className="font-display text-3xl text-white">{ETIQUETA_ETAPA[p.etapa]}…</p>
        <div className="h-3 w-full bg-black">
          <div className="h-3 bg-primary transition-all" style={{ width: `${porcentaje}%` }} />
        </div>
        <p className="text-xs uppercase tracking-widest text-gray-500">
          {porcentaje}% · {p.procesadas} de {p.total}
        </p>
        <p className="text-sm text-gray-500">
          No cierres esta pantalla. Si una fila falla, la importación sigue con las demás y te
          decimos cuáles quedaron por fuera.
        </p>
      </Card>
    );
  }

  // --- Subir archivo ------------------------------------------------------
  if (!hoja || !analisis || !separado) {
    return <ZonaArchivo onArchivo={onArchivo} error={errorArchivo} cargando={leyendo} />;
  }

  // --- Mapeo y vista previa ----------------------------------------------
  const { resumen: conteo } = analisis;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-2xl text-black dark:text-white">{nombreArchivo}</p>
          <p className="text-xs text-gray-500">
            Encabezados en la fila {separado.filaEncabezado + 1} · {analisis.filas.length} filas con datos
          </p>
        </div>
        <Button variant="ghost" onClick={reiniciar}>Cambiar archivo</Button>
      </div>

      {hojas.length > 1 && (
        <Field label="Hoja del archivo">
          <Select value={hojaActiva} onChange={(e) => onCambiarHoja(Number(e.target.value))}>
            {hojas.map((h, i) => (
              <option key={h.nombre} value={i}>{h.nombre}</option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Listas" value={String(conteo.listas)} />
        <Stat label="Con avisos" value={String(conteo.avisos)} hint="se importan, hay que revisarlas" />
        <Stat label="Con errores" value={String(conteo.errores)} hint="no se importan" />
      </div>

      <Card className="space-y-3">
        <p className="font-display text-2xl text-white">Qué se va a crear</p>
        <p className="text-sm text-gray-400">
          {aImportar.length} atletas
          {conteo.suscripciones > 0 && ` · ${conteo.suscripciones} suscripciones`}
          {conteo.marcas > 0 && ` · ${conteo.marcas} marcas`}
          {conteo.duplicados > 0 && ` · ${conteo.duplicados} posibles duplicados`}
        </p>
        {conteo.duplicados > 0 && (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={omitirDuplicados}
              onChange={(e) => { setOmitirDuplicados(e.target.checked); setExcepciones(new Set()); }}
              className="mt-0.5 h-5 w-5 accent-[#FF0000]"
            />
            <span>
              <span className="block text-sm font-bold text-white">
                Omitir los {conteo.duplicados} que ya están en el box
              </span>
              <span className="block text-xs text-gray-500">
                Se comparan el celular y el nombre completo. Puedes decidir fila por fila en la
                vista previa.
              </span>
            </span>
          </label>
        )}
        {existentes.isLoading && (
          <p className="text-xs text-gray-500">Buscando duplicados contra los atletas del box…</p>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Valor de la mensualidad por defecto"
          hint={
            precioPorDefectoCents !== null
              ? `Se usará ${formatCents(precioPorDefectoCents)} en las filas sin valor`
              : 'Opcional. Para las filas que traen fecha de corte pero no valor.'
          }
        >
          <TextInput
            inputMode="numeric"
            placeholder="180.000"
            value={precioTexto}
            onChange={(e) => setPrecioTexto(e.target.value)}
          />
        </Field>
        <Field label="Estado por defecto" hint="Para las filas cuyo estado no se entienda">
          <Select
            value={estadoPorDefecto}
            onChange={(e) => setEstadoPorDefecto(e.target.value as AthleteStatus)}
          >
            {ATHLETE_STATUSES.map((s) => (
              <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>
            ))}
          </Select>
        </Field>
      </div>

      <section className="space-y-3">
        <h3 className="font-display text-2xl text-black dark:text-white">Mapeo de columnas</h3>
        <MapeoColumnas
          encabezados={separado.encabezados}
          mapeo={mapeo}
          muestras={muestras}
          onCambio={onCambioMapeo}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-2xl text-black dark:text-white">Vista previa</h3>
        {movimientos.isLoading ? (
          <Spinner label="Cargando el catálogo de movimientos" />
        ) : (
          <TablaPrevia filas={analisis.filas} omitidas={omitidas} onAlternarOmitir={onAlternarOmitir} />
        )}
      </section>

      {errorImportacion && <ErrorNote>{errorImportacion}</ErrorNote>}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-gray-800 bg-background-dark/95 py-3">
        <Button onClick={onImportar} disabled={aImportar.length === 0}>
          Importar {aImportar.length} atletas
        </Button>
        <Button variant="ghost" onClick={reiniciar}>Cancelar</Button>
      </div>
    </div>
  );
}
