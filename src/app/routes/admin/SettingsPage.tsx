import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../features/auth/useAuth';
import {
  SeccionBox,
  SeccionCobros,
  SeccionIntegraciones,
  SeccionMensajes,
  SeccionReservas,
  useBox,
  useOnboarding,
} from '../../../features/orgsetup';
import { Card, EmptyState } from '../../../shared/ui';

/**
 * Configuración del box.
 *
 * Esta pantalla existe para que nosotros no tengamos que entrar. Todo lo que
 * antes se cambiaba con un `update` a mano sobre `organizations.settings` o con
 * una variable de entorno está aquí, con una frase al lado que dice qué hace en
 * el box —no en la base de datos—, y agrupado por lo que el dueño viene a
 * hacer, no por en qué tabla vive.
 *
 * Solo la ven dueño y administrador. El guarda de la ruta decide qué se pinta;
 * la RLS decide a qué se accede. Si alguien llegara por la URL, las consultas
 * no devolverían nada y la pantalla saldría vacía, que es lo correcto.
 */

const PESTANAS = [
  { id: 'box', label: 'Box' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'mensajes', label: 'Mensajes' },
  { id: 'reservas', label: 'Reservas' },
  { id: 'integraciones', label: 'Integraciones' },
] as const;

type Pestana = (typeof PESTANAS)[number]['id'];

const DESCRIPCION: Record<Pestana, string> = {
  box: 'El nombre, el teléfono y la zona horaria. Lo que ven tus atletas y lo que decide qué día es "hoy" para los cobros.',
  cobros: 'Qué día se cobra, cuántos días esperas antes de marcar la mora y cómo te pagan.',
  mensajes: 'Los avisos que salen solos: cuándo se puede escribir, cuántas veces y si de verdad se envían.',
  reservas: 'Las reglas del cupo: cuándo se aparta, hasta cuándo se cancela y qué pasa con el que no llega.',
  integraciones: 'Tus llaves de Wompi y de WhatsApp. Son tuyas: con ellas la plata de tus mensualidades entra a tu cuenta.',
};

export default function SettingsPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const esDueno = activeMembership?.role === 'owner' || activeMembership?.role === 'admin';
  const [pestana, setPestana] = useState<Pestana>('box');

  const box = useBox(esDueno ? orgId : undefined);
  const avance = useOnboarding(esDueno ? orgId : undefined);

  // Doble llave con el guarda de la ruta: aunque las dos fallaran, la RLS no
  // suelta un dato y esta pantalla no tendría nada que pintar.
  if (!esDueno || !orgId) {
    return (
      <EmptyState
        title="Solo el dueño y el administrador"
        hint="Acá se cambian los precios, los cobros y las llaves con las que entra la plata del box. Pídele a tu dueño que te cambie el rol si te toca gestionarlo."
      />
    );
  }

  const faltaPuestaEnMarcha = avance.data != null && avance.data.completed_at == null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-black dark:text-white">Configuración</h1>
        {box.data && (
          <p className="mt-1 text-xs uppercase tracking-widest text-gray-500">
            {box.data.name} · {box.data.slug}.scalar.app
          </p>
        )}
      </div>

      {faltaPuestaEnMarcha && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-primary">
          <p className="text-sm text-gray-400">
            Todavía no terminas de poner tu box en marcha.
          </p>
          <Link
            to="/admin/puesta-en-marcha"
            className="font-display text-xl text-primary hover:underline"
          >
            Seguir donde iba →
          </Link>
        </Card>
      )}

      {/* Pestañas. En móvil se desplazan en horizontal: el dueño entra desde el
          celular y no caben cinco en una pantalla de 360 píxeles. */}
      <nav
        aria-label="Secciones de la configuración"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            aria-current={pestana === p.id ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-4 py-3 font-display text-xl transition ${
              pestana === p.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-black dark:hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <p className="text-sm leading-relaxed text-gray-500">{DESCRIPCION[pestana]}</p>

      <Card>
        {pestana === 'box' && <SeccionBox orgId={orgId} />}
        {pestana === 'cobros' && <SeccionCobros orgId={orgId} />}
        {pestana === 'mensajes' && <SeccionMensajes orgId={orgId} />}
        {pestana === 'reservas' && <SeccionReservas orgId={orgId} />}
        {pestana === 'integraciones' && <SeccionIntegraciones orgId={orgId} />}
      </Card>
    </div>
  );
}
