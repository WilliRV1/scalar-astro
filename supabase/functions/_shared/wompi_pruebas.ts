// =============================================================================
// Pruebas de las firmas y del armado del enlace de Wompi
// =============================================================================
// Se ejecuta sin credenciales y sin red:
//
//   deno run supabase/functions/_shared/wompi_pruebas.ts
//   node --experimental-strip-types supabase/functions/_shared/wompi_pruebas.ts
//
// Lo que NO prueba (y no puede probar sin credenciales de Wompi): que Wompi
// acepte la firma que generamos. Se verifica que la firma se construya
// EXACTAMENTE como describe la documentación y que el verificador rechace lo
// que tiene que rechazar. Ver docs/10-wompi.md, sección "Qué queda por
// verificar".
//
// VERIFICAR: el ejemplo publicado en docs.wompi.co/docs/colombia/eventos/ no se
// puede reproducir — el hash que muestra la página no corresponde a la cadena
// que la propia página construye con sus propios valores (se probaron también
// el orden invertido, con separadores, sin timestamp y HMAC: ninguno da). Por
// eso aquí se firma con vectores propios y la confirmación definitiva es un
// evento real de sandbox.
// =============================================================================

import {
  ambienteDeLlave,
  armarEnlaceDeCheckout,
  cadenaDeIntegridad,
  type EventoWompi,
  firmaDeIntegridad,
  generarReferencia,
  igualesEnTiempoConstante,
  sha256Hex,
  valorPorRuta,
  verificarFirmaDeEvento,
} from './wompi.ts';

let fallos = 0;

function chk(condicion: boolean, etiqueta: string): void {
  if (condicion) {
    console.log('  ok ·', etiqueta);
  } else {
    console.log('  FALLO ·', etiqueta);
    fallos++;
  }
}

/** Firma un evento como lo haría Wompi, para poder probar el verificador. */
async function firmarComoWompi(evento: EventoWompi, secreto: string): Promise<string> {
  let cadena = '';
  for (const ruta of evento.signature.properties) {
    cadena += String(valorPorRuta(evento.data, ruta));
  }
  cadena += String(evento.timestamp) + secreto;
  return (await sha256Hex(cadena)).toUpperCase();
}

function eventoDePrueba(propiedades: string[], marca: number): EventoWompi {
  return {
    event: 'transaction.updated',
    data: {
      transaction: {
        id: '113636-1735689600-12345',
        status: 'APPROVED',
        amount_in_cents: 18000000,
        reference: 'SCL-0D000000-F000123-YHQKCZJDZC',
        currency: 'COP',
        payment_method_type: 'NEQUI',
      },
    },
    environment: 'test',
    signature: { properties: propiedades, checksum: '' },
    timestamp: marca,
  };
}

const SECRETO_EVENTOS = 'test_events_SOLO_PARA_PRUEBAS';
const SECRETO_INTEGRIDAD = 'test_integrity_SOLO_PARA_PRUEBAS';

// ============================ 1 · Firma de integridad =======================
// Fuente: docs.wompi.co · Widget & Checkout Web
console.log('1 · firma de integridad del enlace');
chk(
  cadenaDeIntegridad('REF1', 2490000, 'COP', SECRETO_INTEGRIDAD) ===
    `REF12490000COP${SECRETO_INTEGRIDAD}`,
  'sin expiración: referencia + monto + moneda + secreto',
);
chk(
  cadenaDeIntegridad('REF1', 2490000, 'COP', SECRETO_INTEGRIDAD, '2026-09-20T15:00:00.000Z') ===
    `REF12490000COP2026-09-20T15:00:00.000Z${SECRETO_INTEGRIDAD}`,
  'con expiración: la expiración va ANTES del secreto',
);
chk(
  (await firmaDeIntegridad('REF1', 2490000, 'COP', SECRETO_INTEGRIDAD)) ===
    (await sha256Hex(`REF12490000COP${SECRETO_INTEGRIDAD}`)),
  'la firma es el SHA-256 en hexadecimal de esa cadena',
);

// ============================ 2 · Firma del evento ==========================
console.log('2 · verificación de la firma del evento');
{
  const ev = eventoDePrueba(
    ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
    1758100000,
  );
  ev.signature.checksum = await firmarComoWompi(ev, SECRETO_EVENTOS);

  chk((await verificarFirmaDeEvento(ev, SECRETO_EVENTOS)).valido, 'un evento bien firmado se acepta');
  chk(
    !(await verificarFirmaDeEvento(ev, 'test_events_OTRO')).valido,
    'firmado con otro secreto se rechaza',
  );

  // El ataque que importa: alguien reenvía el evento con otro monto.
  const manipulado = JSON.parse(JSON.stringify(ev)) as EventoWompi;
  manipulado.data.transaction!.amount_in_cents = 100;
  chk(
    !(await verificarFirmaDeEvento(manipulado, SECRETO_EVENTOS)).valido,
    'cambiar el monto invalida la firma',
  );

  const enMinusculas = JSON.parse(JSON.stringify(ev)) as EventoWompi;
  enMinusculas.signature.checksum = ev.signature.checksum.toLowerCase();
  chk(
    (await verificarFirmaDeEvento(enMinusculas, SECRETO_EVENTOS)).valido,
    'el checksum se compara sin distinguir mayúsculas de minúsculas',
  );
}

