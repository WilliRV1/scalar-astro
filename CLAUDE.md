# Scalar — guía para trabajar en este repositorio

SaaS de gestión para **boxes de entrenamiento funcional** en Colombia.
El plan completo está en [`docs/`](./docs/README.md). Esto son las reglas de la casa.

## Idioma

**Todo en español de Colombia**: interfaz, comentarios del código, mensajes de
error, nombres de variables de dominio, documentación y mensajes de commit. Los
identificadores de base de datos van en inglés (`athletes`, `invoices`), que es
lo que ya había y no se mezcla.

No se usa la palabra "CrossFit" en el producto ni en el material comercial: es
marca registrada ajena y en Cali no hay un solo box afiliado. Se dice *box*,
*entrenamiento funcional* o *cross training*. Ver `docs/08-mercado-cali.md`.

## Antes de tocar la base de datos

Carga la skill `supabase-postgres-best-practices`. No es opcional ni para un
cambio de una columna.

### Reglas que no se negocian

1. **Ninguna tabla sin RLS.** `supabase/tests/rls_guard.sql` falla el build si
   aparece una. Además, toda tabla necesita al menos una política; las
   excepciones (`job_runs`, `webhook_events`, que solo toca `service_role`) están
   listadas explícitamente en esa prueba.
2. **`org_id` en toda tabla de negocio**, y todo índice empieza por `org_id`.
   Sin eso, las consultas escanean los datos de todos los boxes.
3. **El esquema solo cambia por migración versionada.** Nada de SQL a mano en el
   editor de Supabase: así nadie sabe en qué estado está la base de un cliente.
4. **Dinero en `bigint` de centavos.** Nunca coma flotante, nunca `numeric` que
   venga del cliente.
5. **Las fechas de negocio se evalúan en la zona horaria del box**, no en UTC.
   A las 02:00 UTC en Bogotá es el día anterior: es el origen clásico del cobro
   generado el día equivocado.
6. **Los jobs son idempotentes.** Correrlos dos veces no puede cobrar dos veces.
   Se consigue con índice único + `on conflict`, no con un `if not exists`.
7. **Los teléfonos se guardan en E.164** (`+573001234567`). Lo impone un CHECK.

### Trampas que ya nos costaron caro

- **No revoques `EXECUTE` a `authenticated` en funciones que usen las políticas
  RLS.** Las expresiones de una política se evalúan con los privilegios de quien
  consulta, así que revocarlo rompe *todas* las consultas con
  `permission denied for function`. Lo que protege esos helpers es vivir en el
  esquema `private`, que no está expuesto por la API. Ver
  `supabase/migrations/20260916120000_core_tenancy.sql`.
- **Los helpers de permisos devuelven conjuntos de `org_id`**, y las políticas se
  escriben `org_id in (select private.…)`. Así se evalúan una vez por consulta y
  no una vez por fila.
- **Un valor `'0'` no es un dato, es una casilla vacía disfrazada.** Parsea
  limpiamente, así que la regla de "descartar lo ilegible" no lo atrapa. Una
  marca de 0 kg arruina promedios y gráficas.
- **`Number('')` es `0`.** Validar con `Number.isFinite()` no basta: hay que
  comprobar el patrón antes.

## Pruebas

```bash
npm run check      # lint + tipos + unitarias + build + base de datos
npm run db:test    # solo la base: Postgres efímero, sin Docker
```

### Estilo de las pruebas SQL

Mira `supabase/tests/billing_engine.sql` y cópialo: `begin`/`rollback`, función
auxiliar `pg_temp.chk(cond, label)` y mensajes `ok · descripción` en español.

**`pg_temp.chk` usa `coalesce(cond, false)` a propósito.** Con `if not cond`, una
aserción que dé NULL —comparar contra una columna vacía o una subconsulta sin
filas— pasa sin comprobar nada. Ya nos pasó: una prueba llevaba días en verde
comprobando una fecha que nunca existió.

### Qué se prueba de verdad

Lo que produce pérdida de datos o de plata: aislamiento entre boxes,
idempotencia de los cobros, conversión de valores, permisos. No se persigue
cobertura; se persiguen los fallos que hacen que un cliente cancele.

## Frontend

- Estructura por dominios: `src/features/<dominio>/`, no por tipo de archivo.
- Estado del servidor con **TanStack Query**. Nada de `useState` + `useEffect`
  para traer datos.
- **Nunca `setState` síncrono dentro de un `useEffect`** (el linter lo bloquea).
  Si hace falta llamar al servidor desde un efecto, se usa `useMutation` y se
  dispara `mutate()`.
- Los guardas de ruta deciden **qué se pinta**; la RLS decide **a qué se
  accede**. Saltarse un guarda manipulando la URL enseña una pantalla vacía.
- Validación con **zod**, compartida entre formulario e importador. Ojo con los
  transform: emite el error *dentro* del transform, donde se distingue "no
  escribió nada" de "escribió algo que no se entiende".
- Cero `any`. Sin `console.log` de depuración.
- Diseño oscuro industrial: `grunge-border`, `font-display`, `bg-surface-dark`,
  `text-primary`. Todo tiene que funcionar en móvil: el coach usa el celular.

### Gráficas

Carga la skill `dataviz` **antes** de escribir la primera línea de código de
gráfica, incluido un SVG en línea. No hay librería de gráficas instalada y no se
instala ninguna: mira `src/features/performance/Sparkline.tsx`, que es el
precedente. Serie única sin leyenda, nada de números sobre cada punto, y jamás
dos ejes Y.

En métricas de tiempo **menos es mejor**: el eje se invierte para que la línea
suba cuando al atleta le va mejor. Confundirlo felicita al atleta justo cuando
empeora.

## Errores

Toda escritura comprueba el error y lo propaga. El prototipo insertaba en una
tabla inexistente sin mirar el resultado, y **perdió en silencio todas las marcas
durante meses** sin que nadie se enterara. Un `await` sin `if (error) throw` es
una pérdida de datos esperando a ocurrir.

Los mensajes de error de la base están redactados en español y son explícitos:
se muestran al usuario tal cual, no se tapan con un "algo salió mal".

## Datos personales

Ver `docs/07-legal-colombia.md`. En corto: lesiones y notas médicas son **datos
sensibles** y viven en tablas aparte (RLS es por fila, no por columna); el
consentimiento se guarda con su fecha porque **la fecha es la evidencia**; y
importar una lista de contactos no es una autorización de esas personas.

## Trabajo con varios agentes

Este repositorio se construye con agentes en paralelo. Si eres uno:

- Respeta la lista de archivos que te asignaron. Si necesitas algo de fuera,
  impórtalo; no lo edites.
- Tu migración tiene un nombre asignado. No crees otras.
- No toques `scripts/db-test.sh`, `supabase/config.toml`, `package.json`, el
  router ni `src/types/database.ts`: los integra quien coordina.
- No hagas commit ni push.
- Reporta lo que **no** pudiste verificar y por qué. No afirmes que funciona algo
  que no probaste.
