/**
 * Qué hace cada opción, dicho en términos del box.
 *
 * Está aquí y no repartido por los componentes porque es lo que decide si el
 * dueño puede configurar su box solo o tiene que llamarnos. La regla al
 * escribirlas: cada frase dice QUÉ PASA EN EL BOX si se cambia, no qué columna
 * se modifica. "Días de gracia: 3" no le dice nada a nadie; "después del corte
 * se le esperan 3 días antes de marcarlo en mora" sí.
 *
 * Nada de jerga: no se dice "jsonb", ni "webhook", ni "RLS", ni "cron".
 */

import type { ClaveCredencial, Paso } from './types';

export const TITULO_PASO: Record<Paso, string> = {
  box: 'Tu box',
  plans: 'Tus planes',
  billing: 'Cómo cobras',
  athletes: 'Tus atletas',
  automations: 'Avisos automáticos',
};

export const RESUMEN_PASO: Record<Paso, string> = {
  box: 'El nombre, el teléfono y la ciudad. Es lo que ven tus atletas.',
  plans: 'Cuánto vale entrenar en tu box y cada cuánto se paga.',
  billing: 'Qué día se cobra, cuántos días esperas y si aceptas pago en línea.',
  athletes: 'Sube tu lista o crea los primeros a mano.',
  automations: 'Qué avisos quieres que salgan solos, y desde cuándo de verdad.',
};

/** Las explicaciones de la pantalla de configuración permanente. */
export const AYUDA = {
  // ---- El box ---------------------------------------------------------------
  nombre: 'Como lo conocen tus atletas. Sale en los mensajes y en los recibos.',
  ciudad: 'Para los festivos y para los informes. No se muestra a los atletas.',
  telefono:
    'El número por el que te escriben. También es a donde llegan las alertas internas si no pones otro.',
  nit: 'Tu NIT o cédula. Sale en las facturas que le entregas a tus atletas.',
  zonaHoraria:
    'Decide qué día es "hoy" para los cobros y los mensajes. Si queda mal, el cobro del día 5 sale el 4 de madrugada.',
  logo: 'Se ve en la aplicación de tus atletas. Cuadrado y con fondo claro se ve mejor.',
  color: 'El color de los botones de tu box.',

  // ---- Cobros ---------------------------------------------------------------
  diaCorte:
    'El día del mes que se le propone a un atleta nuevo. Cada atleta puede tener el suyo: el que entró el 20 sigue pagando el 20.',
  diasGracia:
    'Después del corte, cuántos días le esperas antes de marcarlo en mora. Con 0 queda en mora el mismo día.',
  pagoEnLinea:
    'Deja que el atleta pague desde la aplicación con tarjeta, PSE o Nequi. Necesita que conectes tu cuenta de Wompi en Integraciones.',
  enlacePago:
    'Mientras no tengas pasarela, este es el enlace que se pega en los mensajes de cobro (tu Nequi, tu Daviplata o tu link de Bold).',

  // ---- Mensajes -------------------------------------------------------------
  simulacion:
    'El sistema prepara los mensajes y te los muestra, pero NO los manda. Déjalo encendido la primera semana: vas a ver exactamente qué habría recibido cada atleta.',
  mensajesEncendidos:
    'El interruptor general. Apagado, no se prepara ni se manda nada, ni siquiera en simulación.',
  horarioSilencioso:
    'Entre qué horas se le puede escribir a un atleta, en la hora de tu box. Fuera de esa franja el mensaje espera al día siguiente en vez de perderse.',
  topeMensual:
    'Cuántos mensajes automáticos puede recibir un mismo atleta al mes. Es lo que evita que alguien bloquee el número del box.',
  topeDiario:
    'Cuántos al día. Con 1, si dos avisos caen el mismo día sale el más importante y el otro se descarta.',
  telefonoAlertas:
    'A dónde llegan los avisos internos ("Juan lleva 3 semanas sin venir"). Si lo dejas vacío, llegan al teléfono del box.',

  // ---- Reservas -------------------------------------------------------------
  abreReserva:
    'Con cuánta antelación se puede apartar cupo. 168 horas es una semana.',
  cierraReserva:
    'Hasta cuántos minutos antes de la clase se puede reservar. Después, el cupo ya no se mueve.',
  cancelaSinPenalizacion:
    'Hasta cuántos minutos antes puede cancelar sin que le cueste nada. Es el plazo que le da tiempo al de la lista de espera.',
  politicaCancelacionTarde:
    'Qué pasa si cancela después de ese plazo.',
  listaEspera:
    'Cuando la clase se llena, el siguiente queda anotado y entra solo si alguien cancela.',
  topeListaEspera: 'Cuántos caben en la lista de espera de cada clase.',
  politicaNoShow:
    'Qué haces con el que reservó y no llegó. Ese cupo se lo quitó a alguien.',
  noShowGastaBono:
    'Si el que no llegó pierde la clase de su bono. Con planes ilimitados no cambia nada.',
  bloqueoPorMora:
    'Si un atleta con el pago vencido puede seguir reservando. Enciéndelo solo si de verdad vas a cerrarle la puerta: el sistema no avisa por ti.',
  saltarFestivos: 'Los festivos colombianos no generan clases en la parrilla.',
  semanasAdelante: 'Cuántas semanas de clases se crean por adelantado.',
  permitirSinReserva: 'Si le puedes marcar asistencia a alguien que llegó sin reservar.',
} as const;

