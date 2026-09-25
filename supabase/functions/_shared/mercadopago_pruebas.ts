// =============================================================================
// Pruebas de la firma, la preferencia y la consulta de Mercado Pago
// =============================================================================
// Se ejecuta sin credenciales y sin red:
//
//   deno run supabase/functions/_shared/mercadopago_pruebas.ts
//   node --experimental-strip-types supabase/functions/_shared/mercadopago_pruebas.ts
//
// Lo que NO prueba: que Mercado Pago acepte la preferencia tal cual ni la
// variante exacta del manifiesto de la firma. Eso solo lo confirma un evento
// real (ver docs/20-mercadopago.md, "Qué queda por verificar").
// =============================================================================

import {
  ambienteDeToken,
  centavosDesdeMonto,
  consultarPago,
  crearPreferencia,
  cuerpoDePreferencia,
  estadoIntentoDesde,
  fechaParaMercadoPago,
  hmacSha256Hex,
  manifiestosPosibles,
  montoDesdeCentavos,
  parsearXSignature,
  resumenDePago,
  verificarFirmaMercadoPago,
} from './mercadopago.ts';

let fallos = 0;

function chk(condicion: boolean, etiqueta: string): void {
  if (condicion) {
    console.log('  ok ·', etiqueta);
  } else {
    console.log('  FALLO ·', etiqueta);
    fallos++;
  }
}

const SECRETO = 'clave_secreta_SOLO_PARA_PRUEBAS';

// ============================ 1 · Cabecera x-signature =======================
console.log('1 · cabecera x-signature');
{
  const f = parsearXSignature('ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839');
  chk(f?.ts === '1704908010' && f?.v1?.startsWith('618c85'), 'se leen ts y v1');
  chk(parsearXSignature(' v1=abc , ts=1 ')?.ts === '1', 'el orden y los espacios no importan');
  chk(parsearXSignature('ts=1') === undefined, 'sin v1 no hay firma');
  chk(parsearXSignature(null) === undefined, 'sin cabecera no hay firma');
}

// ============================ 2 · Manifiesto =================================
console.log('2 · manifiesto');
{
  const m = manifiestosPosibles('123456', 'req-1', '1704908010');
  chk(m[0] === 'id:123456;request-id:req-1;ts:1704908010;', 'la variante oficial va primero, con ";" final');
  chk(m.includes('id:123456;request-id:req-1;ts:1704908010'), 'también se contempla sin ";" final');

  const alfa = manifiestosPosibles('ABC123', null, '1');
  chk(alfa[0] === 'id:abc123;ts:1;', 'alfanumérico en minúsculas y sin request-id se omite el tramo');
  chk(alfa.includes('id:ABC123;ts:1;'), 'y también tal cual llegó');
}

