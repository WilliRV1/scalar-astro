# 18 — Análisis de riesgos

> Este documento identifica y califica riesgos, no viabilidad financiera ni técnica (ver
> [16-viabilidad-financiera.md](./16-viabilidad-financiera.md) y
> [17-viabilidad-tecnica.md](./17-viabilidad-tecnica.md), en construcción en paralelo). No se
> repiten cálculos de costos ni inventario técnico de aquí en adelante, salvo para remitir a
> ellos. Marcado explícito: **ESTIMACIÓN** = opinión propia sin fuente dura; el resto trae URL.

## 1. Resumen ejecutivo: los 5 riesgos más urgentes

Antes de cobrarle al primer box real, en este orden:

1. **`.env` con credenciales de Supabase sigue en `master`, público en GitHub, y la llave
   anónima del proyecto `coach` no se ha rotado porque la comparte el CRM personal del dueño**
   ([docs/14](./14-auditoria-2026-09-24.md)). Es la única puerta ya abierta hoy mismo, con
   riesgo activo mientras no se cierre. **Impacto: alto. Probabilidad: alta (es un hecho ya
   consumado, falta solo que alguien lo explote).**
2. **No existe acuerdo de encargo de tratamiento de datos ni autorización separada para datos
   sensibles de salud**, y el producto ya guarda `athlete_health` y `athlete_custom_sensitive`
   de personas que no son clientes del box sino terceros (los atletas). Vender sin esto es
   operar fuera de la Ley 1581 desde la primera factura.
3. **Cero transacciones reales han pasado por Wompi** ([docs/10](./10-wompi.md),
   [docs/12](./12-debito-recurrente.md)): ni la firma de integridad, ni la verificación de
   eventos, ni el flujo de Nequi se han probado contra el proveedor real. El primer cobro de un
   atleta real es también la primera prueba de integración completa.
4. **Infraestructura personal (widawi) mezclada con infraestructura de negocio**: el mismo
   servidor y la misma llave de Supabase que usa el CRM personal del dueño ahora procesan datos
   de salud y de cobro de terceros que le pagan a un box.
5. **Fundador único, no técnico en el código, dependiente de este asistente**: los bugs reales
   de producción encontrados horas después del lanzamiento de la demo ([docs/14](./14-auditoria-2026-09-24.md))
   muestran que el ciclo detectar→arreglar hoy depende enteramente de una sesión de Claude Code
   disponible.

---

## 2. Riesgos por categoría

### 2.1 Legal y regulatorio

#### R-L1 · Falta de acuerdo de encargo de tratamiento y autorización de datos sensibles

**Qué es.** El producto trata datos de atletas —terceros respecto al contrato, que es con el
box— incluyendo `athlete_health` (lesiones, condiciones médicas) y `athlete_custom_sensitive`.
La Ley 1581 de 2012 exige que el tratamiento de datos sensibles cuente con **autorización
explícita, previa e informada del titular**, separada de la autorización general, y que quien
trata los datos por cuenta de otro (Scalar, como encargado) tenga definidas por contrato las
finalidades, medidas de seguridad y qué pasa al terminar la relación
([Función Pública — Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981)).
`docs/07` ya diagnostica esto correctamente pero **el contrato y la política aún no se han
redactado ni firmado con ningún box** (confirmar contra el estado real al momento de leer esto).

**Probabilidad: alta.** No es un riesgo hipotético: hoy no existe el documento, y el roadmap
([docs/06](./06-roadmap.md) "Trabajo comercial en paralelo") lo deja para "mientras va F2–F3",
que puede no haber terminado cuando entre el primer box real.

**Impacto: alto.** Una sanción de la SIC llega hasta 2.000 SMMLV, puede ser sucesiva mientras
persista el incumplimiento, y contempla suspender el tratamiento hasta 6 meses
([SIC — reporte de incidentes de seguridad](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad)).
Para una operación de un solo fundador, media sanción ya es letal, y en un mercado boca a boca
de 21 boxes conocidos entre sí ([docs/08](./08-mercado-cali.md)), el daño reputacional escala
más rápido que la multa.

**Mitigación concreta.**
- Redactar (con abogado, una sola vez, reusable) el contrato de encargo de tratamiento como
  anexo estándar antes de la primera firma, no después.
- En el producto: capturar la autorización de datos sensibles como un paso separado y
  explícito al activar la ficha del atleta, con registro de fecha, canal y texto exacto
  aceptado (igual patrón que ya usa `recurring_authorizations` para el débito — el precedente
  técnico ya existe en el propio repo).
- Campos médicos opcionales y visibles solo para staff, tal como ya recomienda `docs/07`;
  confirmar que la política del producto ("cualquier coach lee lesiones") se decidió —
  `docs/14` lo deja como pendiente de decisión de producto, no de bug.

#### R-L2 · Registro ante el RNBD de la Superintendencia de Industria y Comercio

**Qué es.** El Registro Nacional de Bases de Datos es obligatorio para sociedades y entidades
con activos totales superiores a **100.000 UVT** (≈ $5.237.400.000 COP en 2026), y para toda
persona jurídica de naturaleza pública
([SIC — quiénes están obligados](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cuales-personas-estan-obligadas-realizar-el-registro-de-bases-de-datos-personales-en-el-rnbd)).

**Lectura para Scalar.** Mientras el dueño opere como **persona natural** (que es la forma
societaria actual, según `docs/07`), el umbral de activos no aplica de la misma manera que a
una sociedad: el RNBD está pensado para personas jurídicas y entidades sin ánimo de lucro sobre
ese umbral de activos, no para personas naturales por defecto. **Esto no es una exención
garantizada** — es una lectura razonable de la norma, pero la obligación específica para
persona natural que trata datos de terceros por encargo no quedó completamente resuelta en esta
investigación. `docs/07` ya lo señala como pendiente de verificar.

**Probabilidad: baja mientras siga como persona natural y por debajo del umbral de activos;
sube a media-alta en cuanto se constituya la SAS** que `docs/07` recomienda antes del cliente 5,
porque ahí sí aplica el régimen de persona jurídica.

