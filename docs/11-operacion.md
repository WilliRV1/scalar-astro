# 11 — Operación: runbook

Este archivo es para cuando algo hay que **hacer**, no para entender el diseño. Está escrito
para el peor momento: un domingo a las nueve de la noche, con un dueño de box escribiendo
por WhatsApp y sin ganas de leer 40 páginas. Cada sección es una lista de pasos.

> Regla general: **nada se arregla entrando a la consola de Supabase a editar filas a mano.**
> Si algo se arregla así, es que falta una función o un botón. Se anota y se construye.

---

## 1. Dar de alta un box (las 48 horas)

La venta se cierra con una promesa concreta: *"en dos días estás operando con tus propios
datos adentro"*. Esta es la lista que la cumple. Viene de [05 § "Cómo vender"](./05-negocio-precio-gtm.md).

### Antes de empezar (mismo día de la firma)

- [ ] Contrato firmado, con la tarifa, la cláusula de incremento (IPC + 3) y, si aplica, las
      contraprestaciones del **precio de fundador** (testimonio, caso de estudio, dos referidos).
- [ ] Pedir por WhatsApp: **el Excel**, el logo, los planes que vende hoy con sus precios, y
      los días de corte que usa.
- [ ] Preguntar el dato que siempre falta: **¿el teléfono de los atletas está en la lista?**
      Sin teléfono no hay WhatsApp, y sin WhatsApp no hay producto.

### Hora 0–4 · Crear el box

1. Entrar al **panel de plataforma** (`/_admin`) con tu usuario de superadministrador.
2. **+ Dar de alta un box**. Llenar nombre, slug, correo del dueño, plan y ciudad.
   - El slug es el subdominio (`box-rubio.scalar.app`). Se escoge una vez y **no se cambia**:
     cambiarlo rompe los enlaces que ya se mandaron.
   - Marcar "precio de fundador" solo si el contrato lo dice.
3. La misma operación crea el box, **siembra sus planes por defecto**, abre la suscripción con
   Scalar y deja al dueño invitado. Es una sola transacción: si algo falla, no queda nada a
   medias y se vuelve a intentar.
4. Copiar el enlace de propiedad y mandárselo al dueño por WhatsApp. Vence en 30 días y solo
   sirve para el correo al que se emitió.

### Hora 4–24 · Migrar

5. Cargar el Excel con el importador (`/coach/importar`). Revisar el informe de la
   importación **fila por fila** con el dueño en una llamada de 15 minutos. Los duplicados y
   los teléfonos mal escritos se arreglan ahí, no después.
6. Crear los planes reales del box y borrar los de ejemplo que no use.
7. Asignar plan y fecha de corte a cada atleta. Este es el paso que más demora y el que más
   valor tiene: es lo que hace que el cobro salga bien el día 1.
8. Cargar las marcas (PR) si el box las tenía. Si no las tenía, no se inventan.

### Hora 24–40 · Configurar

9. Invitar al equipo (`/admin/equipo`): administrador y coaches, con permisos finos. El
   dueño-coach lleva `coach` + "ver la plata", no un rol nuevo.
10. Escribir las plantillas de WhatsApp con las palabras del box. Leerlas en voz alta: si
    suenan a robot, se reescriben.
11. **Prender las automatizaciones en modo simulación durante una semana.** No se envía nada;
    se revisa qué se habría enviado. Un mensaje de cobro equivocado en el primer día cuesta
    el cliente.
12. Configurar la pasarela de pago del box (ver [10](./10-wompi.md)) y hacer **una
    transacción real de prueba** por Nequi, de $1.000, y devolverla.

### Hora 40–48 · Salir en vivo

13. Capacitación de dos horas, presencial, con el equipo completo y con los datos reales ya
    adentro. Guion: cobrar, registrar un pago en efectivo, marcar asistencia, ver quién debe.
14. Apagar el modo simulación.
15. Mandar al dueño: el horario de soporte (lun–vie 8:00–18:00, respuesta en 24 horas
    hábiles) y el enlace de la base de conocimiento.
16. Anotar la fecha de salida en vivo. **A los 7 días**, llamar. No escribir: llamar.

---

## 2. Respaldos y —lo que importa— la restauración

Un respaldo que nunca se restauró no es un respaldo: es una carpeta con archivos.

### Qué hay hoy

| Capa | Qué cubre | Dónde |
|---|---|---|
| Entorno de prueba (widawi) | `pg_dump -Fc` de la base + tar de Storage, **diario a las 3:15 a. m.**, 14 días, en `~/respaldos/scalar` | `deploy/widawi/respaldo-scalar.*` (timer de systemd) |
| Supabase en la nube (cuando exista) | PITR del plan Pro: toda la base, a cualquier segundo de los últimos 7 días | Consola de Supabase |
| Git | Migraciones y código | GitHub |

> Hasta el 2026-09-24 este documento describía un `db-export` a Storage que **nunca existió**.
> Lo que hay es lo de la tabla.