// ============================ 3 · HMAC y verificación =======================
console.log('3 · HMAC-SHA256 y verificación');
{
  // Vector conocido (RFC 2104 / Wikipedia).
  chk(
    (await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog')) ===
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    'HMAC-SHA256 contra un vector conocido',
  );

  const ts = '1758800000';
  const v1 = await hmacSha256Hex(SECRETO, `id:987654321;request-id:abc-def;ts:${ts};`);
  const bien = await verificarFirmaMercadoPago({
    xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'abc-def', dataId: '987654321', secreto: SECRETO,
  });
  chk(bien.valido && bien.variante === 0, 'un aviso firmado como documenta Mercado Pago se acepta (variante oficial)');

  const otroSecreto = await verificarFirmaMercadoPago({
    xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'abc-def', dataId: '987654321', secreto: 'otro',
  });
  chk(!otroSecreto.valido, 'con otro secreto se rechaza');

  const otroPago = await verificarFirmaMercadoPago({
    xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'abc-def', dataId: '111', secreto: SECRETO,
  });
  chk(!otroPago.valido, 'cambiar el id del pago invalida la firma');

  const enMayusculas = await verificarFirmaMercadoPago({
    xSignature: `ts=${ts},v1=${v1.toUpperCase()}`, xRequestId: 'abc-def', dataId: '987654321', secreto: SECRETO,
  });
  chk(enMayusculas.valido, 'v1 se compara sin distinguir mayúsculas');

  const sinPunto = await hmacSha256Hex(SECRETO, `id:987654321;request-id:abc-def;ts:${ts}`);
  const variante = await verificarFirmaMercadoPago({
    xSignature: `ts=${ts},v1=${sinPunto}`, xRequestId: 'abc-def', dataId: '987654321', secreto: SECRETO,
  });
  chk(variante.valido && variante.variante > 0, 'la variante sin ";" final se acepta y se distingue');

  chk(
    !(await verificarFirmaMercadoPago({ xSignature: null, xRequestId: 'x', dataId: '1', secreto: SECRETO })).valido,
    'sin x-signature se rechaza',
  );
  chk(
    !(await verificarFirmaMercadoPago({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'x', dataId: null, secreto: SECRETO })).valido,
    'sin data.id se rechaza',
  );
  chk(
    !(await verificarFirmaMercadoPago({ xSignature: `ts=${ts},v1=zzz`, xRequestId: 'x', dataId: '1', secreto: SECRETO })).valido,
    'un v1 que no es hexadecimal se rechaza',
  );
}

// ============================ 4 · Estados y dinero ==========================
console.log('4 · estados y dinero');
chk(estadoIntentoDesde('approved') === 'approved' && estadoIntentoDesde('APPROVED') === 'approved', 'approved → approved');
chk(
  ['pending', 'in_process', 'authorized', 'in_mediation'].every((e) => estadoIntentoDesde(e) === 'pending'),
  'los estados intermedios → pending',
);
chk(estadoIntentoDesde('rejected') === 'declined' && estadoIntentoDesde('cancelled') === 'voided', 'rejected → declined, cancelled → voided');
chk(estadoIntentoDesde('refunded') === 'refunded' && estadoIntentoDesde('charged_back') === 'refunded', 'refunded y charged_back → refunded');
chk(estadoIntentoDesde('inventado') === undefined, 'un estado desconocido no se mapea a nada');

chk(centavosDesdeMonto(180000) === 18000000, '180.000 pesos son 18.000.000 centavos');
chk(centavosDesdeMonto(49900.004) === 4990000, 'los decimales de la API se redondean a centavos');
chk(montoDesdeCentavos(4990000) === 49900, '4.990.000 centavos son 49.900 pesos');
chk(montoDesdeCentavos(18000000n) === 180000, 'también desde bigint');

// ============================ 5 · Fechas ====================================
console.log('5 · fechas');
chk(
  fechaParaMercadoPago(new Date('2026-09-28T15:00:00.000Z')) === '2026-09-28T10:00:00.000-05:00',
  'las 15:00 UTC son las 10:00 en Bogotá, con el desplazamiento explícito',
);
chk(
  fechaParaMercadoPago(new Date('2026-10-01T03:30:00.250Z')) === '2026-09-30T22:30:00.250-05:00',
  'las 03:30 UTC del 1 de octubre siguen siendo 30 de septiembre en Bogotá',
);
chk(
  fechaParaMercadoPago(new Date('2026-09-28T15:00:00.000Z'), 0) === '2026-09-28T15:00:00.000+00:00',
  'desplazamiento cero se escribe +00:00',
);

// ============================ 6 · Preferencia ===============================
console.log('6 · preferencia de Checkout Pro');
{
  const cuerpo = cuerpoDePreferencia({
    token: 'TEST-x',
    itemId: 'F-000123',
    titulo: 'Mensualidad Box La Ladera',
    montoCentavos: 18000000,
    moneda: 'COP',
    referencia: 'SCL-0D000000-F000123-YHQKCZJDZC',
    notificationUrl: 'https://scalar.ejemplo.co/functions/v1/mercadopago-webhook/box/0d000000-0000-4000-8000-000000000001',
    backUrl: 'https://scalar.ejemplo.co/',
    expiraISO: '2026-09-28T10:00:00.000-05:00',
    correo: 'atleta@ejemplo.co',
    nombre: 'Juan',
    apellido: 'Pérez',
    metadata: { intent_id: 'abc' },
  });
  const item = (cuerpo.items as Record<string, unknown>[])[0];
  chk(item.unit_price === 180000 && item.currency_id === 'COP' && item.quantity === 1, 'el ítem va en pesos, COP, cantidad 1');
  chk(cuerpo.external_reference === 'SCL-0D000000-F000123-YHQKCZJDZC', 'external_reference es nuestra referencia');
  chk(String(cuerpo.notification_url).endsWith('/mercadopago-webhook/box/0d000000-0000-4000-8000-000000000001'), 'el webhook lleva el box en la ruta');
  chk(
    (cuerpo.back_urls as Record<string, string>).success === 'https://scalar.ejemplo.co/' && cuerpo.auto_return === 'approved',
    'con backUrl van back_urls y auto_return',
  );
  chk(cuerpo.expires === true && cuerpo.expiration_date_to === '2026-09-28T10:00:00.000-05:00', 'la expiración viaja con expires=true');
  chk((cuerpo.payer as Record<string, string>).email === 'atleta@ejemplo.co', 'el pagador se prellena');

  const sinRetorno = cuerpoDePreferencia({
    token: 't', itemId: 'x', titulo: 'x', montoCentavos: 100, moneda: 'COP',
    referencia: 'REF-123456', notificationUrl: 'https://x/y',
  });
  chk(!('back_urls' in sinRetorno) && !('auto_return' in sinRetorno), 'sin backUrl no se manda auto_return (la API lo rechazaría)');
  chk(!('payer' in sinRetorno) && !('expires' in sinRetorno), 'sin datos del pagador ni expiración no se mandan campos vacíos');

  // fetch falso: captura la petición y responde como la API.
  let capturada: { url: string; init: RequestInit } | undefined;
  const fetchFalso = ((url: string, init: RequestInit) => {
    capturada = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ id: '123-abc', init_point: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=123-abc' }), { status: 201 }));
  }) as unknown as typeof fetch;

  const pref = await crearPreferencia({
    token: 'TEST-token', itemId: 'x', titulo: 'x', montoCentavos: 4990000, moneda: 'COP',
    referencia: 'REF-123456', notificationUrl: 'https://x/y', idempotencyKey: 'intent-1',
  }, fetchFalso);
  const cab = capturada!.init.headers as Record<string, string>;
  chk(capturada!.url === 'https://api.mercadopago.com/checkout/preferences' && capturada!.init.method === 'POST', 'se llama POST /checkout/preferences');
  chk(cab.authorization === 'Bearer TEST-token' && cab['x-idempotency-key'] === 'intent-1', 'con Bearer y X-Idempotency-Key');
  chk(pref.id === '123-abc' && pref.init_point.includes('pref_id=123-abc'), 'devuelve id e init_point');

  const fetch500 = (() => Promise.resolve(new Response(JSON.stringify({ message: 'invalid access token' }), { status: 401 }))) as unknown as typeof fetch;
  let mensaje = '';
  try {
    await crearPreferencia({ token: 'TEST-token', itemId: 'x', titulo: 'x', montoCentavos: 100, moneda: 'COP', referencia: 'REF-123456', notificationUrl: 'https://x/y' }, fetch500);
  } catch (e) { mensaje = (e as Error).message; }
  chk(mensaje.includes('401') && mensaje.includes('invalid access token') && !mensaje.includes('TEST-token'), 'un error de la API se resume sin el token');
}

// ============================ 7 · Consulta del pago =========================
console.log('7 · consulta del pago');
{
  let url = '';
  const fetchFalso = ((u: string, init: RequestInit) => {
    url = u;
    chk((init.headers as Record<string, string>).authorization === 'Bearer APP_USR-t', 'la consulta lleva el Bearer del box');
    return Promise.resolve(new Response(JSON.stringify({
      id: 987654321, status: 'approved', status_detail: 'accredited', transaction_amount: 180000,
      currency_id: 'COP', external_reference: 'SCL-X', payment_method_id: 'pse', payment_type_id: 'bank_transfer',
      date_approved: '2026-09-25T10:00:00.000-05:00', live_mode: true,
      payer: { email: 'atleta@ejemplo.co', identification: { number: '123' } },
    }), { status: 200 }));
  }) as unknown as typeof fetch;

  const pago = await consultarPago('APP_USR-t', '987654321', fetchFalso);
  chk(url === 'https://api.mercadopago.com/v1/payments/987654321', 'se consulta GET /v1/payments/{id}');
  chk(pago.status === 'approved' && centavosDesdeMonto(pago.transaction_amount) === 18000000, 'el monto se convierte a centavos');

  const resumen = resumenDePago(pago);
  chk(!('payer' in resumen) && resumen.external_reference === 'SCL-X', 'la bitácora no guarda al pagador');

  let mensaje = '';
  try { await consultarPago('t', '../otra-cosa', fetchFalso); } catch (e) { mensaje = (e as Error).message; }
  chk(mensaje.includes('forma válida'), 'un id de pago raro no llega a la API');
}

// ============================ 8 · Varios ====================================
console.log('8 · varios');
chk(
  ambienteDeToken('TEST-123') === 'test' && ambienteDeToken('APP_USR-123') === 'prod' && ambienteDeToken('otra') === 'desconocido',
  'el ambiente se deduce del prefijo del token',
);

console.log(fallos === 0 ? '\nMERCADO PAGO OK' : `\n${fallos} FALLOS`);
if (fallos > 0) throw new Error(`${fallos} pruebas fallaron`);
