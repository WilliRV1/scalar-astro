import { canViewFinances, isStaff } from '../../../features/auth/AuthContext';
import { useAuth } from '../../../features/auth/useAuth';
import { ImportWizard } from '../../../features/import/ImportWizard';
import { Card, EmptyState, Spinner } from '../../../shared/ui';

/**
 * Migración de un box nuevo. Todo box llega con su Excel hecho a mano, y esta
 * pantalla es la que lo convierte en atletas, suscripciones y marcas.
 */
export default function ImportPage() {
  const { activeMembership, loading } = useAuth();

  if (loading) return <Spinner label="Cargando el box" />;

  if (!activeMembership || !isStaff(activeMembership)) {
    return (
      <EmptyState
        title="Solo el staff importa datos"
        hint="Pídele a quien administra el box que haga la importación."
      />
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl text-black dark:text-white">Importar desde Excel</h1>
        <p className="text-sm text-gray-500">
          Sube la hoja con la que llevas el box hoy. Revisas lo que se va a crear y, si algo no
          cuadra, lo corriges antes de guardar nada.
        </p>
      </header>

      {!canViewFinances(activeMembership) && (
        <Card>
          <p className="font-display text-xl text-yellow-500">Sin acceso a finanzas</p>
          <p className="mt-1 text-sm text-gray-400">
            Se importarán los atletas y sus marcas, pero no los planes ni las suscripciones:
            para eso hace falta el permiso de finanzas del box.
          </p>
        </Card>
      )}

      <ImportWizard orgId={activeMembership.org_id} />
    </div>
  );
}
