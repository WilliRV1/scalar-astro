import { useLayoutEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { formatCents } from '../../../shared/lib/money';
import './landing.css';

/**
 * Portada pública de ventas, con la identidad de Kovat (docs/19-marca.md).
 *
 * Tres reglas de esta página, y ninguna es de diseño:
 *
 *   1. El precio va publicado y en pesos. Es el argumento, no un adorno.
 *   2. No se dice "CrossFit": es marca ajena y en Cali no hay un solo afiliado.
 *   3. Nada que no sea cierto hoy. Ni testimonios, ni logos, ni cifras de clientes, y lo que
 *      todavía no funciona se dice en su propia sección.
 */

/** El nombre público. Pasa a "Kovat" cuando la SIC responda (docs/19-marca.md §6). */
const MARCA = 'Scalar';

/** Se configura al compilar; si falta, la página no inventa un número y ofrece el registro. */
const WHATSAPP = String(import.meta.env.VITE_CONTACTO_WHATSAPP ?? '').replace(/[^\d]/g, '');
const MENSAJE_WHATSAPP = `Hola, tengo un box y quiero ver cómo funciona ${MARCA}.`;

const PRECIO_ARRANQUE_CENTAVOS = 4_990_000;
const PRECIO_REGULAR_CENTAVOS = 9_900_000;

/** "$49.900", para el marcador: sin el espacio que pone Intl entre el signo y la cifra. */
function paraMarcador(centavos: number): string {
  return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(centavos / 100)}`;
}

const COMPARACION: { tema: string; hoy: string; conScalar: string }[] = [
  {
    tema: 'Quién te debe',
    hoy: 'Revisar la lista atleta por atleta.',
    conScalar: 'La cartera ordenada por días de mora, con el mensaje de cobro ya escrito.',
  },
  {
    tema: 'Quién dejó de venir',
    hoy: 'Te enteras cuando ya se fue.',
    conScalar: 'Un aviso cuando alguien lleva días sin aparecer, a tiempo para escribirle.',
  },
  {
    tema: 'Cupos de la clase de las 6 a. m.',
    hoy: 'Mensajes en el grupo hasta que alguien cuenta.',
    conScalar: 'Reserva con cupo y lista de espera.',
  },
  {
    tema: 'La marca de sentadilla de un atleta',
    hoy: 'En un cuaderno, si alguien la anotó.',
    conScalar: 'En su ficha, con la evolución.',
  },
  {
    tema: 'Cuánto entró y cuánto salió',
    hoy: 'Sumar a mano al final del mes.',
    conScalar: 'Ingresos menos gastos, mes a mes, sin sumar nada.',
  },
];

const FUNCIONES: { clave: string; titulo: string; items: string[] }[] = [
  {
    clave: 'plata',
    titulo: 'La plata',
    items: [
      'El cobro de cada atleta se genera solo, el día de corte que le toca.',
      'La cartera por días de mora: por vencer, de 1 a 7, de 8 a 30 y más de 30.',
      'Pagos registrados con la foto del comprobante.',
      'Gastos, lo que vence en el mes, como el arriendo y los servicios, e insumos con aviso cuando se acaba el magnesio.',
      'Ingresos, gastos y resultado de cada mes, y cuánto entra fijo por mensualidades.',
    ],
  },
  {
    clave: 'clases',
    titulo: 'Las clases',
    items: [
      'Horarios que se crean solos semana a semana, sin los festivos.',
      'Reservas con cupo y lista de espera.',
      'Asistencia de cada clase.',
    ],
  },
  {
    clave: 'entrenamiento',
    titulo: 'El entrenamiento',
    items: [
      'El WOD del día y el resultado de cada atleta.',
      'Marcas personales con su evolución.',
    ],
  },
  {
    clave: 'atletas',
    titulo: 'Los atletas',
    items: [
      'Una ficha con los campos que tu box necesite, como la talla de camiseta o el contacto de emergencia.',
      'Tu Excel se importa tal como lo tienes hoy.',
      'Aviso de quién dejó de venir.',
      'Coaches con los permisos que tú decidas: quién ve la plata y quién no.',
    ],
  },
];

const PASOS: { titulo: string; texto: string }[] = [
  {
    titulo: 'La demo, en tu box',
    texto: 'Veinte minutos, con tus propios datos. Si no te sirve, ahí queda.',
  },
  {
    titulo: 'Migramos tu Excel',
    texto: 'Atletas, planes y fechas de corte, tal como los tienes hoy. Lo hacemos nosotros.',
  },
  {
    titulo: 'Configuras tus clases',
    texto: 'La puesta en marcha te lleva paso a paso: horarios, cupos y reglas de reserva.',
  },
  {
    titulo: 'Llega el día de corte',
    texto: 'Cada cobro se genera solo y la cartera se arma sin abrir el Excel.',
  },
];

const PENDIENTES: { titulo: string; texto: string }[] = [
  {
    titulo: 'Mensajes que salen solos',
    texto:
      'Hoy el sistema deja cada mensaje escrito y tú lo envías desde tu WhatsApp con un toque.',
  },
  {
    titulo: 'Pago en línea de tus atletas',
    texto:
      'El cobro por PSE y tarjeta con tu propia cuenta de Mercado Pago está construido y en pruebas.',
  },
];

function Marcador() {
  const encendido = paraMarcador(PRECIO_ARRANQUE_CENTAVOS);
  // Los segmentos apagados de un display: cada dígito es un 8 sin luz.
  const apagado = encendido.replace(/\d/g, '8');

  return (
    <figure className="l-marcador">
      <figcaption className="l-marcador__rotulo">Lo que paga tu box por {MARCA}, al mes</figcaption>
      <p className="l-display">
        <span className="l-oculto">{formatCents(PRECIO_ARRANQUE_CENTAVOS)}</span>
        <span className="l-display__capa l-display__apagado" aria-hidden="true">
          {apagado}
        </span>
        <span className="l-display__capa l-display__encendido" aria-hidden="true">
          {[...encendido].map((caracter, i) => (
            <span key={i} className="l-display__digito" style={{ '--i': i } as CSSProperties}>
              {caracter}
            </span>
          ))}
        </span>
      </p>
      <div className="l-marcador__pie">
        <p>Precio para los primeros cinco boxes.</p>
        <p>
          Desde el sexto, <span className="l-numeros">{formatCents(PRECIO_REGULAR_CENTAVOS)}</span>.
        </p>
      </div>
    </figure>
  );
}

function Llamado({ enlaceWhatsApp }: { enlaceWhatsApp: string | null }) {
  if (!enlaceWhatsApp) {
    return (
      <div className="l-acciones">
        <Link to="/registro" className="k-boton k-boton--primario">
          Registrar mi box
        </Link>
      </div>
    );
  }
  return (
    <div className="l-acciones">
      <a href={enlaceWhatsApp} target="_blank" rel="noreferrer" className="k-boton k-boton--primario">
        Pedir la demo por WhatsApp
      </a>
      <Link to="/registro" className="l-enlace">
        o registra tu box sin esperar la demo
      </Link>
    </div>
  );
}

export default function Landing() {
  const enlaceWhatsApp = WHATSAPP
    ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(MENSAJE_WHATSAPP)}`
    : null;

  // La landing va siempre en claro; la app sigue el modo del celular. Antes de pintar, para que no
  // parpadee en oscuro.
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    const antes = raiz.dataset.tema;
    raiz.dataset.tema = 'claro';
    return () => {
      if (antes) raiz.dataset.tema = antes;
      else delete raiz.dataset.tema;
    };
  }, []);

  return (
    <div className="landing">
      <a href="#contenido" className="l-salto k-boton k-boton--secundario">
        Saltar al contenido
      </a>

      <div className="l-contenedor">
        <header className="l-cabecera">
          <Link to="/inicio" className="l-marca" aria-label={`${MARCA}, inicio`}>
            {MARCA}
          </Link>
          <nav aria-label="Principal" className="l-navegacion">
            <a href="#funciones" className="k-boton k-boton--fantasma l-navegacion__ancla">
              Qué hace
            </a>
            <a href="#precio" className="k-boton k-boton--fantasma l-navegacion__ancla">
              Precio
            </a>
            <Link to="/entrar" className="k-boton k-boton--secundario">
              Entrar
            </Link>
          </nav>
        </header>
      </div>

      <main id="contenido">
        <section className="l-contenedor l-heroe" aria-labelledby="titular">
          <div>
            <h1 id="titular" className="l-titular">
              La plataforma para boxes en Colombia.
            </h1>
            <p className="l-bajada">
              Mensualidades, cartera en mora, reservas de clase y marcas de tus atletas, en un
              mismo sistema que manejas desde el celular.
            </p>
            <Llamado enlaceWhatsApp={enlaceWhatsApp} />
            <p className="l-nota">Demo de 20 minutos en tu box, en Cali, con tus propios datos.</p>
          </div>
          <Marcador />
        </section>

        <section className="l-seccion" aria-labelledby="productos">
          <div className="l-contenedor">
            <h2 id="productos" className="l-titulo">
              Un sistema para tu box, y pronto para tus competencias.
            </h2>
            <div className="l-productos">
              <article className="l-producto" aria-labelledby="producto-box">
                <div className="l-producto__cabeza">
                  <h3 id="producto-box" className="l-producto__nombre">
                    Box
                  </h3>
                </div>
                <p>
                  Mensualidades y cartera, clases y reservas, el WOD y las marcas de cada atleta. Es
                  lo que funciona hoy y lo que vas a ver en la demo.
                </p>
                <a href="#funciones" className="l-enlace">
                  Ver todo lo que hace
                </a>
              </article>
              <article className="l-producto" aria-labelledby="producto-competencias">
                <div className="l-producto__cabeza">
                  <h3 id="producto-competencias" className="l-producto__nombre">
                    Competencias
                  </h3>
                  <span className="l-estado">En construcción</span>
                </div>
                <p>
                  Inscripciones, heats y resultados de las competencias que organiza tu box, con la
                  misma cuenta y los mismos atletas.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="l-seccion" aria-labelledby="hoy">
          <div className="l-contenedor">
            <h2 id="hoy" className="l-titulo">
              Hoy la mensualidad está en un Excel y el horario, en un grupo de WhatsApp.
            </h2>
            <p className="l-texto">
              Funciona hasta que un atleta deja de venir sin que nadie lo note, o hasta que el día
              de corte toca revisar la lista uno por uno para saber quién pagó.
            </p>

            <table className="l-tabla">
              <caption className="l-oculto">
                Cómo se resuelve cada tarea hoy y cómo se resuelve con {MARCA}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Lo que necesitas saber</th>
                  <th scope="col">Con el Excel y el grupo</th>
                  <th scope="col">Con {MARCA}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARACION.map((fila) => (
                  <tr key={fila.tema}>
                    <th scope="row">{fila.tema}</th>
                    <td className="l-tabla__hoy" data-etiqueta="Con el Excel y el grupo">
                      {fila.hoy}
                    </td>
                    <td data-etiqueta={`Con ${MARCA}`}>{fila.conScalar}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="l-mensaje">
              <div>
                <h3 className="l-subtitulo">El mensaje de cobro sale escrito, a nombre de tu box</h3>
                <p className="l-texto">
                  Lo envías desde tu propio WhatsApp con un toque. El nombre, el valor y la fecha
                  de este ejemplo son inventados; el texto es el que usa el sistema.
                </p>
              </div>
              <blockquote className="l-cita">
                <p>
                  Hola Camila, tu mensualidad de{' '}
                  <span className="l-numeros">{formatCents(18_000_000)}</span> venció el 8 de
                  septiembre. ¿Nos ayudas con el pago?
                </p>
              </blockquote>
            </div>
          </div>
        </section>

        <section className="l-seccion" aria-labelledby="funciones">
          <div className="l-contenedor">
            <h2 id="funciones" className="l-titulo">
              Esto ya funciona, y es lo que vas a ver en la demo.
            </h2>
            <div className="l-funciones">
              {FUNCIONES.map((grupo) => (
                <div key={grupo.clave} className={`l-grupo l-grupo--${grupo.clave}`}>
                  <h3 className="l-subtitulo">{grupo.titulo}</h3>
                  <ul className="l-lista">
                    {grupo.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="l-seccion" aria-labelledby="pasos">
          <div className="l-contenedor">
            <h2 id="pasos" className="l-titulo">
              Del Excel al sistema en cuatro pasos, y el primero es una demo en tu box.
            </h2>
            <ol className="l-pasos">
              {PASOS.map((paso) => (
                <li key={paso.titulo}>
                  <h3 className="l-subtitulo">{paso.titulo}</h3>
                  <p>{paso.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="l-seccion" aria-labelledby="precio">
          <div className="l-contenedor">
            <h2 id="precio" className="l-titulo">
              Sin instalación y sin permanencia.
            </h2>
            <dl className="l-condiciones">
              <dt>Los primeros cinco boxes</dt>
              <dd>
                <strong>{formatCents(PRECIO_ARRANQUE_CENTAVOS)}</strong> al mes. Es precio de
                arranque: después de dos meses de uso pasa a{' '}
                <strong>{formatCents(PRECIO_REGULAR_CENTAVOS)}</strong>, con un mes de aviso.
              </dd>
              <dt>Desde el sexto box</dt>
              <dd>
                <strong>{formatCents(PRECIO_REGULAR_CENTAVOS)}</strong> al mes.
              </dd>
              <dt>Instalación</dt>
              <dd>Sin costo. Tu Excel lo migramos nosotros.</dd>
              <dt>Permanencia</dt>
              <dd>Ninguna. Si te quieres ir, te entregamos tus datos.</dd>
              <dt>Cómo se paga</dt>
              <dd>Mes a mes, por Nequi.</dd>
            </dl>
          </div>
        </section>

        <section className="l-seccion" aria-labelledby="pendiente">
          <div className="l-contenedor">
            <h2 id="pendiente" className="l-titulo">
              Lo que todavía no hace
            </h2>
            <ul className="l-pendientes">
              {PENDIENTES.map((p) => (
                <li key={p.titulo}>
                  <h3 className="l-subtitulo">{p.titulo}</h3>
                  <p>{p.texto}</p>
                </li>
              ))}
            </ul>
            <p className="l-texto">
              Tampoco vas a ver testimonios ni logos de clientes: somos nuevos y no los vamos a
              inventar.
            </p>
          </div>
        </section>

        <section className="l-cierre" aria-labelledby="contacto">
          <div className="l-contenedor">
            <h2 id="contacto" className="l-titulo">
              Te contesta la persona que construyó el sistema.
            </h2>
            <p className="l-texto">
              Escríbenos y llevamos la demo a tu box, con tus datos. Soporte por WhatsApp de lunes
              a viernes, de 8:00 a 18:00.
            </p>
            <Llamado enlaceWhatsApp={enlaceWhatsApp} />
          </div>
        </section>
      </main>

      <footer className="l-contenedor l-pie">
        <p>
          {MARCA}. Hecho en Cali para boxes de entrenamiento funcional. No estamos afiliados a
          ninguna marca registrada de entrenamiento.
        </p>
        <nav aria-label="Enlaces del pie">
          <Link to="/entrar" className="l-enlace">
            Entrar
          </Link>
          <Link to="/registro" className="l-enlace">
            Registrar mi box
          </Link>
        </nav>
      </footer>
    </div>
  );
}