El PITR cubre el desastre grande (se cayó la base). El volcado lógico cubre el desastre
pequeño y mucho más probable: **alguien borró algo y nadie se dio cuenta hasta el martes**.

### Prueba de restauración — **una vez al mes, con fecha en el calendario**

Sin esta prueba no sabemos si tenemos respaldos. Se hace en **staging**, nunca en producción.

```bash
# En widawi. 1. El volcado más reciente
ULTIMO=$(ls -t ~/respaldos/scalar/scalar-db-*.dump | head -1)

# 2. Una base limpia y desechable, con la MISMA imagen de producción
docker run -d --name restaura -e POSTGRES_PASSWORD=x supabase/postgres:17.6.1.136
sleep 15

# 3. Restaurar
docker exec -i restaura pg_restore -U postgres -d postgres --no-owner < "$ULTIMO"

# 4. Comprobar que los datos están de verdad (esto es la prueba, no el paso 3)
docker exec restaura psql -U postgres -c "select count(*) from public.organizations;"
docker exec restaura psql -U postgres -c "select count(*) from public.athletes;"
docker exec restaura psql -U postgres -c "select sum(amount_cents) from public.payments where status='confirmed';"
docker exec restaura psql -U postgres -c "select public.assert_rls_enabled();"

docker rm -f restaura
```

**Criterio de aprobado**, y hay que escribirlo en la bitácora de la prueba:

- El número de atletas por box coincide con producción (± los movimientos del fin de semana).
- La suma de pagos confirmados del último mes cuadra con el reporte de ese mes.
- `select public.assert_rls_enabled();` no levanta excepción: **una base restaurada sin RLS
  es una base abierta**. Este es el error clásico de una restauración apurada.
- Un atleta tomado al azar tiene su plan, su fecha de corte y sus marcas.

Si algo de esto falla, **el respaldo está roto** y es una urgencia, aunque todo funcione en
producción. Se arregla el mismo día.

### Qué hacer si de verdad hay que restaurar producción

1. **Avisar primero.** Un mensaje a todos los boxes: "estamos restaurando, no registren pagos
   hasta nuevo aviso". Un pago registrado durante una restauración se pierde y nadie sabe cuál.
2. Restaurar en un proyecto **nuevo** de Supabase, no encima del que está mal. El que está mal
   es evidencia.
3. Comprobar con los cuatro criterios de arriba.
4. Apuntar el dominio al proyecto nuevo.
5. Escribir qué pasó, en una página, el mismo día. Sin buscar culpables, con la línea de tiempo.

---

## 3. Un box reporta un problema

### Primero: entender qué clase de problema es

| Síntoma | Casi siempre es | Dónde mirar |
|---|---|---|
| "No me deja entrar" | Correo distinto al invitado, o membresía desactivada | `/admin/equipo` del box, con suplantación |
| "Le cobraron dos veces a un atleta" | Un pago registrado a mano además del de la pasarela | `payments` del atleta, por soporte |
| "No me llegó el mensaje" | Plantilla sin aprobar, o el atleta sin consentimiento de WhatsApp | `message_outbox` y el consentimiento del atleta |
| "El box está en solo lectura" | **Suspendido por mora.** No es un bug | Panel de plataforma → estado del box |
| "Se me perdieron atletas" | Filtro de estado, no borrado. Los atletas se archivan, no se eliminan | Filtro "todos" en la lista |

### El procedimiento

1. **Responder en menos de 24 horas hábiles, aunque sea "lo estoy mirando".** El silencio es
   lo que hace que un box cancele, no el bug.
2. Pedir: **qué esperaba, qué pasó, y a qué hora**. Con la hora se encuentra en la bitácora.
3. Reproducir con suplantación (sección 4). No pedir la contraseña **nunca**, por ningún
   motivo, ni aunque el cliente la ofrezca.
4. Si es un error de datos: arreglarlo con la funcionalidad del producto. Si no existe la
   funcionalidad, arreglarlo con una migración, no con un `update` suelto en la consola.
5. Si es un bug: abrirlo en Git con el número de box y la hora, y decirle al cliente cuándo
   va a estar. Una fecha concreta, aunque sea lejana.
6. **Si la misma pregunta llega dos veces, se convierte en un artículo o en un video de 90
   segundos.** Es lo único que evita que el soporte crezca con los clientes.

### Cuando el problema es la mora

Un box suspendido queda en **solo lectura**: entra, ve todo, no puede escribir. Nada se borró.

- Reactivar: panel de plataforma → el box → **Reactivar**. Es inmediato.
- Suspender: mismo sitio → **Suspender**, con el motivo escrito. Queda en la bitácora.
- La cobranza automática (`run_platform_dunning`) marca en mora lo vencido y suspende lo que
  agotó sus días de gracia (10 por defecto). **Antes de que la corra el cron, se llama al
  dueño.** Suspender a un cliente sin haberlo llamado es como se pierde un cliente que sí
  quería pagar.

---

## 4. Suplantar a un usuario para dar soporte

### Por qué existe

Para poder responder "no me cuadra el cobro de Marcela" sin pedirle la contraseña al cliente.
Y para que quede escrito quién miró qué, cuándo y por qué — incluido cuando el que miró
fuiste tú.

