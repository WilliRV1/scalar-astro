import { useState } from 'react';
import { Button, Drawer, ErrorNote, Field, Spinner } from '../../shared/ui';
import { mensajeAmigable } from '../../shared/lib/errores';
import { formatCents } from '../../shared/lib/money';
import { useCerrarSuplantacion, useSuplantar } from './mutations';
import { useDetalleDeBox } from './queries';
import { dominioDelBox } from './altas';
import type { BoxDePlataforma, SesionDeSoporte } from './types';

const MINIMO_MOTIVO = 10;

function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/**
 * Suplantación para dar soporte.
 *
 * El motivo es obligatorio y no es burocracia: queda en `audit_log` y el dueño
 * del box lo puede leer. Es lo que nos deja atender un "no me cuadra el cobro"
 * sin pedirle la contraseña al cliente, y lo que nos permite demostrar, si
 * algún día hace falta, qué se miró y por qué.
 *
 * Ser superadministrador NO abre la RLS de los boxes: ni con la sesión abierta
 * se leen atletas uno por uno desde aquí. Lo que se ve son cifras agregadas.
 */
export function SoporteDrawer({
  box,
  open,
  onClose,
}: {
  box: BoxDePlataforma | null;
  open: boolean;
  onClose: () => void;
}) {
  const suplantar = useSuplantar();
  const cerrar = useCerrarSuplantacion();
  const [motivo, setMotivo] = useState('');
  const [sesion, setSesion] = useState<SesionDeSoporte | null>(null);
  const [error, setError] = useState('');

  const detalle = useDetalleDeBox(sesion ? sesion.org_id : undefined);
  const motivoCorto = motivo.trim().length < MINIMO_MOTIVO;

  function limpiar() {
    setMotivo('');
    setSesion(null);
    setError('');
  }

  async function abrir() {
    if (!box || motivoCorto) return;
    setError('');
    try {
      setSesion(await suplantar.mutateAsync({ orgId: box.org_id, motivo }));
    } catch (err) {
      setError(mensajeAmigable(err));
    }
  }

  async function terminar() {
    if (!sesion) {
      limpiar();
      onClose();
      return;
    }
    try {
      await cerrar.mutateAsync({ sesionId: sesion.id, orgId: sesion.org_id });
    } catch {
      // Si falla, la sesión vence sola en una hora. No vale la pena molestar.
    }
    limpiar();
    onClose();
  }

  return (
    <Drawer
      open={open && box != null}
      title={sesion ? 'Sesión de soporte abierta' : 'Entrar a dar soporte'}
      // Cerrar por la X, Escape o el fondo también cierra la sesión de
      // soporte: si no, queda una hora abierta a nombre de quien la olvidó.
      onClose={() => void terminar()}
      footer={
        sesion ? (
          <Button
            variant="ghost"
            className="w-full"
            disabled={cerrar.isPending}
            onClick={() => void terminar()}
          >
            {cerrar.isPending ? 'Cerrando…' : 'Cerrar la sesión de soporte'}
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={motivoCorto || suplantar.isPending}
            onClick={() => void abrir()}
          >
            {suplantar.isPending ? 'Abriendo…' : 'Abrir sesión y registrar'}
          </Button>
        )
      }
    >
      {box && (
        <div className="space-y-4">
          <div className="grunge-border bg-black/40 p-3">
            <p className="font-display text-2xl text-white">{box.name}</p>
            <p className="font-mono text-xs text-gray-400">{dominioDelBox(box.slug)}</p>
            <p className="mt-1 text-xs text-gray-500">
              Dueño: {box.owner_email ?? 'sin dueño asignado todavía'}
            </p>
          </div>

          {!sesion ? (
            <>
              <Field
                label="¿Por qué necesitas entrar?"
                hint="Queda en la bitácora del box y el dueño lo puede leer. Sé concreto."
                error={
                  motivo.length > 0 && motivoCorto
                    ? `Faltan ${MINIMO_MOTIVO - motivo.trim().length} caracteres.`
                    : undefined
                }
              >
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  placeholder="Revisar el cobro duplicado de Marcela del 3 de octubre"
                  className="w-full border border-gray-300 bg-gray-100 p-3 text-base sm:text-sm text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-black"
                />
              </Field>

              <p className="border-l-4 border-gray-700 bg-black/20 px-3 py-2 text-xs text-gray-500">
                La sesión dura una hora y se cierra sola. No da acceso a la ficha de ningún
                atleta: solo a cifras del box.
              </p>

              {error && <ErrorNote>{error}</ErrorNote>}
            </>
          ) : (
            <>
              <p className="border-l-4 border-primary bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
                Registrada a tu nombre. Vence a las {hora(sesion.expires_at)}.
              </p>

              {detalle.isLoading && <Spinner label="Mirando el box" />}
              {detalle.error && (
                <ErrorNote>{mensajeAmigable(detalle.error)}</ErrorNote>
              )}

              {detalle.data && (
                <dl className="grid grid-cols-2 gap-3">
                  <Cifra titulo="Atletas activos" valor={String(detalle.data.atletas_activos)} />
                  <Cifra titulo="En mora" valor={String(detalle.data.atletas_en_mora)} />
                  <Cifra titulo="Cartera" valor={formatCents(detalle.data.cartera_cents)} />
                  <Cifra titulo="Cobros del mes" valor={String(detalle.data.cobros_del_mes)} />
                  <Cifra
                    titulo="Último pago"
                    valor={
                      detalle.data.ultimo_pago_at
                        ? new Intl.DateTimeFormat('es-CO', {
                            day: '2-digit',
                            month: 'short',
                          }).format(new Date(detalle.data.ultimo_pago_at))
                        : '—'
                    }
                  />
                  <Cifra titulo="Equipo" valor={String(detalle.data.miembros_staff)} />
                </dl>
              )}

              <p className="text-xs text-gray-500">
                Motivo registrado: <span className="text-gray-400">“{sesion.reason}”</span>
              </p>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Cifra({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="grunge-border bg-black/40 p-3">
      <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{titulo}</dt>
      <dd className="font-display text-2xl text-white">{valor}</dd>
    </div>
  );
}
