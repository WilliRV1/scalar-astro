import { useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { fullName, useAthletes } from '../../../features/athletes/queries';
import { formatPhone } from '../../../shared/lib/phone';
import { Card, EmptyState, ErrorNote, Spinner } from '../../../shared/ui';
import type { AthleteStatus } from '../../../types/database';

const ESTADO: Record<AthleteStatus, { label: string; className: string }> = {
  lead: { label: 'Prospecto', className: 'text-gray-400' },
  trial: { label: 'Prueba', className: 'text-blue-400' },
  active: { label: 'Activo', className: 'text-green-500' },
  frozen: { label: 'Congelado', className: 'text-yellow-500' },
  overdue: { label: 'En mora', className: 'text-primary' },
  churned: { label: 'Retirado', className: 'text-gray-600' },
};

export default function AthletesPage() {
  const { activeMembership } = useAuth();
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useAthletes(activeMembership?.org_id, search);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-black dark:text-white">Atletas</h1>
        <input
          type="search"
          placeholder="Buscar por nombre o celular"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="grunge-border bg-transparent px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {error && <ErrorNote>No se pudieron cargar los atletas: {String(error)}</ErrorNote>}
      {isLoading && <Spinner label="Cargando atletas" />}

      {!isLoading && data?.length === 0 && (
        <EmptyState
          title={search ? 'Sin resultados' : 'Todavía no hay atletas'}
          hint={
            search
              ? 'Prueba con otro nombre o número.'
              : 'En la fase 1 se importan desde el Excel del box con un par de clics.'
          }
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {data?.map((a) => {
          const estado = ESTADO[a.status];
          return (
            <Card key={a.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-black dark:text-white">{fullName(a)}</p>
                <p className="text-xs text-gray-500">{formatPhone(a.phone)}</p>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${estado.className}`}>
                {estado.label}
              </span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
