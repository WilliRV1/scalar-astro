import { useState } from 'react';
import { Button, Drawer, ErrorNote, Field } from '../../shared/ui';
import { useReactivarBox, useSuspenderBox } from './mutations';
import type { BoxDePlataforma } from './types';

/**
 * Suspender por mora y reactivar.
 *
 * Suspender NO borra nada: el box entra, ve sus atletas, sus cobros y sus
 * marcas, pero no puede escribir. Es reversible en un clic y esa es la idea —
 * la mayoría de las moras se arreglan con una llamada, y borrar datos para
 * volver a cargarlos tres días después es la forma más rápida de perderlos.
 */
export function SuspenderDrawer({
  box,
  open,
  onClose,
}: {
  box: BoxDePlataforma | null;
  open: boolean;
  onClose: () => void;
}) {
  const suspender = useSuspenderBox();
  const reactivar = useReactivarBox();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  const suspendido = box?.org_status === 'suspended';
  const trabajando = suspender.isPending || reactivar.isPending;

  function cerrar() {
    setMotivo('');
    setError('');
    onClose();
  }

  async function ejecutar() {
    if (!box) return;
    setError('');
    try {
      if (suspendido) {
        await reactivar.mutateAsync({ orgId: box.org_id, motivo: motivo || 'pago recibido' });
      } else {
        await suspender.mutateAsync({ orgId: box.org_id, motivo: motivo || 'mora' });
      }
      cerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado del box');
    }
  }

  return (
    <Drawer
      open={open && box != null}
      title={suspendido ? 'Reactivar el box' : 'Suspender por mora'}
      onClose={cerrar}
      footer={
        <Button className="w-full" disabled={trabajando} onClick={() => void ejecutar()}>
          {trabajando ? 'Un momento…' : suspendido ? 'Reactivar' : 'Suspender'}
        </Button>
      }
    >
      {box && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            <span className="font-bold text-white">{box.name}</span> · {box.atletas_activos} atletas
            activos.
          </p>

          <p className="border-l-4 border-gray-700 bg-black/20 px-3 py-2 text-xs text-gray-500">
            {suspendido
              ? 'Al reactivar, el box vuelve a escribir de inmediato. Nada se perdió mientras estuvo suspendido.'
              : 'El box queda en SOLO LECTURA: sigue viendo todo, pero no puede registrar pagos ni cambiar nada. No se borra ni un dato.'}
          </p>

          <Field
            label={suspendido ? 'Nota (opcional)' : 'Motivo (queda en la bitácora)'}
            hint="Ejemplo: dos meses sin pagar, avisado por WhatsApp el 1 y el 10."
          >
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 bg-gray-100 p-3 text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-black"
            />
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      )}
    </Drawer>
  );
}
