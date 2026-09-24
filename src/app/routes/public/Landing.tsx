import { Link } from 'react-router-dom';
import { formatCents } from '../../../shared/lib/money';

/**
 * Portada pública de ventas.
 *
 * El mensaje sale de docs/08-mercado-cali.md § 7.3 (los tres ángulos de
 * diferenciación) y de docs/05-negocio-precio-gtm.md (los precios decididos).
 *
 * Tres reglas de esta página, y ninguna es de diseño:
 *
 *   1. **El precio va publicado y en pesos.** La queja más repetida contra la
 *      competencia es el precio escondido o en dólares. Publicarlo no es
 *      transparencia decorativa: es el argumento.
 *   2. **No se dice "CrossFit".** En Cali no hay un solo afiliado, la marca es
 *      ajena y el mercado se llama a sí mismo box de entrenamiento funcional.
 *   3. **Nada que no sea cierto hoy.** Ni testimonios, ni logos, ni "más de X
 *      boxes confían en nosotros". Todavía no los hay, y un dueño de box de
 *      Cali detecta el invento antes de terminar de leerlo.
 */

/** Se configura antes de publicar; si falta, la página no inventa un número. */
const WHATSAPP = String(import.meta.env.VITE_CONTACTO_WHATSAPP ?? '').replace(/[^\d]/g, '');

const MENSAJE_WHATSAPP =
  'Hola, tengo un box y quiero ver cómo funciona Scalar.';

interface Plan {
  nombre: string;
  atletas: string;
  precioCentavos: number;
  paraQuien: string;
  destacado?: boolean;
}

const PLANES: Plan[] = [
  {
    nombre: 'Starter',
    atletas: 'Hasta 40 atletas',
    precioCentavos: 9_900_000,
    paraQuien: 'Box nuevo, entrenador personal o estudio pequeño.',
  },
  {
    nombre: 'Box',
    atletas: 'Hasta 120 atletas',
    precioCentavos: 17_900_000,
    paraQuien: 'El box típico. Te cuesta lo mismo que una mensualidad de un socio.',
    destacado: true,
  },
  {
    nombre: 'Pro',
    atletas: 'Hasta 300 atletas',
    precioCentavos: 32_900_000,
    paraQuien: 'Box grande o con dos salones.',
  },
];

const ANGULOS = [
  {
    titulo: 'Te pagan por Nequi el día 1',
    texto:
      'Cobro automático el día de corte con Nequi, PSE y tarjeta. Si un pago falla, el sistema reintenta y avisa. Tú no escribes un solo mensaje pidiendo plata.',
  },
  {
    titulo: 'Tu atleta no instala nada',
    texto:
      'Reservar el cupo, entrar a la lista de espera y pagar se hacen por WhatsApp, que es donde ya está. El panel es para ti; el atleta solo conversa. Si quiere la app, ahí está, pero nunca es obligatoria.',
  },
  {
    titulo: 'Precio en pesos y a la vista',
    texto:
      'Sin dólares, sin "solicita una cotización" y sin permanencia. Nosotros migramos tu Excel, y cuando algo falla te contesta una persona, no un formulario en otro idioma.',
  },
];