**Impacto: medio.** No registrar cuando corresponde es una infracción administrativa (no penal),
pero se suma a la exposición general de Ley 1581 de R-L1.

**Mitigación concreta.** Resolver la duda concreta con un abogado (no con búsqueda web) en el
mismo momento en que se evalúe constituir la SAS, porque el umbral y el sujeto obligado cambian
juntos. No es un bloqueante para las primeras ventas como persona natural, pero sí antes de
escalar a 5+ boxes.

#### R-L3 · Uso de vocabulario CrossFit ("WOD", "AMRAP", "Rx/Scaled")

**Qué es.** `docs/08` ya decidió no usar "CrossFit" (marca registrada de CrossFit LLC, sin
afiliados en Cali). La pregunta nueva es si términos como *WOD*, *AMRAP* o *Rx* —que
`docs/14` señala que siguen apareciendo en plantillas de mensajes y en la landing— son también
marca registrada.

**Lo que se encontró.** "WOD" (Workout of the Day) es un acrónimo genérico usado por
decenas de marcas de entrenamiento funcional distintas a CrossFit; no hay evidencia de que
CrossFit LLC lo haya registrado ni litigado como marca propia
([Avvo — ¿"WOD" es propiedad de CrossFit?](https://www.avvo.com/legal-answers/is-the-term-wod-owned-by-crossfit-can-you-use-that-2189137.html)).
CrossFit sí defiende activamente su marca principal contra intentos de "genericide" —que la
declaren término genérico— y ha ganado todos los casos presentados hasta ahora
([Rockridge Law — CrossFit y el genericide](https://rockridgelaw.com/2024/02/22/crossfit-trademark-protection-the-fight-against-genericide/)),
pero eso protege el nombre "CrossFit" en sí, no el vocabulario de entrenamiento que circula en
todo el sector funcional.

**Probabilidad: baja.** AMRAP, Rx y Scaled son terminología de entrenamiento de uso extendido,
no marcas registradas identificadas en esta investigación.

**Impacto: bajo si se confirma lo anterior; medio si algún día CrossFit LLC decide litigar
igual (los costos de defenderse, aunque se gane, ya son un golpe para un fundador solo).**

**Mitigación concreta.** El riesgo real y ya confirmado no es el vocabulario genérico sino
**seguir escribiendo "CrossFit" textualmente** en plantillas y en el pie de la landing, que
`docs/14` ya encontró sin corregir (`plantillas.ts:44`, `Landing.tsx:300`). Esa corrección sí
es urgente y no depende de una lectura legal incierta: es simplemente borrar la palabra que ya
se decidió no usar.

#### R-L4 · Responsabilidad por bugs de cobro (cobro de más/de menos)

**Qué es.** `docs/14` documenta bugs reales de producción con severidad A que sí tocan plata o
datos: edición de atleta que borra documento y contacto de emergencia, refetch fallido que
desmonta formularios con datos sin guardar, "marcar pagado"/"borrar" sin confirmación. Ninguno
de los listados es directamente un cobro duplicado o erróneo confirmado en producción, pero el
patrón (errores silenciosos, estados que no se refrescan) es exactamente la clase de bug que
produce uno.

**Marco legal.** Las cláusulas de limitación de responsabilidad son válidas en Colombia bajo
los artículos 1604 y 1616 del Código Civil, pero **no son absolutas**: un tribunal evalúa el
grado de culpa, y si hay culpa grave la cláusula puede quedar inoperante
([Uniandes — restricciones a las cláusulas de limitación de responsabilidad](https://repositorio.uniandes.edu.co/server/api/core/bitstreams/9bfb2381-b5d1-4e32-9483-1e345651c676/content)).
Además, si el box se tratara como consumidor frente a Scalar (lectura poco probable en un
contrato B2B genuino, pero no descartable si el contrato está mal redactado), el Estatuto del
Consumidor **prohíbe de forma absoluta** las cláusulas que exoneren al proveedor de sus
obligaciones legales — se sancionan con ineficacia, no con simple limitación
([Affirma Legal — cláusulas abusivas en Colombia](https://www.affirmalegal.com/blog/clausulas-abusivas-en-contratos-guia-practica-en-colombia/)).

**Probabilidad: media.** El código ya tiene fallas reales de esta familia detectadas en una
sola auditoría de una noche; es razonable esperar más antes de que el producto madure con
tráfico real.

**Impacto: alto si toca plata de un box pequeño** (una diferencia de cobro de unos cientos de
miles de pesos es significativa para un negocio de 40–120 atletas) **y reputacional mayor** en
un mercado de 21 boxes que se conocen entre sí.

**Mitigación concreta.**
- La cláusula de `docs/07` (tope: lo pagado en los últimos 3–6 meses) es razonable y está
  alineada con la doctrina citada — pero **tiene que redactarse de forma que no excluya la
  responsabilidad, solo la limite cuantitativamente**, para no caer en la prohibición absoluta
  de cláusulas exonerativas.
- Priorizar, antes de vender, los ítems de severidad A de `docs/14` relacionados con plata:
  confirmaciones en "marcar pagado"/"borrar", el helper de mensajes de error, y el modo
  simulación encendido la primera semana con cada box nuevo (ya está en el runbook de
  [docs/11](./11-operacion.md)).
- Seguro de responsabilidad civil profesional (E&O / tecnología): no se investigó
  disponibilidad ni costo para un solo fundador en Colombia — **queda en "no se pudo
  verificar"**, pero es la mitigación estándar de la industria para este riesgo exacto.

#### R-L5 · Facturación sin RUT/facturación electrónica lista

**Qué es.** El umbral 2026 para que una persona natural esté obligada a facturar
electrónicamente es de **3.500 UVT de ingresos brutos anuales, ≈ $183.309.000 COP**
([El País — DIAN topes 2026](https://www.elpais.com.co/economia/la-dian-revelo-cuales-son-las-personas-naturales-que-deben-facturar-electronicamente-en-2026-este-es-el-tope-1153.html)).
Con la meta de 10–12 boxes a $179.000/mes ([docs/05](./05-negocio-precio-gtm.md)), el ingreso
recurrente anual objetivo (~$21.5M–$25.8M COP solo de mensualidades, antes de implementación)
está **muy por debajo** de ese umbral en el primer año.

**Probabilidad: baja en el corto plazo** (los primeros 3–5 boxes a precio de fundador generan
mucho menos ingreso que el umbral), **sube con el tiempo** conforme se acerque a la meta de
10–12 boxes más implementación.

**Impacto: bajo-medio.** Mientras esté por debajo del umbral, basta cuenta de cobro, tal como
ya dice `docs/07`. El riesgo real no es DIAN sino **la percepción del cliente**: un box que
pide factura formal y solo recibe cuenta de cobro puede dudar de la formalidad del proveedor,
justo en un mercado donde `docs/08` identifica el "precio opaco" y "soporte que desaparece"
como las quejas dominantes contra la competencia — no dar una respuesta clara sobre facturación
alimenta esa misma desconfianza.

**Mitigación concreta.** Explicar de entrada en el contrato/demo que se emite cuenta de cobro
(no factura electrónica) mientras no se supere el umbral o se constituya SAS, con la fecha en
que eso cambiaría. Vigilar el ingreso acumulado del año contra el tope, no esperar a que la
DIAN lo note.

#### R-L6 · Régimen de protección de datos financieros (PSDP / Ley 2157 de 2021)

**Qué es.** La pregunta era si Scalar, al no tocar directamente el número de tarjeta ni las
credenciales bancarias (eso lo procesa Wompi como pasarela regulada), queda dentro del régimen
de protección de datos financieros. `docs/12` documenta con precisión técnica que **ningún
PAN, CVV ni clave de Nequi entra jamás a la base de Scalar** — hay CHECKs de PostgreSQL que lo
hacen imposible.

**Probabilidad: baja.** Por diseño, Scalar guarda solo referencias (`payment_source_id`,
últimos 4 dígitos, teléfono enmascarado), no datos financieros primarios. Esto es exactamente
la separación que evita el régimen de PCI-DSS y reduce la exposición al de datos financieros
sensibles.

**Impacto: bajo, condicionado a que ese diseño se mantenga.** El riesgo no es el estado
actual, es que alguien "simplifique" el modelo en el futuro y empiece a guardar más de lo
necesario para depurar un problema de soporte.

**Mitigación concreta.** Mantener las CHECKs de la base como línea roja no negociable (ya lo
son) y documentar explícitamente en el contrato con cada box que Scalar **nunca** procesa ni
almacena datos financieros primarios — es un argumento de venta de confianza, no solo defensa
legal.

---

### 2.2 Riesgo del negocio / mercado

#### R-M1 · "Nadie usa software" — ¿oportunidad o síntoma de que no hay demanda?

**Las dos lecturas, evaluadas con la evidencia ya reunida.**

*Lectura pesimista:* si 8 de 8 boxes verificados por navegador real —incluido BeFitness con
167 mil seguidores, el de mayor alcance del censo— no usan ningún sistema de gestión
([docs/15 §7.7](./15-competencia-software.md)), tal vez el mercado ya decidió que no lo
necesita y seguirá sin necesitarlo.

*Lectura optimista, y la más respaldada por la evidencia:* `docs/08` y `docs/15` no encontraron
ausencia de dolor, encontraron **ausencia de oferta local**. Los dolores documentados (cobrar,
saber quién debe, cupo de clase) son específicos y repetidos en fuentes independientes de
dueños de box en español. Y hay una señal concreta de demanda ya materializada: **Box Pro**, un
software hecho en Neiva por un desarrollador sin especialidad en fitness, existe precisamente
porque alguien vio la misma oportunidad — con adopción hoy casi nula ("10+" descargas), lo que
sugiere que la demanda existe pero **nadie la ha capturado bien todavía**, no que no exista
([docs/15 §7.3](./15-competencia-software.md)).

**Cuál es más probable, con qué evidencia.** La lectura optimista es más consistente con los
datos: el mercado colombiano de gimnasios en general **sí adopta software** (Trainingym declara
que "1 de cada 5 gimnasios en Colombia ya usa este software", aunque es dato de un proveedor
sin verificación independiente — se marca así en `docs/15`), y el segmento boutique/franquicia
(Orangetheory con Mindbody, Unique Pilates con Fitco) ya lo usa. Lo que falta específicamente es
la adopción en boxes independientes de entrenamiento funcional en Cali — un vacío de ejecución
comercial local, no de categoría de producto.

**Probabilidad de que el pesimismo se confirme: media.** Es real que vender "algo que nadie
pidió" es más lento y requiere educar al prospecto primero (exactamente lo que ya dice
`docs/05`: la demo muestra primero el problema del propio box, no funcionalidades).

**Impacto si se confirma: alto** — el negocio entero depende de convertir esta lectura
optimista en ventas reales.

**Mitigación concreta.** Ya está en el roadmap: demo que muestra los propios atletas perdidos
del box antes de mostrar features. Lo que falta es una prueba temprana y barata: cerrar 2–3
boxes más además del box 0 **antes** de invertir más tiempo en el módulo de competencias u
otras extensiones — si el segundo y tercer cliente cuestan un esfuerzo de venta desproporcionado
comparado con el box 0 (que ya confiaba en el dueño), es la señal más clara de cuál lectura es
la correcta.

#### R-M2 · Dependencia de un solo comprador inicial (Coach Pipe Rubio)

**Qué es.** Todo el plan de validación (`docs/05` "Fase de validación") depende de que el box 0
se convierta en caso de éxito, testimonio y fuente de referidos. Es también, hoy, la única
fuente de datos reales para calibrar reportes.

**Probabilidad: media.** No hay indicio de que la relación esté en riesgo, pero **cualquier**
plan con un solo cliente ancla tiene este riesgo por construcción — máxime cuando ese box migra
datos reales de atletas que dependen de que el sistema funcione bien desde el día 1.

**Impacto: alto.** Sin el box 0 como referencia, `docs/05` pierde su mecanismo de distribución
central: "los dueños de box se conocen todos entre ellos". Perder al primero antes de tener el
segundo no solo cuesta ese cliente, cuesta la credibilidad para conseguir el siguiente.

**Mitigación concreta.**
- Empezar en paralelo, no en serie, la prospección del cliente 2 y 3 (ya lo dice
  `docs/06`: "Trabajo comercial en paralelo, no esperar a terminar"). No esperar a que el box 0
  esté "perfecto" para tocar la puerta del siguiente.
- Documentar el caso de éxito del box 0 (números reales, con su permiso) tan pronto haya un mes
  completo de datos limpios, no al final del año.
- El modo simulación de una semana ([docs/11](./11-operacion.md)) y la llamada a los 7 días son
  exactamente la mitigación operativa correcta para que el box 0 no se lleve una mala primera
  experiencia — mantenerlos sin saltárselos por prisa de vender rápido.

#### R-M3 · Un competidor grande agrega pagos colombianos

**Qué es.** WodBuster ya integra Wompi ([docs/10](./10-wompi.md), [docs/15](./15-competencia-software.md)).
CrossHero, Fitco y Crossfy no tienen Wompi/PSE/Nequi hoy, pero **no hay barrera técnica alta**
que les impida agregarlo si deciden priorizar el mercado colombiano — es una integración de
API, no un rediseño de producto.

**Probabilidad: media.** CrossHero ya tiene 5 boxes colombianos confirmados y precio publicado
en pesos ([docs/15 §7.4](./15-competencia-software.md)), así que ya invirtió en el mercado
local; agregar Wompi es un paso lógico si les interesa crecer aquí. Ninguno de los tres tiene
evidencia pública de tenerlo en su roadmap hoy, pero tampoco hay evidencia de que no lo estén
evaluando.

**Impacto: alto para el diferenciador de pagos, medio para el negocio completo.** Si Wompi deja
de ser exclusivo, a Scalar le quedan: precio en pesos sin conversión, presencia física en Cali,
soporte del propio creador del producto, y WhatsApp-first — ninguno de esos se copia con una
integración de API.

**Mitigación concreta.** No competir solo en "tenemos Wompi" como argumento de cierre: usar la
combinación completa (precio local + presencia física + soporte directo + WhatsApp) como
posicionamiento, tal como ya recomienda `docs/15 §3`. Avanzar rápido en el débito automático
recurrente real (verificado contra Wompi, no solo contra la base) para que cuando alguien
iguale "tener Wompi" en el papel, Scalar ya lo tenga probado en producción con clientes reales.

#### R-M4 · Estacionalidad y flujo de caja

**Qué es.** La intuición de temporada baja diciembre-enero **no se confirma como está
planteada**: la evidencia muestra que enero es temporada **alta** de inscripciones en gimnasios
colombianos (+20% a +35% de altas respecto a otros meses, alineado con el dato ya citado en
`docs/08` de "+45% de afiliaciones en enero" para boxes específicamente)
([El Colombiano — inscripciones se disparan en enero](https://www.elcolombiano.com/negocios/inscripciones-en-gimnacion-suben-enero-disparan-PN32846595)).

**Dónde sí hay un riesgo real, matizado.** La retención media de un box es de 3–6 meses
([docs/08 §4](./08-mercado-cali.md)), lo que ya implica alta rotación todo el año, no solo en
diciembre. Y aunque enero trae altas nuevas, es razonable esperar (**ESTIMACIÓN**, no hay dato
duro encontrado para boxes específicamente) que **diciembre concentre pausas y cancelaciones**
por vacaciones y gasto navideño, antes de que entren las altas de enero — un desfase de caja de
un mes para el box, que a su vez es el mes en que el box podría atrasarse pagándole a Scalar.

**Probabilidad: media.** El patrón de alta rotación ya está confirmado por la retención de
3–6 meses; el desfase específico de diciembre es una inferencia razonable, no un dato
verificado.

**Impacto: bajo-medio para Scalar directamente** (la mensualidad de Scalar la paga el box, no
depende linealmente de cuántos atletas activos tenga ese mes), **pero indirecto vía mora del
box**: si el box factura menos en diciembre, es más probable que atrase su propio pago a
Scalar, activando la cobranza (`run_platform_dunning`, [docs/11](./11-operacion.md)).

**Mitigación concreta.** Nada que cambiar en el producto — el mecanismo de días de gracia (10,
ya configurado) y la llamada antes de suspender ya cubren esto razonablemente. Sí vale la pena,
al vender, anticipar la conversación de diciembre con el box ("¿cómo manejas tu propia
estacionalidad?") para que la mora de diciembre no sorprenda a nadie.

---

### 2.3 Riesgo operacional y de "bus factor"

#### R-O1 · Fundador único no técnico, dependiente de este asistente

**Qué es.** El dueño no escribe el código: depende de sesiones de Claude Code para cualquier
cambio, incluidos los urgentes. La propia auditoría de esta noche ([docs/14](./14-auditoria-2026-09-24.md))
encontró bugs de severidad A **horas después** de lanzar la demo — el ciclo real de detección
y arreglo hoy pasa entero por tener una sesión disponible y funcionando.

**Cuantificación con lo visto esta noche.** En una sola sesión de auditoría se encontraron 4
bugs de severidad A de pérdida de datos, más operación sin respaldos reales y sin tareas
programadas corriendo. Eso no es una falla puntual: es la textura normal de un producto que
recién se está terminando de construir con agentes en paralelo. Un domingo a las 9 p.m. con un
dueño de box reportando un problema (el escenario que el propio `docs/11` usa como apertura del
runbook) **y sin acceso a una sesión de este asistente ni a un desarrollador humano disponible**
significa: sin diagnóstico, sin arreglo, y el dueño solo puede prometer una fecha sin saber si
la puede cumplir.

**Probabilidad: alta.** No es un riesgo hipotético de "algún día": ya pasó esta misma noche con
un agente que falló por límite de uso, y es estructural mientras el modelo de soporte dependa de
un solo canal.

**Impacto: alto.** Un bug de cobro no resuelto en 24 horas hábiles (el compromiso que
`docs/11` ya promete) rompe la promesa de soporte que es, según `docs/08`, exactamente lo que
diferencia a Scalar de la competencia peor calificada ("el soporte desaparece después de
firmar"). Fallar en esto no es un incidente técnico, es perder el argumento de venta central.

**Mitigación concreta.**
- No prometer SLA de respuesta más agresivo de lo que el dueño puede sostener con su
  disponibilidad real (el runbook ya es realista: 24 horas hábiles, no "inmediato").
- Tener un plan B explícito y escrito para "no tengo acceso a Claude Code ahora": qué hacer,
  a quién llamar, qué se puede resolver desde el panel sin tocar código (suspender/reactivar un
  box, ver la bitácora, revertir con suplantación) — y comunicar honestamente al box qué SÍ se
  puede resolver sin una sesión de desarrollo y qué no.
- `docs/05` ya lo señala: "desde el cliente 8, contratar apoyo de soporte por horas". Ese
  umbral puede ser demasiado tarde si el bug crítico llega con el cliente 2. Vale la pena
  identificar ahora, no en el cliente 8, a una persona técnica de respaldo (aunque sea por
  horas puntuales) para el escenario de indisponibilidad.
- Antes de la primera venta real: correr la prueba de restauración mensual al menos una vez
  (`docs/11 §2`) para saber, con evidencia y no con fe, que el peor escenario (pérdida de la
  base) sí es recuperable sin depender de una sesión activa.

#### R-O2 · Infraestructura personal (widawi) mezclada con la del negocio

**Qué es.** Widawi es el servidor personal del dueño. `docs/14` confirma que **la llave anónima
del proyecto Supabase `coach` la comparte el CRM personal** ("rotarla lo tumba" — decisión
pendiente), y `deploy/widawi/` contiene la configuración de nginx, docker-compose y respaldos
de Scalar corriendo junto a lo que sea que también corra ahí (el propio CLAUDE.md del usuario
confirma que widawi es "mi servidor", usado para su CRM personal y, por lo que sugiere el
contexto, otros servicios propios).

**Probabilidad: alta de que ya exista acoplamiento hoy** (está documentado, no es
hipotético) — la pregunta no es si hay mezcla, sino cuánto tarda en causar un incidente.

**Impacto: alto.** Dos vectores concretos:
1. **Un incidente en el servicio personal (CRM, o cualquier otro que corra ahí) puede tumbar o
   degradar el servicio de un box que paga**, porque comparten servidor.
2. **Un incidente en Scalar (una llave comprometida, una fuga) puede arrastrar datos del CRM
   personal**, precisamente por la llave compartida que hoy nadie rota "porque lo tumba".

Para un negocio que ya procesa datos de salud y de cobro de terceros, este acoplamiento es una
falla de diseño de aislamiento, no un detalle operativo.

**Mitigación concreta.**
- Es la decisión más urgente y más simple de ejecutar de todo este documento: **generar una
  llave anónima nueva y dedicada solo a Scalar**, y coordinar con el CRM personal el corte —
  aunque implique un rato de interrupción planificada del CRM, es preferible a seguir
  compartiendo la superficie de ataque de un negocio con terceros involucrados.
- A mediano plazo (no bloqueante para las primeras ventas, pero sí antes de escalar): separar
  Scalar del servidor personal, hacia un proyecto de Supabase en la nube dedicado —
  `docs/06` F0 ya lo tiene listado como pendiente ("Vincular el proyecto de Supabase y aplicar
  las migraciones a la nube").
- Documentar en el contrato con cada box, con honestidad, en qué infraestructura corre hoy el
  servicio mientras dure esta etapa de transición — no es algo que se pueda ocultar
  indefinidamente en un mercado tan conectado.

#### R-O3 · Continuidad de la relación con Claude Code / límites de uso

**Qué es.** Esta misma noche, un agente falló por límite de tasa (rate limit) durante el
trabajo en paralelo. Si el modelo de desarrollo y soporte de Scalar depende de una suscripción o
plan de este asistente, cualquier cambio de límites, disponibilidad o continuidad del servicio
es un riesgo directo sobre la capacidad de mantener el producto.

**Probabilidad: media.** No hay evidencia de que el acceso esté en riesgo de desaparecer, pero
ya se observó fricción de límites de uso en una sola noche de trabajo intensivo — es razonable
esperar que se repita en momentos de alta demanda (justo cuando más urgente es un arreglo).

**Impacto: alto**, por la misma razón que R-O1: no hay plan B documentado.

**Mitigación concreta.** No es un problema que este documento pueda resolver por sí solo, pero
sí puede nombrarlo: evaluar qué tan reproducible es el estado del proyecto (documentación en
`docs/`, migraciones versionadas, pruebas automáticas) para que **cualquier** desarrollador —no
solo este asistente en particular— pueda retomarlo si hiciera falta. Esa reproducibilidad ya es
alta por construcción (todo versionado, con pruebas), que es la mejor mitigación posible para
este riesgo específico sin gastar dinero en redundancia que hoy no se necesita.

---

### 2.4 Riesgo financiero y de pagos

#### R-F1 · Contracargos y reclamos de cobro desconocido en Wompi

**Qué es.** Cuando un atleta desconoce una transacción (fraude o disputa), es **el comercio**
—el box, no Scalar ni Wompi— quien asume el riesgo del contracargo en transacciones no
presenciales, y quien debe responder con evidencia de la compra dentro de los 5 días hábiles que
pide el banco emisor
([Wompi — reglamento de comercios](https://wompi.com/assets/downloadble/reglamento-Comercios-Colombia.pdf);
[soporte Wompi — cliente desconoce una compra](https://soporte.wompi.co/hc/es-419/articles/10692799825043--Qu%C3%A9-pasa-si-un-cliente-desconoce-una-compra-realizada-por-este-medio-de-pago)).

**Dónde entra Scalar.** Aunque el contracargo es responsabilidad contractual del box frente a
Wompi, **el atleta le va a reclamar primero al box, y el box le va a reclamar a Scalar** si el
cobro salió de un enlace o de un débito automático mal generado por el producto (ej. un cobro
duplicado por el bug ya conocido de reintentos de importación, o una autorización que debió
revocarse y no se revocó a tiempo).

**Probabilidad: media.** El diseño de idempotencia documentado en `docs/10` y `docs/12` es
sólido en el papel (doble candado, pruebas SQL), pero **nada de esto se ha probado contra Wompi
real todavía** — el primer cobro recurrente real es también la primera vez que este diseño se
enfrenta a condiciones reales de red, reintentos del banco y comportamiento no documentado de
la API.

**Impacto: medio.** Un contracargo aislado es manejable; varios en el primer mes de un box
nuevo generan desconfianza rápida en un cliente que apenas está probando el producto.

**Mitigación concreta.** Ya está en el runbook: hacer una transacción real de prueba por Nequi
de $1.000 y devolverla antes de salir en vivo (`docs/11` hora 40–48). Extender esa prueba a
forzar deliberadamente un rechazo y un reintento en sandbox (`docs/12 §6`, paso 9) antes de que
el primer box real dependa del débito automático — no basta con probar el camino feliz.

#### R-F2 · Rechazo o demora en la aprobación de la cuenta de comercio Wompi

**Qué es.** `docs/06` marca esto como bloqueante #2 para vender. El tiempo de revisión de Wompi
es de **1 a 3 días hábiles** para la aprobación inicial, con la documentación (tipo de persona,
actividad económica, cuenta bancaria) y verificación de identidad por selfie y firma digital de
contrato; ajustes de límites posteriores pueden tardar hasta 3 días hábiles adicionales
([Auge Digital — cómo abrir cuenta Wompi 2026](https://augedigital.co/guias/abrir-cuenta-wompi/)).

**Probabilidad: baja-media.** El proceso está documentado como relativamente rápido si la
documentación (RUT, cámara de comercio) está lista de antemano, pero **cada box** que quiera
tener su propia cuenta de Wompi ([docs/10 §1](./10-wompi.md), decisión aún no resuelta:
cuenta única vs. por box) repite este trámite — con 10–12 boxes objetivo, es fricción
multiplicada, no un trámite único.

**Impacto: medio.** Si la decisión final es "cada box con su propia cuenta", cualquier demora
en la aprobación de un box nuevo retrasa directamente su fecha de "operando en 48 horas"
([docs/11](./11-operacion.md)), la promesa central de venta.

**Mitigación concreta.** Iniciar el trámite de Wompi del box 0 y de cada prospecto avanzado
**en paralelo** con la migración del Excel, no después de cerrar la venta — ya está sugerido en
`docs/06` ("Abrir la cuenta Wompi... los trámites tardan"), pero conviene tratarlo como bloqueo
de calendario explícito en el guion de venta de `docs/05`, no como una tarea de fondo.

#### R-F3 · Riesgo cambiario (TRM)

Mencionado aquí solo para dejar constancia de que se identificó: la exposición cambiaria de
Scalar frente a sus propios costos (Supabase, Vercel, Sentry, todos facturados en USD) contra
ingresos en COP. El cálculo cuantitativo de este riesgo es responsabilidad de
[docs/16-viabilidad-financiera.md](./16-viabilidad-financiera.md), que se está redactando en
paralelo — no se recalcula aquí.

---

### 2.5 Riesgo de seguridad y reputacional

#### R-S1 · Fuga de datos de salud o de cobro en un mercado pequeño y conectado

**Qué es.** Cali tiene 21 boxes identificados, la mayoría concentrados geográficamente y —según
`docs/05`— "los dueños de box se conocen todos entre ellos". Un incidente de seguridad con
datos de salud o de pago de un solo box se conoce rápido en todo el mercado direccionable.

**Probabilidad: media**, dado el estado actual de la infraestructura (R-O2, credenciales
expuestas históricamente, `.env` aún en `master`). No es un riesgo bajo mientras esas
condiciones no se cierren.

**Impacto: muy alto y desproporcionado al tamaño del negocio.** En un TAM de 35 boxes
([docs/08 §7.1](./08-mercado-cali.md)), perder la confianza del mercado por un incidente no es
"perder un cliente", es potencialmente cerrar el canal de distribución completo (referidos
boca a boca) que sostiene toda la estrategia de venta de `docs/05`. Sumado a la sanción de la
SIC ya descrita en R-L1 (hasta 2.000 SMMLV, suspensión de actividades hasta 6 meses).

**Mitigación concreta.**
- Cerrar primero lo que ya está identificado como abierto: `.env` fuera de `master`, rotación
  de llaves (R-S2 abajo), CORS fijado, cabeceras de seguridad en nginx — todo ya listado en
  `docs/14` como pendiente.
- Tener redactado **antes** de necesitarlo el procedimiento de notificación de incidentes
  (a la SIC dentro de los 15 días hábiles siguientes a la detección, y a los titulares
  afectados) — `docs/07` ya lo pide, y es exactamente el tipo de documento que no se puede
  improvisar bajo presión.
- El diseño técnico ya ayuda (RLS por fila, aislamiento por `org_id`, tablas sensibles
  separadas con RLS más estricta) — la tarea pendiente es operativa y de higiene de
  credenciales, no de arquitectura.

#### R-S2 · Repositorio público con `.env` expuesto en el historial de `master`

**Qué es.** Confirmado en `docs/06` y `docs/14`: `master` en GitHub sigue conteniendo `.env`
(URL y llave anónima del Supabase `coach`), `fix_schema.sql` y `node_modules/`. El repositorio
es público.

**Probabilidad: alta de exposición ya consumada** (el archivo ya está público y ha estado ahí
un tiempo indeterminado); **la pregunta abierta es si alguien ya lo encontró y lo está usando
o vigilando**, no si es vulnerable — ya lo es.

**Impacto: alto.** Es la llave que hoy comparte el CRM personal del dueño (R-O2): un solo punto
de exposición conecta el riesgo de Scalar con el de infraestructura personal ajena al negocio.

**Mitigación concreta.** Ya está identificada y lista para ejecutar en `docs/14`: mergear la
rama que ya no tiene `.env` a `master` (o hacer el push a mano) y rotar la llave. `docs/14`
marca esto como pendiente de decisión humana, no de código — **es literalmente la tarea más
urgente y más barata de ejecutar de todo este documento**: no requiere desarrollo, solo un
`git push` y decidir cuándo se puede tumbar el CRM un momento para rotar la llave compartida.

---

### 2.6 Riesgo de producto/competencia futura (módulo de competencias)

#### R-C1 · Responsabilidad por pagos de inscripción a eventos físicos

**Qué es.** `docs/15 §5` ya identifica la oportunidad de un módulo de competencias con cobro
por Wompi. Eso trae una categoría de responsabilidad que el resto del producto no tiene: dinero
recibido **para un evento futuro e incierto** (que puede cancelarse por clima, por aforo, por
lesión de un organizador), no por un servicio ya prestado como la mensualidad.

**Riesgos concretos, uno por uno:**
- **Cancelación del evento.** Si Scalar procesa el cobro de inscripción y el evento se cancela,
  ¿quién reembolsa? Hoy `payments.status` contempla `refunded` pero **nada lo escribe**
  automáticamente ([docs/12](./12-debito-recurrente.md)) — ese hueco técnico se vuelve mucho
  más urgente en un módulo de eventos que en mensualidades, porque la expectativa de reembolso
  es inmediata y pública (el atleta paga por algo que no ocurrió, no por un servicio que se
  puede seguir prestando el mes siguiente).
- **Lesión de un atleta durante el evento.** Es responsabilidad del organizador del evento (el
  box o quien lo organice), no de Scalar como software — pero si Scalar procesó el pago y su
  marca aparece en la confirmación, un atleta lesionado puede razonablemente dirigir su primer
  reclamo a quien le cobró, aunque legalmente no sea el responsable.
- **Competidores dedicados ya resuelven parte de esto en su propio terreno** (Competition
  Corner, Circle21) cobrando comisión aparte por transacción, sin resolver moneda colombiana
  ([docs/15 §5.1](./15-competencia-software.md)) — Scalar tendría la ventaja de integrarlo con
  el resto del producto, pero también hereda la responsabilidad que ellos ya delimitan con sus
  propios términos de servicio.

**Probabilidad: baja hoy** (el módulo no está construido), **pero certera si se construye sin
diseñar antes la responsabilidad contractual** — es más fácil evitarlo en el diseño que
corregirlo después de que un evento salga mal.

**Impacto: alto si ocurre**, porque mezcla plata de terceros (organizador del evento, no
necesariamente el box mismo) con la responsabilidad de un incidente físico, que es una
categoría de riesgo completamente distinta a un error de cobro de software.

**Mitigación concreta, antes de construir el módulo, no después:**
- Definir contractualmente, desde el primer diseño, que **el organizador del evento es el
  responsable de la cancelación y del reembolso**, y que Scalar solo procesa el pago —
  paralelo exacto a cómo `docs/07` ya distingue entre Scalar como encargado de tratamiento y
  el box como responsable.
- Implementar de una vez la escritura real de `payments.status = 'refunded'` (hoy pendiente
  para todo el producto, según `docs/12`) antes de lanzar el módulo de competencias, donde el
  reembolso deja de ser una excepción rara y pasa a ser un flujo esperado.
- Términos de inscripción visibles al atleta al pagar (política de cancelación, exención de
  responsabilidad física del software frente al evento) — mismo patrón que ya usa
  `tokenize-payment-method` mostrando "el texto exacto que va a aceptar" antes de autorizar un
  débito.
- No construirlo hasta tener 3–5 boxes estables con el producto base: es una extensión de
  alcance sobre un negocio que, según R-O1, ya está al límite de su capacidad de soporte con lo
  que existe hoy.

---

## 3. Matriz de priorización — los 10 riesgos más importantes

| # | Riesgo | Probabilidad | Impacto | Urgencia antes de vender |
|---|---|---|---|---|
| 1 | R-S2 · `.env` expuesto en `master`, llave sin rotar | Alta | Alto | **Inmediata — antes de cualquier venta** |
| 2 | R-O2 · Infraestructura personal (widawi) mezclada con la del negocio | Alta | Alto | **Inmediata** |
| 3 | R-L1 · Sin acuerdo de encargo ni autorización de datos sensibles | Alta | Alto | **Antes de la primera firma de contrato** |
| 4 | R-F1 / R-L4 · Cero pruebas reales contra Wompi (cobro erróneo, contracargo) | Media | Alto | **Antes del primer cobro real, no solo de la demo** |
| 5 | R-O1 · Fundador único dependiente de este asistente, sin plan B | Alta | Alto | **Antes de comprometer SLA de soporte** |
| 6 | R-S1 · Fuga de datos en mercado pequeño y conectado (consecuencia de 1–2) | Media | Muy alto | Se resuelve mitigando 1 y 2 |
| 7 | R-M2 · Dependencia del box 0 como único caso de éxito | Media | Alto | Prospección en paralelo, ya empezada según `docs/06` |
| 8 | R-L4 · Cláusulas de responsabilidad mal redactadas | Media | Alto | Antes de firmar el primer contrato (junto con 3) |
| 9 | R-F2 · Demora en aprobación de cuenta Wompi por box | Baja-media | Medio | Iniciar trámite en paralelo con cada venta |
| 10 | R-M1 · El mercado no convierte interés en pago | Media | Alto | Validar con cliente 2 y 3, no solo el box 0 |

---

## 4. Mitigaciones recomendadas antes de vender (lista de ejecución)

En orden de qué tan bloqueante es, no de esfuerzo:

1. **Sacar `.env` de `master` y rotar la llave anónima compartida con el CRM** (R-S2, R-O2). Es
   la única tarea de esta lista que no requiere desarrollo nuevo, solo decisión y ejecución.
2. **Redactar y firmar, antes del primer contrato real, el acuerdo de encargo de tratamiento de
   datos y la autorización separada de datos sensibles** (R-L1). Inversión de una sola vez,
   reusable con cada box, tal como ya dice `docs/07`.
3. **Probar el flujo completo contra Wompi real en sandbox**, incluyendo forzar un rechazo y un
   reintento (R-F1, R-L4) — no basta con la transacción de prueba de $1.000 del camino feliz.
4. **Escribir el procedimiento de notificación de incidentes de seguridad** (R-S1) antes de
   necesitarlo: a quién se llama, qué se le dice a la SIC, qué se le dice a cada box afectado,
   en qué plazo.
5. **Definir el plan B operativo para "no tengo acceso a una sesión de desarrollo ahora mismo"**
   (R-O1): qué se puede resolver desde el panel sin tocar código, a quién más se puede llamar.
6. **Cerrar la lista de severidad A de `docs/14` que toca plata o pérdida de datos** antes de
   dar de alta al segundo box real, no solo al primero.
7. **Redactar la cláusula de limitación de responsabilidad con un abogado** que confirme que no
   cae en la prohibición de cláusulas exonerativas absolutas del Estatuto del Consumidor (R-L4).
8. **Correr la prueba de restauración de respaldos al menos una vez**, con fecha real, antes de
   tener datos de un box real en juego (R-O1, `docs/11 §2`).

---

## 5. Fuentes

- [SIC — quiénes están obligados a registrar bases de datos en el RNBD](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cuales-personas-estan-obligadas-realizar-el-registro-de-bases-de-datos-personales-en-el-rnbd)
- [Función Pública — texto de la Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981)
- [SIC — cumplimiento de la obligación de reporte de incidentes de seguridad](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad)
- [Uniandes — restricciones a las cláusulas que limitan la responsabilidad](https://repositorio.uniandes.edu.co/server/api/core/bitstreams/9bfb2381-b5d1-4e32-9483-1e345651c676/content)
- [Affirma Legal — cláusulas abusivas en contratos en Colombia](https://www.affirmalegal.com/blog/clausulas-abusivas-en-contratos-guia-practica-en-colombia/)
- [El País — DIAN, personas naturales obligadas a facturar electrónicamente en 2026](https://www.elpais.com.co/economia/la-dian-revelo-cuales-son-las-personas-naturales-que-deben-facturar-electronicamente-en-2026-este-es-el-tope-1153.html)
- [Auge Digital — cómo abrir una cuenta de comercio en Wompi (2026)](https://augedigital.co/guias/abrir-cuenta-wompi/)
- [Wompi — reglamento de comercios Colombia (PDF)](https://wompi.com/assets/downloadble/reglamento-Comercios-Colombia.pdf)
- [Soporte Wompi — qué pasa si un cliente desconoce una compra](https://soporte.wompi.co/hc/es-419/articles/10692799825043--Qu%C3%A9-pasa-si-un-cliente-desconoce-una-compra-realizada-por-este-medio-de-pago)
- [Avvo — ¿es "WOD" propiedad de CrossFit?](https://www.avvo.com/legal-answers/is-the-term-wod-owned-by-crossfit-can-you-use-that-2189137.html)
- [Rockridge Law — la marca CrossFit y la defensa contra el genericide](https://rockridgelaw.com/2024/02/22/crossfit-trademark-protection-the-fight-against-genericide/)
- [El Colombiano — las inscripciones a gimnasios se disparan hasta 35% en enero](https://www.elcolombiano.com/negocios/inscripciones-en-gimnacion-suben-enero-disparan-PN32846595)
- Internos: [docs/06](./06-roadmap.md), [docs/07](./07-legal-colombia.md), [docs/08](./08-mercado-cali.md),
  [docs/10](./10-wompi.md), [docs/11](./11-operacion.md), [docs/12](./12-debito-recurrente.md),
  [docs/13](./13-puesta-en-marcha.md), [docs/14](./14-auditoria-2026-09-24.md), [docs/15](./15-competencia-software.md)

---

## 6. Lo que no se pudo verificar

- **Si una persona natural (no SAS) está obligada al RNBD cuando trata datos de terceros por
  encargo, por debajo del umbral de activos de una sociedad.** La norma está pensada para
  personas jurídicas; no se encontró un pronunciamiento específico para el caso de una persona
  natural actuando como encargado de tratamiento a esta escala. Consultarlo con un abogado
  antes de constituir la SAS.
- **Disponibilidad y costo de un seguro de responsabilidad civil profesional / tecnológico
  (E&O) para un fundador único en Colombia.** No se investigaron aseguradoras ni cotizaciones;
  se recomienda como mitigación de R-L4 pero sin cifra ni proveedor confirmado.
- **Si el Estatuto del Consumidor aplicaría al contrato entre Scalar y un box** (B2B) o si un
  box calificaría como "consumidor" en algún escenario específico — la lectura de este
  documento asume relación B2B genuina, que es lo razonable, pero no se profundizó en
  jurisprudencia específica de software B2B pequeño en Colombia.
- **Cifra exacta de exposición por contracargo** (cuántas transacciones, qué porcentaje suele
  disputarse) — no hay datos históricos porque, como documenta `docs/10`, **ninguna transacción
  real ha pasado todavía por Wompi**.
- **El desfase de caja específico de diciembre para boxes de Cali** (R-M4) es una inferencia
  razonada a partir de la retención de 3–6 meses y del patrón general de gimnasios, no un dato
  medido directamente para boxes de entrenamiento funcional. Marcado explícitamente como
  ESTIMACIÓN en el cuerpo del documento.
- **Estado actual y exacto de si el acuerdo de encargo de tratamiento y la política de datos ya
  se redactaron** al momento de leer este documento — `docs/06` los lista como tarea comercial
  en paralelo sin fecha de cierre confirmada; este análisis asume, conservadoramente, que
  siguen pendientes.