// `properties` cambia con el tiempo y entre eventos: la documentación lo avisa
// expresamente, así que jamás puede estar fijo en el código.
{
  const ev = eventoDePrueba(
    ['transaction.reference', 'transaction.status', 'transaction.id'],
    1758100001,
  );
  ev.signature.checksum = await firmarComoWompi(ev, SECRETO_EVENTOS);
  chk(
    (await verificarFirmaDeEvento(ev, SECRETO_EVENTOS)).valido,
    'se respeta el orden de properties que trae CADA evento',
  );
}

console.log('3 · eventos malformados');
{
  const ev = eventoDePrueba(['transaction.id', 'transaction.no_existe'], 1758100002);
  ev.signature.checksum = 'DA_IGUAL';
  const r = await verificarFirmaDeEvento(ev, SECRETO_EVENTOS);
  chk(
    !r.valido && r.motivo.includes('no_existe'),
    'una propiedad firmada que falta se rechaza, no se asume vacía',
  );
}
chk(
  !(await verificarFirmaDeEvento(
    { data: {}, signature: { properties: [], checksum: 'x' }, timestamp: 1 } as unknown as EventoWompi,
    SECRETO_EVENTOS,
  )).valido,
  'un evento sin properties se rechaza',
);
chk(
  !(await verificarFirmaDeEvento(
    { data: {}, signature: { properties: ['a'], checksum: '' }, timestamp: 1 } as unknown as EventoWompi,
    SECRETO_EVENTOS,
  )).valido,
  'un evento sin checksum se rechaza',
);
chk(
  !(await verificarFirmaDeEvento(
    { data: {}, signature: { properties: ['a'], checksum: 'x' } } as unknown as EventoWompi,
    SECRETO_EVENTOS,
  )).valido,
  'un evento sin timestamp se rechaza',
);

// ============================ 4 · Enlace de checkout ========================
console.log('4 · armado del enlace');
{
  const url = armarEnlaceDeCheckout({
    llavePublica: 'pub_test_XYZ',
    referencia: 'SCL-0D000000-F000123-YHQKCZJDZC',
    montoEnCentavos: 18000000,
    moneda: 'COP',
    firmaDeIntegridad: 'abc123',
    urlDeRetorno: 'https://box.scalar.app/pago',
    expiracionISO: '2026-09-20T15:00:00.000Z',
    correoDelCliente: 'atleta@ejemplo.co',
    nombreDelCliente: 'Juan Pérez',
  });
  const u = new URL(url);

  chk(
    u.origin + u.pathname === 'https://checkout.wompi.co/p/',
    'apunta al Checkout Web documentado',
  );
  chk(
    u.searchParams.get('public-key') === 'pub_test_XYZ' &&
      u.searchParams.get('currency') === 'COP' &&
      u.searchParams.get('amount-in-cents') === '18000000' &&
      u.searchParams.get('reference') === 'SCL-0D000000-F000123-YHQKCZJDZC' &&
      u.searchParams.get('signature:integrity') === 'abc123',
    'lleva los cinco campos obligatorios',
  );
  chk(
    url.includes('signature%3Aintegrity='),
    'los dos puntos de signature:integrity van codificados en la URL',
  );
  chk(
    u.searchParams.get('expiration-time') === '2026-09-20T15:00:00.000Z' &&
      u.searchParams.get('redirect-url') === 'https://box.scalar.app/pago' &&
      u.searchParams.get('customer-data:email') === 'atleta@ejemplo.co',
    'expiración, retorno y datos del cliente viajan en la URL',
  );
  chk(!url.includes('phone-number'), 'no se manda el teléfono: su formato está sin verificar');
}

// ============================ 5 · Referencia ================================
console.log('5 · referencia de pago');
{
  const ref = generarReferencia('0d000000-0000-4000-8000-000000000001', 'F-000123');
  chk(/^[A-Za-z0-9_-]{6,255}$/.test(ref), `solo usa caracteres que Wompi admite (${ref})`);
  chk(ref.startsWith('SCL-0D000000-F000123-'), 'lleva el box y la factura dentro');

  const muchas = new Set(
    Array.from({ length: 5000 }, () =>
      generarReferencia('0d000000-0000-4000-8000-000000000001', 'F-000123')),
  );
  chk(muchas.size === 5000, '5.000 referencias seguidas no repiten ninguna');
}

// ============================ 6 · Varios ====================================
console.log('6 · varios');
chk(
  ambienteDeLlave('pub_test_x') === 'test' &&
    ambienteDeLlave('pub_prod_x') === 'prod' &&
    ambienteDeLlave('otra_cosa') === 'desconocido',
  'el ambiente se deduce del prefijo de la llave pública',
);
chk(
  igualesEnTiempoConstante('abc', 'abc') &&
    !igualesEnTiempoConstante('abc', 'abd') &&
    !igualesEnTiempoConstante('abc', 'abcd'),
  'la comparación en tiempo constante distingue lo que debe',
);

console.log(fallos === 0 ? '\nFIRMAS Y ENLACE WOMPI OK' : `\n${fallos} FALLOS`);
if (fallos > 0) throw new Error(`${fallos} pruebas fallaron`);
