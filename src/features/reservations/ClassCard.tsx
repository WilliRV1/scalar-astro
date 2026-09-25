import type { AccionReserva } from './ventanas';
import { etiquetaCupo, horaDeClase } from './ventanas';
import type { ClassRow } from './types';

/**
 * Una clase en la pantalla del atleta.
 *
 * Móvil primero y a una mano: esto se usa de pie, antes de entrenar. La hora
 * grande a la izquierda es lo que se busca de un vistazo; el botón ocupa el
 * ancho del pulgar y está abajo a la derecha, que es donde llega.
 *
 * Cuando no se puede reservar, la tarjeta DICE POR QUÉ. Un botón gris sin
 * explicación termina en una llamada al coach, que es exactamente el trabajo
 * que el producto promete quitarle.
 */
export function ClassCard({
  clase,
  accion,
  timezone,
  ocupado,
  onReservar,
  onCancelar,
}: {
  clase: ClassRow;
  accion: AccionReserva;
  timezone: string;
  ocupado: boolean;
  onReservar: () => void;
  onCancelar: () => void;
}) {
  const cancelada = clase.status === 'cancelled';
  const mia = accion.tipo === 'cancelar' || accion.tipo === 'en_espera' || accion.tipo === 'asistida';

  return (
    <article
      className={`grunge-border flex gap-4 p-4 ${
        cancelada ? 'opacity-60' : ''
      } ${mia ? 'border-l-4 border-l-primary' : ''} bg-surface-light dark:bg-surface-dark`}
    >
      <div className="shrink-0 text-center">
        <p className="font-display text-3xl leading-none text-black dark:text-white">
          {horaDeClase(clase.starts_at, timezone)}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {etiquetaCupo(clase)}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-black dark:text-white">{clase.name}</p>
        <MensajeDeAccion accion={accion} />
      </div>

      <div className="flex shrink-0 items-center">
        <BotonDeAccion
          accion={accion}
          ocupado={ocupado}
          onReservar={onReservar}
          onCancelar={onCancelar}
        />
      </div>
    </article>
  );
}

function MensajeDeAccion({ accion }: { accion: AccionReserva }) {
  switch (accion.tipo) {
    case 'bloqueado':
      return <p className="mt-1 text-xs text-gray-400">{accion.motivo}</p>;
    case 'lista_espera':
      return (
        <p className="mt-1 text-xs text-gray-400">
          Está llena. Si entras a la lista quedas en el puesto {accion.posicion} y te
          avisamos si se libera un cupo.
        </p>
      );
    case 'en_espera':
      return (
        <p className="mt-1 text-xs font-bold text-primary">
          En lista de espera{accion.posicion ? `, puesto ${accion.posicion}` : ''}
        </p>
      );
    case 'cancelar':
      return accion.aviso ? (
        <p className="mt-1 text-xs text-primary">{accion.aviso}</p>
      ) : (
        <p className="mt-1 text-xs font-bold text-green-500">Estás dentro</p>
      );
    case 'asistida':
      return <p className="mt-1 text-xs font-bold text-green-500">Ya entrenaste esta</p>;
    case 'reservar':
      return null;
  }
}

function BotonDeAccion({
  accion,
  ocupado,
  onReservar,
  onCancelar,
}: {
  accion: AccionReserva;
  ocupado: boolean;
  onReservar: () => void;
  onCancelar: () => void;
}) {
  const base =
    'h-12 min-w-[6rem] px-3 font-display text-lg tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40';

  switch (accion.tipo) {
    case 'reservar':
      return (
        <button
          type="button"
          onClick={onReservar}
          disabled={ocupado}
          className={`${base} bg-primary text-sobre-primario hover:bg-primario-flotante`}
        >
          Reservar
        </button>
      );
    case 'lista_espera':
      return (
        <button
          type="button"
          onClick={onReservar}
          disabled={ocupado}
          className={`${base} grunge-border text-gray-300 hover:border-primary hover:text-primary`}
        >
          A la lista
        </button>
      );
    case 'cancelar':
    case 'en_espera': {
      // Cancelación tardía: el aviso dice que se pierde el crédito. Un toque
      // accidental aquí cuesta plata, así que se pregunta antes.
      const aviso = accion.tipo === 'cancelar' ? accion.aviso : null;
      const cancelar = () => {
        if (aviso && !window.confirm(`${aviso}\n\n¿Cancelar de todas formas?`)) return;
        onCancelar();
      };
      return (
        <button
          type="button"
          onClick={cancelar}
          disabled={ocupado}
          className={`${base} grunge-border text-gray-400 hover:border-primary hover:text-primary`}
        >
          Cancelar
        </button>
      );
    }
    case 'asistida':
      return (
        <span className="flex h-12 min-w-[6rem] items-center justify-center text-2xl text-green-500">
          ✓
        </span>
      );
    case 'bloqueado':
      return (
        <span className="flex h-12 min-w-[6rem] items-center justify-center text-[10px] font-bold uppercase tracking-widest text-gray-600">
          No disponible
        </span>
      );
  }
}
