# 07 — Cumplimiento legal en Colombia

> **Aviso**: esto es un mapa de lo que hay que resolver, no asesoría jurídica. Antes de
> firmar el primer contrato, que un abogado revise el contrato, la política de tratamiento
> de datos y el acuerdo de encargo. Es una inversión de una sola vez que después se reusa
> con cada cliente.

## Protección de datos personales (Ley 1581 de 2012 — Habeas Data)

Vas a manejar datos de cientos de personas que **no son tus clientes** (los atletas del
box). Eso te pone dentro del régimen de protección de datos, sí o sí.

### Quién es quién

| Figura | Quién | Responsabilidad |
|---|---|---|
| **Responsable del tratamiento** | El box (tu cliente) | Es el dueño de la relación con el atleta; obtiene la autorización |
| **Encargado del tratamiento** | Tú / Scalar | Tratas los datos por cuenta del box, siguiendo sus instrucciones |
| **Titular** | El atleta | Tiene derecho a conocer, actualizar, rectificar y suprimir sus datos |

Esta distinción es central: **tú no puedes usar los datos de los atletas de un box para
nada distinto a prestarle el servicio a ese box.** Nada de usarlos para vender a otros
boxes, ni para marketing propio.

### Qué hay que tener

1. **Acuerdo de encargo de tratamiento de datos**, como anexo del contrato con cada box.
   Define finalidades, medidas de seguridad, subencargados (Supabase, Meta, Vercel, la
   pasarela), qué pasa al terminar el contrato (devolución y borrado), y notificación de
   incidentes.
2. **Política de tratamiento de la información** publicada en el sitio, y **aviso de
   privacidad** visible al momento de recolectar datos.
3. **Autorización del atleta**, capturada dentro del producto al activar su cuenta, con
   registro de fecha y origen (`athletes.consent_data_at`). No una casilla premarcada.
4. **Autorización separada y explícita para datos sensibles.** Lesiones, condiciones
   médicas, peso corporal y fotos son **datos sensibles**. Requieren autorización aparte,
   se puede negar sin perder el servicio, y merecen controles más estrictos. Lo más
   prudente para v1: **campos médicos opcionales, visibles solo para el staff, con
   autorización propia.**
5. **Canal de atención al titular** (un correo tipo `datos@…`) y procedimiento para
   responder consultas en 10 días hábiles y reclamos en 15, contados como manda la ley.
6. **Registro Nacional de Bases de Datos (RNBD) ante la SIC**: aplica a personas jurídicas
   y a ciertas sociedades según sus activos. Verificar si aplica a tu figura (persona
   natural vs. SAS) antes de operar.
7. **Función de exportar y borrar** los datos de un atleta, dentro del producto. No es solo
   legal: es una funcionalidad que se muestra en la demo y da confianza.

### Diseño técnico que respalda lo anterior

- Datos sensibles en columnas aparte, con RLS más estricta y acceso registrado en
  `audit_log`.
- Borrado lógico + purga real a los 90 días.
- Cifrado en reposo (lo da Supabase) y en tránsito (TLS).
- Copias de seguridad con vencimiento definido.
- Un incidente de seguridad se notifica a la SIC y a los afectados: hay que tener escrito
  el procedimiento *antes* de necesitarlo.

## WhatsApp y mensajes comerciales

- **Opt-in previo y demostrable** para escribirle a un atleta. Lo exige Meta y también el
  régimen de protección de datos.
- Los mensajes de **marketing** (reactivación, cumpleaños, promociones) necesitan
  autorización de contacto comercial y mecanismo de salida. Los de **utilidad**
  (recordatorio de un cobro que el atleta ya contrató) tienen menos fricción, pero igual
  requieren que el dato se haya obtenido lícitamente.
- Guardar la evidencia del consentimiento: fecha, canal, y texto que aceptó.

## Facturación

Dos temas distintos que no hay que confundir:

1. **Tú le facturas al box.** Si eres persona natural no responsable de IVA, basta cuenta
   de cobro; si constituyes una SAS o superas los topes, entras en facturación electrónica
   ante la DIAN. Se resuelve con un proveedor como Alegra o Siigo — **no se programa**.
2. **El box le factura a sus atletas.** Esto es del box, no tuyo. Scalar genera un
   **recibo interno**, y hay que decirlo explícitamente en el contrato y en la interfaz:
   *"este documento no es una factura electrónica válida ante la DIAN"*. Si un box
   necesita facturación electrónica real, se integra con su proveedor en v2. **No te
   conviertas en proveedor tecnológico de facturación electrónica: es un producto entero
   y un régimen aparte.**

## Contrato de servicio (SaaS)

Cláusulas que no pueden faltar:

| Cláusula | Por qué |
|---|---|
| Objeto: licencia de uso, no venta de software | Evita que el cliente crea que el código es suyo |
| Precio, forma de pago y **cláusula de aumento anual (IPC + puntos)** | Sin esto, quedas congelado en el precio inicial |
| **Vigencia de la tarifa promocional de fundador** | Ver [05](./05-negocio-precio-gtm.md) |
| Propiedad de los datos: **son del box**, con exportación completa al terminar | Es lo primero que pregunta un cliente prudente |
| Propiedad intelectual del software: **es tuya** | Especialmente importante habiendo empezado como un regalo |
| Nivel de servicio: disponibilidad objetivo, horario de soporte, tiempo de respuesta | Delimita el soporte antes de que te llamen un domingo |
| Respaldos y recuperación | Tranquilidad para el cliente |
| Limitación de responsabilidad (tope: lo pagado en los últimos 3–6 meses) | Que un error de cobro no te cueste el patrimonio |
| Causales y procedimiento de terminación, con preaviso | Salida ordenada de lado y lado |
| Confidencialidad | Estándar |
| Anexo: acuerdo de encargo de datos | Obligatorio |
| Autorización de uso de marca y testimonio (para los pilotos) | Es parte de lo que pagas con el descuento de fundador |

## Forma societaria

Empezar como persona natural es válido para los primeros pilotos. Antes del cliente 5,
evaluar **constituir una SAS**: separa tu patrimonio personal del riesgo del negocio (un
incidente de datos, un error de cobro), da seriedad frente a clientes que preguntan por
RUT y factura, y ordena los ingresos recurrentes. Consultar con un contador el momento y
el costo.
