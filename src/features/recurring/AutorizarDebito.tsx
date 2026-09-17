import { useState } from 'react';
import { Button, Card, Checkbox, ErrorNote, Field, Spinner, TextInput } from '../../shared/ui';
import { formatCents } from '../../shared/lib/money';
import { usePreparacionDeAutorizacion } from './queries';
import { useConfirmarNequi, useIniciarNequi } from './mutations';

/**
 * Autorizar el débito automático sobre Nequi.
 *
 * Por qué Nequi y no tarjeta: es el hueco del mercado (docs/08-mercado-cali.md
 * §5.2) y es lo que la gente de un box de barrio tiene. La tarjeta necesita el
 * widget de Wompi para que el número no pase nunca por nuestro código; el
 * servidor ya la soporta, la pantalla todavía no. Ver docs/12-debito-recurrente.md.
 *
 * Los dos pasos que se ven aquí no son un capricho: Nequi exige que la persona
 * acepte la suscripción EN SU APP. Pretender que quedó sin que la aceptara sería
 * mentirle y dejarla en mora el mes siguiente.
 */
export function AutorizarDebito({
  athleteId,
  telefonoDelAtleta,
  montoMensual,
  diaDeCorte,
}: {
  athleteId: string;
  telefonoDelAtleta: string | null;
  montoMensual: number | null;
  diaDeCorte: number | null;
}) {
  const preparacion = usePreparacionDeAutorizacion(true, athleteId);
  const iniciar = useIniciarNequi();
  const confirmar = useConfirmarNequi();

  const [telefono, setTelefono] = useState(telefonoDelAtleta ?? '');
  const [acepto, setAcepto] = useState(false);
  const [conTope, setConTope] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  const datos = preparacion.data;
  // El tope se propone sobre la mensualidad: si un día llega un cobro mucho
  // mayor, no sale de la cuenta sin que la persona se entere.
  const topeCents = conTope && montoMensual ? montoMensual * 2 : null;

  async function alAutorizar() {
    setError('');
    if (!/^\+[1-9][0-9]{7,14}$/.test(telefono.trim())) {
      setError('Escribe tu celular con indicativo, así: +573001234567.');
      return;
    }
    if (!acepto) {
      setError('Hay que aceptar la autorización para activar el débito.');
      return;
    }
    if (!datos) {
      setError('Todavía no se pudo preparar la autorización. Intenta de nuevo.');
      return;
    }

    try {
      const inicio = await iniciar.mutateAsync({ telefono: telefono.trim(), athleteId });
      setToken(inicio.token);

      // Si Nequi ya lo tenía aprobado, no se le pide nada más.
      if (String(inicio.estado).toUpperCase() === 'APPROVED') {
        await confirmar.mutateAsync({
          token: inicio.token,
          telefono: telefono.trim(),
          version: datos.version,
          topeCents,
          athleteId,
        });
      }
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo iniciar la autorización.');
    }
  }

  async function alConfirmar() {
    setError('');
    if (!token || !datos) return;
    try {
      await confirmar.mutateAsync({
        token,
        telefono: telefono.trim(),
        version: datos.version,
        topeCents,
        athleteId,
      });
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'Nequi todavía no lo confirma.');
    }
  }

  if (preparacion.isLoading) return <Spinner label="Preparando la autorización…" />;

  if (preparacion.isError || (datos && !datos.listo)) {
    return (
      <Card>
        <p className="font-display text-2xl text-black dark:text-white">
          El pago automático no está disponible
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Tu box todavía no tiene activado el cobro con Nequi. Puedes seguir pagando con el
          enlace que te llega cada mes.
        </p>
      </Card>
    );
  }

  const trabajando = iniciar.isPending || confirmar.isPending;

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-display text-2xl text-black dark:text-white">
          Que tu mensualidad se pague sola
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Autorizas una vez y no vuelves a acordarte. Lo quitas cuando quieras, desde aquí.
        </p>
      </div>

      {/* Lo que se le va a cobrar, cuándo y de dónde. Sin esto, autorizar es
          firmar en blanco. */}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border-l-2 border-primary pl-3">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Cuánto</dt>
          <dd className="font-display text-xl text-black dark:text-white">
            {montoMensual ? formatCents(montoMensual) : 'Tu mensualidad'}
          </dd>
        </div>
        <div className="border-l-2 border-primary pl-3">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Cuándo</dt>
          <dd className="font-display text-xl text-black dark:text-white">
            {diaDeCorte ? `Cada día ${diaDeCorte}` : 'En tu fecha de corte'}
          </dd>
        </div>
        <div className="border-l-2 border-primary pl-3">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            De dónde
          </dt>
          <dd className="font-display text-xl text-black dark:text-white">Tu cuenta Nequi</dd>
        </div>
      </dl>

      <Field label="Tu celular de Nequi" hint="Con indicativo: +573001234567">
        <TextInput
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="+573001234567"
          disabled={token !== null}
        />
      </Field>

      {montoMensual !== null && (
        <Checkbox
          label={`No cobrar más de ${formatCents(montoMensual * 2)} en un solo cobro`}
          hint="Si algún mes el cobro fuera mayor, no sale de tu cuenta: te avisamos primero."
          checked={conTope}
          onChange={setConTope}
        />
      )}

      {/* El texto de la autorización se muestra ENTERO, no detrás de un enlace:
          es exactamente lo que queda guardado con la fecha como evidencia. */}
      <div className="grunge-border bg-gray-100 p-4 text-sm leading-relaxed text-gray-700 dark:bg-black dark:text-gray-300">
        {datos?.texto_nequi}
      </div>

      {datos && datos.politicas.length > 0 && (
        <p className="text-xs text-gray-500">
          Al autorizar aceptas también{' '}
          {datos.politicas.map((p, i) => (
            <span key={p.enlace}>
              {i > 0 && ' y '}
              <a
                href={p.enlace}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-primary underline"
              >
                {p.tipo === 'PERSONAL_DATA_AUTH'
                  ? 'el tratamiento de datos'
                  : 'la política de la pasarela'}
              </a>
            </span>
          ))}
          .
        </p>
      )}

      <Checkbox
        label="Autorizo el cobro automático"
        checked={acepto}
        onChange={setAcepto}
        hint="Puedes revocarlo en un toque, cuando quieras."
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {token === null ? (
        <Button onClick={() => void alAutorizar()} disabled={trabajando} className="w-full">
          {trabajando ? 'Conectando con Nequi…' : 'Activar el pago automático'}
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="border-l-4 border-primary bg-primary/10 px-4 py-3 text-sm text-black dark:text-white">
            <strong className="block font-display text-lg">Abre tu app de Nequi</strong>
            Te llegó una solicitud de suscripción. Acéptala y vuelve aquí.
          </p>
          <Button onClick={() => void alConfirmar()} disabled={trabajando} className="w-full">
            {confirmar.isPending ? 'Comprobando…' : 'Ya la acepté en Nequi'}
          </Button>
        </div>
      )}
    </Card>
  );
}
