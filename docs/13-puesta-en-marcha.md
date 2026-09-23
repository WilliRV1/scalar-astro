# 13 — Puesta en marcha: de cero a una demostración en 10 minutos

Para quien nunca ha visto este proyecto y tiene que enseñárselo a un entrenador
esta semana. Al final hay una aplicación en internet con un box de mentira pero
creíble: 40 atletas, un año de cobros, gente en mora, gente que dejó de venir,
WODs con leaderboard y un P&L que no es una línea plana.

Hacen falta **dos cuentas gratuitas** (Supabase y Vercel; ninguna pide tarjeta) y
`psql` instalado en tu computador (`brew install libpq` en macOS, `apt install
postgresql-client` en Linux).

| Paso | Tiempo |
|---|---|
| 1 · Crear el proyecto en Supabase | 3 min (más la espera del aprovisionamiento) |
| 2 · Cargar la base con el box de demostración | 2 min |
| 3 · Desplegar en Vercel | 3 min |
| 4 · Entrar y ensayar el guion | 2 min |

> El *cómo* de los pasos 1 a 3 está también en [`DESPLIEGUE.md`](./DESPLIEGUE.md),
> que es la guía del despliegue en general. Este documento es el de la
> **demostración**: qué queda sembrado, con qué se entra y qué se enseña.

---

## 1 · Crear el proyecto en Supabase (3 min)

