// =============================================================================
// Pruebas de `wompi_recurrente.ts` · sin red, sin secretos, sin Deno
// =============================================================================
// Solo lo que se puede comprobar sin credenciales: el enmascarado del teléfono
// (que es lo que impide guardar un número completo), la normalización a diez
// dígitos que espera la API y la lectura de la respuesta del cobro.
//
// Lo que NO se prueba aquí —porque no se puede sin llaves de Wompi— está en
// docs/12-debito-recurrente.md, en la lista de VERIFICAR.
//
//   deno run supabase/functions/charge-subscriptions/wompi_recurrente_pruebas.ts
//   node --experimental-strip-types supabase/functions/charge-subscriptions/wompi_recurrente_pruebas.ts
// =============================================================================

import {
  enmascararTelefono,
  interpretarCobro,
  type RespuestaApi,
  telefonoNacional,
  type TransaccionCreada,
} from './wompi_recurrente.ts';

let fallos = 0;

function chk(condicion: boolean, etiqueta: string): void {
  if (condicion) {
    console.log(`  ok · ${etiqueta}`);
  } else {
    fallos += 1;
    console.error(`  FALLO · ${etiqueta}`);
  }
}

console.log('1 · teléfono');
chk(telefonoNacional('+573001234567') === '3001234567', 'E.164 se reduce a los diez dígitos');
chk(telefonoNacional('3001234567') === '3001234567', 'diez dígitos se aceptan tal cual');
chk(telefonoNacional('+12025550123') === null, 'un número que no es celular colombiano se rechaza');
chk(telefonoNacional('300123') === null, 'un número incompleto se rechaza');

console.log('2 · enmascarado');
chk(
  enmascararTelefono('+573001234567') === '+57 *** *** 4567',
  'solo sobreviven los últimos cuatro dígitos',
);
chk(
  !/[0-9]{5}/.test(enmascararTelefono('+573001234567')),
  'el enmascarado nunca deja cinco dígitos seguidos (lo mismo que exige el CHECK de la base)',
);
chk(
  enmascararTelefono('basura') === '+57 *** *** ****',
  'un valor ilegible no filtra nada: se enmascara entero',
);

console.log('3 · lectura de la respuesta del cobro');
const aprobada: RespuestaApi<TransaccionCreada> = {
  ok: true,
  estado: 201,
  datos: { id: '113636-1757100000-11111', status: 'APPROVED' },
  mensaje: null,
};
chk(interpretarCobro(aprobada).estado === 'APPROVED', 'una transacción aprobada se lee aprobada');
chk(
  interpretarCobro(aprobada).transaccionId === '113636-1757100000-11111',
  'y trae el identificador con el que se concilia',
);

const rechazada: RespuestaApi<TransaccionCreada> = {
  ok: true,
  estado: 201,
  datos: {
    id: '113636-1757100000-22222',
    status: 'DECLINED',
    status_message: 'Fondos insuficientes',
  },
  mensaje: null,
};
chk(interpretarCobro(rechazada).estado === 'DECLINED', 'un rechazo se lee como rechazo');
chk(
  interpretarCobro(rechazada).mensaje === 'Fondos insuficientes',
  'y conserva el motivo, que es lo que decide si se reintenta',
);

const caida: RespuestaApi<TransaccionCreada> = {
  ok: false,
  estado: 0,
  datos: null,
  mensaje: 'La pasarela no respondió a tiempo',
};
chk(
  interpretarCobro(caida).estado === 'ERROR' && interpretarCobro(caida).codigo === 'SIN_RESPUESTA',
  'una pasarela caída es ERROR (reintentable), no un rechazo del banco',
);

const rechazoDeContrato: RespuestaApi<TransaccionCreada> = {
  ok: false,
  estado: 422,
  datos: null,
  mensaje: 'payment_source_id: no existe',
};
chk(
  interpretarCobro(rechazoDeContrato).estado === 'DECLINED',
  'un 4xx es un rechazo del contrato, no una caída',
);
chk(
  interpretarCobro(rechazoDeContrato).codigo === 'HTTP_422',
  'y deja un código estable para clasificarlo en la base',
);

console.log(fallos === 0 ? '\nCOBRO RECURRENTE (FUNCIONES PURAS) OK' : `\n${fallos} FALLOS`);
if (fallos > 0) {
  throw new Error(`${fallos} pruebas fallaron`);
}
