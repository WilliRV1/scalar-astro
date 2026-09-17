import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../features/auth/useAuth';
import { fullName, useAthletes } from '../../../features/athletes/queries';
import { AthleteForm } from '../../../features/athletes/AthleteForm';
import { formatPhone } from '../../../shared/lib/phone';
import { Button, Card, EmptyState, ErrorNote, Spinner } from '../../../shared/ui';
import type { Athlete, AthleteStatus } from '../../../types/database';

const ESTADO: Record<AthleteStatus, { label: string; className: string }> = {
  lead:    { label: 'Prospecto', className: 'text-gray-400' },
  trial:   { label: 'Prueba',    className: 'text-blue-400' },
  active:  { label: 'Activo',    className: 'text-green-500' },
  frozen:  { label: 'Congelado', className: 'text-yellow-500' },
  overdue: { label: 'En mora',   className: 'text-primary' },
  churned: { label: 'Retirado',  className: 'text-gray-600' },
};

const FILTROS: { key: 'todos' | AthleteStatus; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'active', label: 'Activos' },
  { key: 'overdue', label: 'En mora' },
  { key: 'frozen', label: 'Congelados' },
  { key: 'churned', label: 'Retirados' },
];

export default function AthletesPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;

  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'todos' | AthleteStatus>('todos');
  const [editando, setEditando] = useState<Athlete | null>(null);
  const [creando, setCreando] = useState(false);

  const { data, isLoading, error } = useAthletes(orgId, search);
  const lista = (data ?? []).filter((a) => filtro === 'todos' || a.status === filtro);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-black dark:text-white">Atletas</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/coach/importar"
            className="grunge-border px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:border-primary hover:text-primary"
          >
            Importar Excel
          </Link>
          <Button onClick={() => setCreando(true)}>+ Atleta</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition ${
              filtro === f.key
                ? 'bg-primary text-white'
                : 'grunge-border text-gray-500 hover:text-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          type="search"
          placeholder="Buscar por nombre o celular"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="grunge-border ml-auto bg-transparent px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {error && <ErrorNote>No se pudieron cargar los atletas: {String(error)}</ErrorNote>}
      {isLoading && <Spinner label="Cargando atletas" />}

      {!isLoading && lista.length === 0 && (
        <EmptyState
          title={search || filtro !== 'todos' ? 'Sin resultados' : 'Todavía no hay atletas'}
          hint={
            search || filtro !== 'todos'
              ? 'Prueba con otro nombre, número o filtro.'
              : 'Crea el primero, o importa la hoja de cálculo del box de un tirón.'
          }
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {lista.map((a) => {
          const estado = ESTADO[a.status];
          return (
            <Card key={a.id} className="flex items-center justify-between gap-3">
              <Link to={`/coach/atletas/${a.id}`} className="min-w-0 flex-1">
                <p className="truncate font-bold text-black hover:text-primary dark:text-white">
                  {fullName(a)}
                </p>
                <p className="text-xs text-gray-500">
                  {formatPhone(a.phone)}
                  {!a.phone && <span className="ml-1 text-primary">· falta celular</span>}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${estado.className}`}>
                  {estado.label}
                </span>
                <button
                  onClick={() => setEditando(a)}
                  aria-label={`Editar ${fullName(a)}`}
                  className="text-xs font-bold uppercase text-gray-500 hover:text-primary"
                >
                  Editar
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {orgId && (creando || editando) && (
        <AthleteForm
          key={editando?.id ?? 'nuevo'}
          orgId={orgId}
          athlete={editando}
          open
          onClose={() => { setCreando(false); setEditando(null); }}
        />
      )}
    </div>
  );
}