### Qué NO es

**No es una llave maestra.** Ser superadministrador no abre la RLS de ningún box: la lista de
atletas, sus teléfonos y sus deudas siguen inaccesibles por la vía normal, y hay una prueba
automática (`supabase/tests/saas.sql`, sección 5) que falla si algún día alguien lo cambia.
Lo que la suplantación habilita son **cifras agregadas del box** y el contexto para entender
el problema.

### Cómo se hace

1. Panel de plataforma (`/_admin`) → el box → **Soporte**.
2. Escribir el motivo, **concreto y en español claro**: "revisar el cobro duplicado de Marcela
   del 3 de octubre". Mínimo 10 caracteres, y no por capricho: el dueño del box puede leer
   ese texto en su bitácora.
3. La sesión dura **una hora** y se cierra sola. Al terminar, cerrarla a mano.
4. Si hay que tocar datos del box, hacerlo con el dueño en la llamada, no por detrás.

### Lo que queda registrado

Cada suplantación escribe una fila en `audit_log` con `action = 'platform.impersonate'`, el
box, tu usuario, la hora y el motivo. Para revisar quién entró a un box:

```sql
select created_at, user_id, after->>'reason' as motivo
from public.audit_log
where org_id = '<uuid del box>' and action = 'platform.impersonate'
order by created_at desc;
```

Si un cliente pregunta "¿ustedes miran mis datos?", la respuesta es enseñarle esa consulta.

---

## 5. Nombrar (o quitar) un superadministrador

No hay pantalla para esto a propósito: se hace con la llave de servicio y se nota.

```sql
-- Nombrar
insert into public.platform_admins (user_id, note)
values ('<uuid del usuario>', 'Soporte por horas desde 2027-01');

-- Quitar (inmediato)
delete from public.platform_admins where user_id = '<uuid>';
```

Se revisa la lista **cada trimestre**. Quien ya no trabaja con nosotros sale el mismo día.

---

## 6. La aplicación instalable (PWA)

- El service worker está escrito a mano en `public/sw.js`. **Se puede leer en cinco minutos**,
  que es justamente el punto: ahí está escrito qué se guarda en el teléfono del cliente.
- Guarda el cascarón de la aplicación (HTML, JS, CSS, iconos). **No guarda ninguna respuesta
  con datos de atletas**: el celular del mostrador lo usa quien esté de turno.
- Instalarla **nunca** es obligatorio, ni para el dueño ni para el atleta. Todo lo esencial
  pasa por WhatsApp ([08 § 7.3](./08-mercado-cali.md)).
- Para publicar una versión nueva basta con desplegar: el navegador detecta el cambio y el
  usuario ve el aviso "hay una versión nueva". Si se cambia la estrategia de caché, hay que
  subir la constante `VERSION` dentro de `public/sw.js`.

### Los iconos de la app

La fuente es `public/icons/icon.svg` (una barra con discos, roja sobre negro). Los PNG
(`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon-180`) se generaron a partir de
esa misma geometría. Si se cambia el SVG hay que regenerarlos con cualquier conversor
(`rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png`) y **mirarlos a tamaño real en un
teléfono**: un icono que no se entiende a 48 píxeles no sirve de nada.

---

## 7. Calendario de operación

| Cuándo | Qué |
|---|---|
| Diario | Revisar `job_runs` con estado `error`. Un cobro que no se generó se nota al día siguiente |
| Lunes | Leer el reporte semanal de cada box antes que el dueño. Si algo se ve raro, llamar tú primero |
| Semanal | Revisar boxes en mora y llamar **antes** de que la cobranza automática los suspenda |
| Mensual | **Prueba de restauración** (sección 2). Con fecha en el calendario, no "cuando se pueda" |
| Trimestral | Revisar la lista de superadministradores y la bitácora de suplantaciones |
| Anual | Aviso de incremento de tarifa (IPC + 3), 30 días antes, por escrito |

---

## 8. Números de referencia

Para no tener que buscarlos cuando alguien pregunta ([05](./05-negocio-precio-gtm.md)):

| Concepto | Valor |
|---|---|
| Starter (hasta 40 atletas) | $99.000 / mes |
| Box (hasta 120) | $179.000 / mes |
| Pro (hasta 300) | $329.000 / mes |
| Cadena (+300) | Cotización |
| Implementación y puesta en marcha | $450.000 por única vez |
| Precio de fundador (primeros 3–5 boxes) | $150.000 de entrada + $40.000 / mes por 12 meses |
| Mensajes de WhatsApp incluidos | 500 / mes · excedente $60 c/u |
| Pago anual | 2 meses gratis |
| Días de gracia antes de suspender | 10 |

> **Variables de entorno de la portada pública**: el botón de WhatsApp de la página de ventas
> sale de `VITE_CONTACTO_WHATSAPP` (el número en formato internacional, solo dígitos:
> `573001234567`). Si no está configurada, la página **no inventa un número**: simplemente no
> muestra el botón.