/** Cada credencial: cómo se llama para el dueño y de dónde la saca. */
export const CREDENCIALES: Record<
  ClaveCredencial,
  { etiqueta: string; ayuda: string; secreta: boolean }
> = {
  wompi_public_key: {
    etiqueta: 'Llave pública',
    ayuda: 'Empieza por pub_test_ (pruebas) o pub_prod_ (producción). Está en el panel de Wompi, en Desarrolladores → Llaves de API.',
    secreta: false,
  },
  wompi_private_key: {
    etiqueta: 'Llave privada',
    ayuda: 'Empieza por prv_. Con ella se cobran las mensualidades a tu cuenta, así que no se la pases a nadie.',
    secreta: true,
  },
  wompi_integrity_secret: {
    etiqueta: 'Secreto de integridad',
    ayuda: 'Firma cada cobro para que nadie pueda cambiarle el monto por el camino.',
    secreta: true,
  },
  wompi_events_secret: {
    etiqueta: 'Secreto de eventos',
    ayuda: 'Con este comprobamos que el aviso de "pago aprobado" vino de Wompi y no de otra persona.',
    secreta: true,
  },
  whatsapp_phone_number_id: {
    etiqueta: 'Identificador del número',
    ayuda: 'No es el número de teléfono: es el "Phone number ID" que muestra Meta en WhatsApp → Configuración de la API.',
    secreta: false,
  },
  whatsapp_token: {
    etiqueta: 'Token permanente',
    ayuda: 'El token del usuario del sistema en Meta. Si se vence, los mensajes dejan de salir y aparece el aviso aquí.',
    secreta: true,
  },
};

export const AYUDA_PASARELA: Record<'wompi' | 'whatsapp_cloud', string> = {
  wompi:
    'Tus llaves de Wompi, para que la plata de tus mensualidades entre a TU cuenta. Sin esto, tus atletas no pueden pagar en línea.',
  whatsapp_cloud:
    'Opcional. Con esto los mensajes salen solos. Sin esto también funciona: el sistema te los deja listos y tú das un clic para enviarlos por WhatsApp.',
};

/** Lo que se le dice al dueño sobre el secreto que acaba de guardar. */
export const NOTA_SECRETOS =
  'Una vez guardada, una llave secreta no se puede volver a ver: solo te mostramos en qué termina y desde cuándo está puesta. Si la pierdes, genérala otra vez en el panel de tu proveedor y pégala de nuevo aquí.';