export default function Landing() {
  const enlaceWhatsApp = WHATSAPP
    ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(MENSAJE_WHATSAPP)}`
    : null;

  return (
    <div className="min-h-screen bg-background-dark text-white">
      {/* ------------------------------------------------------------- barra */}
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <span className="font-display text-2xl tracking-wide">
          SCALAR<span className="text-primary">.</span>
        </span>
        <nav className="flex items-center gap-5">
          <Link
            to="/registro"
            className="text-xs font-bold uppercase tracking-widest text-primary transition hover:text-white"
          >
            Registra tu box
          </Link>
          <Link
            to="/entrar"
            className="text-xs font-bold uppercase tracking-widest text-gray-400 transition hover:text-primary"
          >
            Entrar
          </Link>
        </nav>
      </header>

      {/* -------------------------------------------------------------- hero */}
      <section className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
        <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
          Software para boxes de entrenamiento funcional · Colombia
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] sm:text-6xl">
          Los que dejaron de venir hace 15 días y los que te deben hoy.
          <span className="text-primary"> En una sola pantalla.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-gray-300 sm:text-lg">
          Tu box no pierde plata por falta de clientes: la pierde en los que se van en silencio y
          en los cobros que nadie persigue. Scalar cobra solo el día de corte, avisa por WhatsApp y
          te dice cada lunes cómo va el negocio.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#precios"
            className="bg-primary px-6 py-3 font-display text-xl tracking-wide text-white transition hover:bg-red-700"
          >
            Ver precios
          </a>
          {enlaceWhatsApp && (
            <a
              href={enlaceWhatsApp}
              target="_blank"
              rel="noreferrer"
              className="grunge-border px-6 py-3 font-display text-xl tracking-wide text-gray-300 transition hover:border-primary hover:text-primary"
            >
              Escribir por WhatsApp
            </a>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Demo de 20 minutos, presencial en Cali. Se hace con los datos de tu box, no con un box de
          mentira.
        </p>
      </section>

      {/* ------------------------------------------------------- diferencias */}
      <section className="border-y border-white/10 bg-surface-dark">
        <div className="mx-auto grid max-w-5xl gap-px bg-white/10 sm:grid-cols-3">
          {ANGULOS.map((a) => (
            <div key={a.titulo} className="bg-surface-dark p-6">
              <h2 className="font-display text-2xl leading-tight">{a.titulo}</h2>
              <p className="mt-2 text-sm text-gray-400">{a.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ precios */}
      <section id="precios" className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <h2 className="font-display text-3xl sm:text-4xl">Precios, sin vueltas</h2>
        <p className="mt-2 max-w-2xl text-sm text-gray-400">
          En pesos colombianos, por mes, con IVA aparte. Sin permanencia: si te quieres ir, te
          entregamos tus datos y ya. Pagando el año por adelantado, dos meses van gratis.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {PLANES.map((p) => (
            <div
              key={p.nombre}
              className={`grunge-border flex flex-col bg-surface-dark p-6 ${
                p.destacado ? 'border-primary ring-1 ring-primary' : ''
              }`}
            >
              {p.destacado && (
                <span className="mb-2 inline-block w-fit bg-primary px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                  El que más se vende
                </span>
              )}
              <h3 className="font-display text-3xl">{p.nombre}</h3>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                {p.atletas}
              </p>
              <p className="mt-4 font-display text-4xl text-primary">
                {formatCents(p.precioCentavos)}
              </p>
              <p className="text-xs text-gray-500">al mes</p>
              <p className="mt-3 flex-1 text-sm text-gray-400">{p.paraQuien}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grunge-border bg-surface-dark p-6">
            <h3 className="font-display text-2xl">Cadena o varias sedes</h3>
            <p className="mt-2 text-sm text-gray-400">
              Más de 300 atletas o varios salones con manejo separado: se cotiza. Escríbenos y te
              damos un número, no un formulario.
            </p>
          </div>
          <div className="grunge-border bg-surface-dark p-6">
            <h3 className="font-display text-2xl">
              Implementación · {formatCents(45_000_000)}
            </h3>
            <p className="mt-2 text-sm text-gray-400">
              Por única vez, y sí la cobramos porque sí la hacemos:{' '}
              <span className="text-gray-200">
                migramos tu Excel nosotros mismos
              </span>
              , cargamos atletas y marcas, dejamos tus planes y fechas de corte configurados,
              escribimos las plantillas de WhatsApp y capacitamos a tu equipo dos horas. Se condona
              si pagas el año por adelantado, o se difiere a tres cuotas.
            </p>
          </div>
        </div>

        <div className="mt-4 grunge-border bg-black/40 p-5 text-sm text-gray-400">
          <p>
            <span className="font-bold text-white">Precio de fundador.</span> Los primeros boxes que
            entren pagan {formatCents(15_000_000)} de entrada y {formatCents(4_000_000)} al mes
            durante 12 meses, a cambio de un testimonio con números reales y dos referidos. Pregunta
            si todavía queda cupo; cuando se acabe, lo decimos.
          </p>
          <p className="mt-2">
            Incluye 500 mensajes de WhatsApp al mes; el excedente cuesta $60 por mensaje. La tarifa
            sube una vez al año con el IPC más 3 puntos, y eso queda escrito en el contrato desde el
            primer día.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ qué hace ya */}
      <section className="border-t border-white/10 bg-surface-dark">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="font-display text-3xl">Qué hace hoy</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              ['Cobros que se generan solos', 'Cada atleta con su plan y su fecha de corte. El sistema crea el cobro, manda el enlace de pago y lo concilia cuando entra la plata.'],
              ['Cartera al día', 'Quién debe, cuánto y desde cuándo. Con un botón le escribes a todos los que están en mora, sin copiar y pegar.'],
              ['Los que se están yendo', 'Alerta de quién dejó de venir antes de que se vaya del todo. Recuperar un atleta paga el software del mes.'],
              ['Atletas, marcas y asistencia', 'La ficha de cada uno, sus PR y a qué clases entró. Sin Excel y sin cuadernos.'],
              ['Reporte del lunes', 'Cada lunes a las 7 a.m. te llega por WhatsApp cómo cerró la semana: ingresos, asistencia y quién está en riesgo.'],
              ['Tus datos son tuyos', 'Los puedes exportar cuando quieras. El manejo de datos personales sigue la ley colombiana; no vendemos ni compartimos nada.'],
            ].map(([titulo, texto]) => (
              <li key={titulo} className="grunge-border bg-black/30 p-5">
                <h3 className="font-display text-xl">{titulo}</h3>
                <p className="mt-1 text-sm text-gray-400">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ----------------------------------------------------------- honesto */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <h2 className="font-display text-3xl">Lo que no vas a encontrar acá</h2>
        <p className="mt-3 text-sm text-gray-400">
          Somos nuevos. No vas a ver logos de clientes, ni testimonios, ni un “más de 200 boxes
          confían en nosotros”, porque todavía no es cierto y no lo vamos a inventar. Lo que sí
          puedes ver es el sistema funcionando con los datos de tu propio box en una demo de 20
          minutos, y decidir después.
        </p>
      </section>

      {/* -------------------------------------------------------------- cierre */}
      <section className="border-t border-white/10 bg-surface-dark">
        <div className="mx-auto max-w-3xl px-5 py-14 text-center">
          <h2 className="font-display text-3xl sm:text-4xl">
            Si el sistema te recupera un solo atleta al mes, ya se pagó solo.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-400">
            Un atleta que se queda vale más que la mensualidad del software. Ese es todo el
            cálculo.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {enlaceWhatsApp ? (
              <a
                href={enlaceWhatsApp}
                target="_blank"
                rel="noreferrer"
                className="bg-primary px-6 py-3 font-display text-xl tracking-wide text-white transition hover:bg-red-700"
              >
                Pedir la demo por WhatsApp
              </a>
            ) : (
              <Link
                to="/entrar"
                className="bg-primary px-6 py-3 font-display text-xl tracking-wide text-white transition hover:bg-red-700"
              >
                Entrar
              </Link>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-center text-xs text-gray-600">
        <p>
          Detrás de esto hay una persona que contesta, no una mesa de ayuda: soporte por WhatsApp de
          lunes a viernes, de 8:00 a 18:00, con respuesta en menos de 24 horas hábiles.
        </p>
        <p className="mt-2">
          Scalar · Cali, Colombia · Hecho para boxes de entrenamiento funcional. No estamos
          afiliados a ninguna marca registrada de entrenamiento.
        </p>
      </footer>
    </div>
  );
}
