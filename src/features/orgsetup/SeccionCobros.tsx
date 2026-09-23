import { useState } from 'react';
import { Button, ErrorNote, Spinner, TextInput } from '../../shared/ui';
import { mensaje } from './errores';
import { useBox } from './queries';
import { useGuardarAjustesBox } from './mutations';
import { erroresPorCampo, esquemaCobros } from './esquema';
import { Guardado, Interruptor, Nota, Opcion } from './piezas';
import { AYUDA } from './textos';
import type { AjustesBox } from './types';

/**
 * Cómo cobra el box.
 *
 * El día de corte y los días de gracia son los dos números que deciden cuándo
 * sale cada cobro y cuándo un atleta queda en mora, así que son los dos que
 * hasta hoy nos tocaba cambiar a nosotros con un `update` a mano.
 */
export function SeccionCobros({ orgId, onGuardado }: { orgId: string; onGuardado?: () => void }) {
  const { data: box, isLoading, error } = useBox(orgId);

  if (isLoading) return <Spinner label="Cargando la configuración de cobros" />;
  if (error) return <ErrorNote>No se pudo cargar la configuración: {mensaje(error)}</ErrorNote>;
  if (!box) return <ErrorNote>No encontramos tu box.</ErrorNote>;

  return <Formulario key={box.id} orgId={orgId} ajustes={box.settings} onGuardado={onGuardado} />;
}

function Formulario({
  orgId, ajustes, onGuardado,
}: {
  orgId: string;
  ajustes: AjustesBox;
  onGuardado?: () => void;
}) {
  const guardar = useGuardarAjustesBox();
  const [corte, setCorte] = useState(String(ajustes.default_billing_day));
  const [gracia, setGracia] = useState(String(ajustes.grace_days));
  const [enLinea, setEnLinea] = useState(ajustes.accepts_online_payment);
  const [enlace, setEnlace] = useState(ajustes.payment_link);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setListo(false);

    const revisado = esquemaCobros.safeParse({
      default_billing_day: corte,
      grace_days: gracia,
      accepts_online_payment: enLinea,
      payment_link: enlace,
    });
    if (!revisado.success) {
      setErrores(erroresPorCampo(revisado.error));
      return;
    }

    try {
      await guardar.mutateAsync({ orgId, ajustes: revisado.data });
      setListo(true);
      onGuardado?.();
    } catch (err) {
      setErrores({ _: mensaje(err) });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Opcion
          etiqueta="Día de corte por defecto"
          ayuda={AYUDA.diaCorte}
          error={errores.default_billing_day}
        >
          <TextInput
            inputMode="numeric"
            value={corte}
            onChange={(e) => setCorte(e.target.value)}
            placeholder="5"
          />
        </Opcion>

        <Opcion etiqueta="Días de gracia" ayuda={AYUDA.diasGracia} error={errores.grace_days}>
          <TextInput
            inputMode="numeric"
            value={gracia}
            onChange={(e) => setGracia(e.target.value)}
            placeholder="3"
          />
        </Opcion>
      </div>

      <Nota>
        Si pones el corte el 31, en febrero se cobra el último día del mes. Nadie se queda sin
        cobrar por vivir en un mes corto.
      </Nota>

      <Interruptor
        etiqueta="Aceptar pago en línea"
        ayuda={AYUDA.pagoEnLinea}
        activo={enLinea}
        onCambiar={setEnLinea}
        destacado
      />

      {enLinea && (
        <Nota>
          Para que esto funcione de verdad tienes que pegar tus llaves de Wompi en la pestaña
          <span className="font-bold"> Integraciones</span>. Mientras no estén, el atleta verá el
          botón y no podrá pagar.
        </Nota>
      )}

      <Opcion etiqueta="Enlace de pago" ayuda={AYUDA.enlacePago} error={errores.payment_link}>
        <TextInput
          inputMode="url"
          value={enlace}
          onChange={(e) => setEnlace(e.target.value)}
          placeholder="https://..."
        />
      </Opcion>

      {errores._ && <ErrorNote>{errores._}</ErrorNote>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        <Guardado visible={listo && !guardar.isPending} />
      </div>
    </form>
  );
}