1. [supabase.com](https://supabase.com) → **New project**.
   - **Name**: `scalar`
   - **Database Password**: genérala y **guárdala en el gestor de contraseñas
     ahora mismo**. La necesitas en el paso 2 y no se vuelve a mostrar (se puede
     reiniciar, pero es un paso más).
   - **Region**: *East US (North Virginia)*, la más cercana a Colombia de las
     gratuitas.
2. Mientras se crea (un par de minutos), copia los dos datos que necesita la
   aplicación, en **Project Settings → API**:

   | Dato del panel | Variable de entorno |
   |---|---|
   | **Project URL** (`https://xxxx.supabase.co`) | `VITE_SUPABASE_URL` |
   | Llave **`anon` / `public`** | `VITE_SUPABASE_ANON_KEY` |

   > El panel de Supabase mueve esta pantalla cada tanto (ahora la llave puede
   > aparecer como *publishable key* dentro de **API Keys**). Lo que buscas es
   > la llave **pública**, la que empieza por `eyJ...` o `sb_publishable_...`.
   > **La `service_role` no se usa aquí nunca**: salta la RLS y solo vive dentro
   > de Edge Functions.

3. Y la cadena de conexión para el paso 2, en **Project Settings → Database →
   Connection string → URI**. Reemplaza `[YOUR-PASSWORD]` por la contraseña del
   punto 1.

   Si tu conexión a internet no tiene IPv6 (la mayoría de las casas en Colombia),
   la cadena directa `db.xxxx.supabase.co` no resuelve: usa la de **Connection
   pooling → Session mode**, que es IPv4 y sirve igual para esto.

> **Si ese proyecto de Supabase ya tiene otras tablas tuyas**, corre antes
> `./scripts/preflight.sh`: varias tablas de Scalar tienen nombres genéricos
> (`invoices`, `payments`, `classes`) y un choque deja la base a medias. Lo más
> sano es un proyecto nuevo y vacío solo para esto.

---

## 2 · Cargar la base (2 min)

```bash
export SUPABASE_DB_URL="postgresql://postgres:TU-CLAVE@db.xxxx.supabase.co:5432/postgres"
./scripts/setup-demo.sh
```

El script aplica **todas** las migraciones en orden, anota cuáles quedaron
aplicadas (en `supabase_migrations.schema_migrations`, la misma tabla que usa la
CLI de Supabase) y encima siembra el box de demostración. Termina imprimiendo lo
que quedó:

```
→ Sembrando el box de demostración
  Box La Ladera listo:
    40 atletas (29 activos, 4 en mora)
    239 cobros · cartera pendiente: $2.538.000
    2258 asistencias · 50 WOD con 576 resultados · 378 marcas
    215 clases · 397 reservas
    83 gastos · 2 insumos bajo mínimo
    5 atletas en riesgo de fuga · 28 mensajes en la bandeja
```

Detalles que evitan sustos:

- **Se puede volver a correr.** Las migraciones ya aplicadas se saltan y la
  semilla borra y vuelve a crear *solo* el box `box-la-ladera`. Un box real que
  viva en la misma base no se toca.
- **La semilla va entera en una transacción.** Si falla algo, la base queda como
  estaba; no hay medio box sembrado.
- Si la base ya tenía otros boxes, el script avisa y pide que escribas `SI`
  antes de seguir (`--si` para saltarse la pregunta en CI).
- Las fechas se calculan contra el día de hoy, así que la demostración sigue
  viéndose bien dentro de seis meses sin volver a sembrar. Si quieres
  refrescarla igual: `./scripts/setup-demo.sh --solo-semilla`.

**Si no tienes `psql`**: se puede hacer desde el editor SQL del panel, pegando
cada archivo de `supabase/migrations/` **en orden alfabético** y al final
`supabase/seed_demo.sql` entero (es un solo bloque, no se ejecuta por trozos).
Es tedioso pero funciona. Lo que **no** funciona ahí es `supabase/seed.sql`,
porque usa `\ir`, que es una instrucción de `psql` y no SQL.

---

## 3 · Desplegar en Vercel (3 min)

1. [vercel.com](https://vercel.com) con tu cuenta de GitHub → **Add New →
   Project** → el repositorio.
2. En **Environment Variables**, las **dos** del paso 1:

   | Nombre | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | la *Project URL* |
   | `VITE_SUPABASE_ANON_KEY` | la llave `anon` / pública |

3. **Deploy**. Vercel detecta Vite solo y `vercel.json` ya trae lo demás
   (reescritura para que recargar `/coach/atletas` no dé 404, caché del service
   worker, cabeceras de seguridad).

> Vite **incrusta** las variables en el build. Si cambias una, hay que volver a
> desplegar: no se leen en caliente. Es el error número uno de este paso.

---

## 4 · Con qué entrar y qué enseñar

Los tres usuarios los crea la semilla. Contraseña de los tres: **`demo1234`**.

| Correo | Rol | Para qué sirve en la demostración |
|---|---|---|
| `dueno@boxlaladera.co` | dueño | Lo ve todo: cartera, gastos, reportes |
| `coach@boxlaladera.co` | coach | **No ve la plata**. Es la prueba de que los permisos son reales |
| `atleta@boxlaladera.co` | atleta | Es la ficha de Valentina Ocampo, con 14 meses de historia |

Los tres entran por **`/entrar`** con correo y contraseña. El acceso del atleta
por celular (`/acceso`, código por SMS) **no** está conectado: necesita un
proveedor de SMS. Para enseñar la vista del atleta se usa el correo.

### El guion de los 10 minutos

Ensáyalo una vez antes. El orden importa: primero el dolor, después la función.

**0:00 · La cartera** (entra como dueño, cae en `/admin`).
Empieza por la plata: es lo que quita el sueño. La pantalla agrupa la deuda en
cuatro tramos —por vencer, 1 a 7 días, 8 a 30, más de 30— y **hay plata en los
cuatro**. Abre el de *más de 30 días*: ahí está **Ricardo Peláez**, con 75 días
de mora. Toca el botón de WhatsApp: el mensaje ya viene escrito con su nombre,
el monto y la fecha. Frase para decir en voz alta: *"esto es lo que hoy haces
mirando un cuaderno"*.

**2:00 · Atletas en riesgo** (`/coach/riesgo`).
Aquí está el argumento de venta. El sistema marcó a Ricardo como **crítico** y
explica por qué en una línea ("lleva 30 días sin venir", "75 días de mora"). Más
abajo, **Óscar Iván Salazar** lleva 18 días sin aparecer y **Jhon Freddy
Gutiérrez** 10. Ninguno ha cancelado: los tres se están yendo en silencio, que es
como se van de verdad. Recuerda el dato: la retención media del sector es de 3 a
6 meses (`docs/08` §4); subirla de 4 a 6 le cambia la economía al box.

**4:30 · El WOD del día y el leaderboard** (`/coach/wod`).
El entrenamiento de hoy con sus tres bloques (calentamiento, fuerza, metcon) y
sus escalas rx / scaled / beginner. Baja al leaderboard: los que ya entrenaron
hoy, ordenados. Enseña que un resultado de un benchmark **crea la marca personal
solo** —nadie la escribe dos veces— y que hay WODs de mañana **sin publicar**,
que el atleta todavía no ve.

**6:30 · La vista del atleta** (cierra sesión, entra con `atleta@boxlaladera.co`).
Lo que ve Valentina en el celular: el WOD de hoy, sus reservas, sus cobros y su
**evolución**. En la gráfica de fuerza la línea sube. En la de tiempo (Karen, 100
burpees) **también sube, aunque los segundos bajen**: el eje está invertido a
propósito, porque en tiempo menos es mejor y felicitar al atleta cuando empeora
es peor que no enseñarle nada.

**8:30 · El coach no ve la plata** (entra con `coach@boxlaladera.co`).
El menú ya no tiene cartera ni gastos. Y si escribes `/admin` a mano, no aparece
la plata de nadie: eso no lo decide la pantalla, lo decide la base de datos
(RLS). Es la respuesta a *"¿y mi coach va a ver cuánto facturo?"*.

**Si sobra tiempo** (elige uno, no los tres):

- `/coach/horarios`: la clase de las 6 p. m. está **llena y con lista de
  espera**. Es el reemplazo del grupo de WhatsApp.
- `/admin/insumos`: el magnesio y el tape están **bajo mínimo** y el sistema ya
  encoló el aviso.
- `/admin/reportes`: el P&L del año. El box estaba en rojo hace un año, cuando
  tenía la mitad de atletas, y cierra en positivo los últimos meses; los dos
  meses hundidos son compras puntuales (la reposición de bumpers y el aire
  acondicionado), y eso se ve en la gráfica sin tener que explicarlo. Un box de 40 atletas gana poco; el punto de equilibrio del sector
  está en ~100 socios (`docs/08` §4). Esa es la conversación que tienes que
  provocar.

### Lo que NO conviene abrir en una demostración

Dicho de frente, para que nadie quede mal:

| Qué | Por qué no |
|---|---|
| Cobro en línea (Wompi) | El código está y probado contra la base, pero **ninguna transacción real ha pasado por él** |
| Envío automático de WhatsApp | Funciona el botón de un clic. El envío solo necesita cuenta de WhatsApp Business y plantillas aprobadas por Meta |
| Tareas programadas | Los cobros y los avisos son funciones listas, pero todavía se disparan a mano; falta engancharlas a `pg_cron` |
| Correos a los atletas | Los correos del box de demostración son inventados (`@correo.co`). **No conectes un proveedor de correo real contra esta base** |

La bandeja de automatizaciones está en **modo simulación**: enseña qué mensajes
se *habrían* mandado. Eso no es una limitación que haya que esconder, es
exactamente lo que se le recomienda al box su primera semana.

---

## 5 · De la demostración a un box real

El box de demostración y uno real pueden convivir en la misma base (cada uno con
su `org_id`), pero para vender es mejor empezar limpio.

1. **Crea el box real** entrando como dueño y usando el asistente de
   `/admin/puesta-en-marcha`: datos del box, planes con sus precios, día de
   corte, campos propios.
2. **Importa los atletas** desde el Excel que ya tiene el entrenador, en
   `/coach/importar`. Ojo con lo obvio: importar una lista de contactos **no es**
   una autorización de esas personas para escribirles (`docs/07`).
3. **Deja el modo simulación encendido la primera semana.** Se revisa la bandeja
   con el dueño y se prende el envío cuando él esté de acuerdo con los textos.
4. **Borra el box de demostración** cuando ya no lo necesites. Son dos líneas en
   el editor SQL; la cascada se lleva atletas, cobros, WODs, clases y gastos, y
   no toca nada de los demás boxes:

   ```sql
   delete from public.organizations where slug = 'box-la-ladera';
   delete from auth.users where email like '%@boxlaladera.co';
   ```

5. Si quieres volver a tenerlo (para la siguiente demostración):
   `./scripts/setup-demo.sh --solo-semilla`.

---

## 6 · Qué está probado y qué no

Honestidad sobre esta guía, para que nadie se estrelle:

- **Probado**: la semilla se aplica sin un solo error sobre una base con todas
  las migraciones, en PostgreSQL 16 efímero con el arnés local del repositorio
  (`supabase/tests/_local_auth_stub.sql`), y los conteos de arriba salen de
  consultar esa base, no de lo que uno creía haber escrito. El script
  `setup-demo.sh` se probó contra esa misma base, incluida la segunda corrida
  (no duplica nada).
- **No probado contra un proyecto de Supabase real.** Lo que puede cambiar allá:
  - `auth.users` y `auth.identities` tienen muchas más columnas que el arnés
    local. La semilla mira qué columnas existen antes de escribir y funciona en
    los dos sitios, pero **la creación de los tres usuarios es la parte con más
    probabilidad de comportarse distinto** según la versión de GoTrue del
    proyecto.
  - Si el inicio de sesión falla, los usuarios igual quedaron creados: ponles la
    contraseña desde el editor SQL del panel y vuelve a intentar.

    ```sql
    update auth.users
       set encrypted_password = extensions.crypt('demo1234', extensions.gen_salt('bf'))
     where email like '%@boxlaladera.co';
    ```

    No los borres ni los vuelvas a crear desde **Authentication → Users**: las
    membresías y el vínculo con la ficha de Valentina cuelgan del id que sembró
    la semilla.
- **Tampoco se ha probado el despliegue en Vercel** desde este repositorio: la
  configuración está en `vercel.json` y es la estándar de Vite, pero nadie ha
  apretado el botón todavía.
