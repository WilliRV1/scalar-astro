# Scalar — Plataforma SaaS de gestión para boxes de CrossFit

> Documento vivo. Última actualización: 2026-09-16.

Este directorio contiene el plan de producto, negocio y arquitectura para convertir
el prototipo actual (una SPA de un solo box) en un producto SaaS multi-cliente
vendible a boxes de CrossFit y gimnasios pequeños.

## Índice

| Documento | Qué responde |
|---|---|
| [00-diagnostico.md](./00-diagnostico.md) | Qué hay hoy en el código, qué sirve y qué hay que tirar |
| [01-producto-alcance.md](./01-producto-alcance.md) | Qué vamos a ofrecer y qué explícitamente NO |
| [02-arquitectura.md](./02-arquitectura.md) | Stack, multi-tenancy, seguridad, módulos, jobs |
| [03-modelo-de-datos.md](./03-modelo-de-datos.md) | Esquema de base de datos completo con RLS |
| [04-automatizaciones.md](./04-automatizaciones.md) | El motor de reglas y WhatsApp (el diferenciador) |
| [05-negocio-precio-gtm.md](./05-negocio-precio-gtm.md) | Precio, unit economics, contrato, cómo vender |
| [06-roadmap.md](./06-roadmap.md) | Fases, entregables y cuándo se puede empezar a cobrar |
| [07-legal-colombia.md](./07-legal-colombia.md) | Habeas Data, SIC, contrato de encargo, DIAN |
| [08-mercado-cali.md](./08-mercado-cali.md) | **Investigación de mercado**: censo de boxes, precios, competencia, dolores |
| [14-auditoria-2026-09-24.md](./14-auditoria-2026-09-24.md) | **Auditoría**: seguridad, operación y frontend; lo arreglado y lo pendiente por severidad |
| [15-competencia-software.md](./15-competencia-software.md) | **Competencia de software**: 23 gestores de box y herramientas de competencias, precio recomendado, qué construir en el módulo de competencias |
| [16-viabilidad-financiera.md](./16-viabilidad-financiera.md) | **Viabilidad financiera**: costo atómico línea por línea, punto de equilibrio, flujo de caja de los primeros 6 meses |
| [17-viabilidad-tecnica.md](./17-viabilidad-tecnica.md) | **Viabilidad técnica**: inventario atómico de pendientes, horas de trabajo, widawi vs Supabase Cloud |
| [18-analisis-riesgos.md](./18-analisis-riesgos.md) | **Análisis de riesgos**: legal, negocio, operacional, financiero, seguridad — matriz de priorización |

## Decisiones tomadas

| Fecha | Decisión |
|---|---|
| 2026-09-16 | **Precio**: fundador (150k + 40k/mes, 12 meses, con contraprestación) para los primeros 3–5 boxes; después tarifa objetivo (implementación 450k + 99k/189k/329k mensual). Ver [05](./05-negocio-precio-gtm.md) |
| 2026-09-16 | **Reserva de clases entra en v1** como fase F3, con reserva por WhatsApp incluida |
| 2026-09-16 | **El producto no se llama ni se vende como "CrossFit"**: no hay afiliados oficiales en Cali y es marca ajena. Se posiciona como software para *box / entrenamiento funcional* |
| 2026-09-16 | **El cobro con rieles colombianos sube a fase propia (F5)**: Wompi con tokenización de tarjeta y Nequi. Es el mayor hueco verificado de la competencia |
| 2026-09-16 | **Plan Box ajustado de 189.000 a 179.000 COP**, para igualar la mensualidad de un atleta ("te cuesta lo mismo que un socio") |

## Resumen en 10 líneas

- El prototipo actual es una demo de un solo box, **sin autenticación real y sin RLS**:
  hoy cualquiera con la URL puede leer y escribir toda la base de datos. Ese es el
  bloqueador #1 y no es negociable antes de vender.
- La arquitectura objetivo es **un solo despliegue multi-tenant** (una base de datos,
  `org_id` en todas las tablas, RLS en Postgres, un subdominio por box). Instalar una
  copia por cliente es lo que mata a los SaaS de un solo desarrollador.
- Tres módulos por rol: **Administrador** (plata, planes, inventario, reportes),
  **Coach** (WOD, resultados, asistencia, atletas en riesgo) y **Atleta** (evolución,
  pagos, historial). En boxes pequeños coach y dueño son la misma persona: se resuelve
  con permisos, no con módulos separados.
- El diferenciador real no es el CRUD: es el **motor de automatizaciones** (cobros que
  se recuerdan solos, atletas que dejaron de venir detectados solos, reporte semanal).
- El precio propuesto (150k instalación + 40k/mes) es **demasiado bajo** y es negativo
  desde el primer ticket de soporte. Queda como *precio de fundador* para 3–5 pilotos
  con contrato que diga que sube. Ver [05](./05-negocio-precio-gtm.md).
- **No compites contra Wodify: compites contra un Excel y un grupo de WhatsApp.** Ningún
  box caleño tiene evidencia pública de usar software de gestión, y ninguno publica precios.
  Eso hace la venta más fácil de ganar y más difícil de iniciar: el prospecto no está
  buscando una solución porque ya normalizó el dolor.
- **Las reservas de clase entran en v1**: son lo que reemplaza el grupo de WhatsApp, lo
  que permite bloquear al moroso antes de que entrene, y lo que produce los datos de
  asistencia limpios que alimentan la detección de fuga.
