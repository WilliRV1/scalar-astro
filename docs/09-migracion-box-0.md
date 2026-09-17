# 09 — Runbook: migrar el box del entrenador

> El box del entrenador es el **box 0**: el primero del sistema, el caso de estudio y el
> laboratorio. Esta migración no puede salir mal, porque son datos reales de gente real que
> lleva años entrenando ahí.

## Principio: no se borra nada

La migración **nunca destruye** los datos del prototipo. Los mueve al esquema `legacy` y
escribe encima del modelo nuevo. Si algo no cuadra, el original sigue ahí para consultarlo
o para repetir la migración. La limpieza de `legacy` es un paso aparte, manual, y solo
cuando el entrenador confirme que todo está bien.

## Qué se migra y qué no

| Del prototipo | Va a | Nota |
|---|---|---|
| `athletes.name` | `first_name` + `last_name` | Se parte por el primer espacio. **Revisar nombres compuestos** |
| `athletes.avatar_url` | igual | |
| `athletes.referral_source` | igual | |
| `athletes.payment_status` | `athletes.status` + estado de la suscripción | `active` → activo, `pending` → en mora |
| `athletes.cut_day` | `subscriptions.billing_day` | Vacío → día 1. Valores imposibles (`35`) → 31 |
| `back_squat`, `front_squat`, `deadlift`, `bench_press`, `shoulder_press`, `push_press`, `clean_rm`, `snatch_rm` | `personal_records` (kg) | `"120 kg"`, `"85,5"`, `"  95  "` se interpretan bien |
| `karen`, `burpees_100` | `personal_records` (segundos) | `"8:30"` → 510, `"1:02:30"` → 3750 |
| `athlete_progress` | `personal_records` | Con su fecha original: **la evolución se conserva** |
| `athletes.access_code` | **no se migra** | Era el PIN inseguro. Cada atleta entra ahora con código al celular |
| `workout_logs` (energía, RPE, notas) | pendiente de **F2** | Necesitan las tablas de WOD. Se quedan en `legacy` hasta entonces |
| Teléfonos | **no existen en el prototipo** | Ver "lo que hay que pedirle al entrenador" |

### Decisiones que conviene conocer

- **Los valores ilegibles se descartan, no se convierten en cero.** Un `"muchos"` guardado
  como `0` arruinaría la gráfica de evolución y el promedio del box. La migración cuenta
  cuántos descartó para revisarlos a mano.
- **La marca actual se fecha justo después del último registro del histórico**, nunca con
  la fecha de hoy. Fechar hoy haría parecer que todos los atletas acaban de hacer un PR.
  Cuando no hay histórico, se usa el alta del atleta y se anota en el campo `notes` que la
  fecha es estimada.
- **La migración es idempotente.** Correrla dos veces no duplica nada. Probado.

## Lo que hay que pedirle al entrenador antes

1. **Los teléfonos de los atletas, en una hoja de cálculo.** Es lo único importante que el
   prototipo no guardaba, y sin teléfono no hay login del atleta, ni recordatorio de pago,
   ni nada de WhatsApp. Es el dato más valioso de toda la migración.
2. **El precio real de su mensualidad** (por defecto la migración pone 180.000 COP).
3. **Confirmar quién sigue entrenando.** Meses sin uso significan atletas que ya se fueron;
   conviene marcarlos como retirados antes y no arrastrar una base inflada.
4. **Su correo**, para crear su usuario de dueño.

## Procedimiento

```bash
# 0 · Copia de seguridad ANTES de nada. No es opcional.
supabase db dump --db-url "$DB_URL" -f respaldo-prototipo-$(date +%F).sql

# 1 · Ensayo general contra una copia, nunca contra producción a la primera
createdb ensayo && psql ensayo -f respaldo-prototipo-$(date +%F).sql
for f in supabase/migrations/*.sql; do psql ensayo -v ON_ERROR_STOP=1 -f "$f"; done
psql ensayo -c "select * from legacy.migrate_box('box-del-entrenador', 'Nombre Real del Box');"

# 2 · Revisar el recuento que devuelve y compararlo con lo que el entrenador espera
psql ensayo -c "select count(*) from public.athletes;"
psql ensayo -c "select first_name, last_name from public.athletes order by first_name;"

# 3 · Solo si el ensayo cuadra, repetir contra producción
```

Tras migrar, crear el usuario del entrenador y vincularlo como dueño:

```sql
insert into public.memberships (org_id, user_id, role)
select o.id, '<uuid del usuario>', 'owner'
from public.organizations o where o.slug = 'box-del-entrenador';
```

## Verificación con el entrenador (no con la base de datos)

La migración está bien cuando **él** lo dice, no cuando los conteos cuadran:

- [ ] ¿Están todos sus atletas? ¿Sobra alguno que ya no entrena?
- [ ] ¿Los nombres compuestos quedaron bien partidos?
- [ ] Escoger 3 atletas y comparar sus marcas contra lo que él recuerda.
- [ ] ¿Las fechas de corte coinciden con lo que cobra hoy?
- [ ] ¿Quién aparece en mora es efectivamente quien le debe?

## Qué está probado y qué no

`supabase/tests/legacy_migration.sql` reconstruye el esquema exacto del prototipo con datos
sucios de verdad (nombres compuestos, `"120 kg"`, `"85,5"`, `"1:02:30"`, celdas vacías,
`"n/a"`, `cut_day` imposible) y verifica **24 aserciones** en CI antes de tocar nada real.

Esas pruebas ya encontraron un fallo serio durante el desarrollo: la marca actual del
atleta colisionaba en fecha con su último registro histórico y **se descartaba en silencio**,
perdiendo su mejor marca. Sin la prueba, eso se habría descubierto con el entrenador
diciendo "me falta mi back squat".

Lo que **no** está probado: la base real. Los datos reales siempre traen un caso que nadie
imaginó. Por eso el paso 1 del procedimiento es el ensayo contra una copia.

---

## Adenda — auditoría de los datos reales (2026-09-17)

Se auditó el proyecto real en solo lectura antes de migrar. **Cambia la
recomendación de fondo.**

### Lo que hay realmente

| | |
|---|---|
| Atletas | **9** (de los cuales 3 se llaman "Nuevo Atleta", uno "will", y hay dos "William Reyes") |
| Registros de entrenamiento | **4**, de solo 3 atletas distintos |
| Marcas con valor real | **18 celdas de 90**, y 6 de ellas son un `'0'` de relleno |
| Histórico de progresión | **0 filas. La tabla `athlete_progress` nunca existió** |
| Teléfonos, correos, documentos | **Ninguno, en ninguna tabla** |
| Usuarios de autenticación | **0** |
| Rango de altas | 24-ene-2026 a 21-feb-2026 |

`karen`, `burpees_100`, `back_squat` y `bench_press` están **vacíos en los nueve
atletas**. Hay nombres de prueba evidentes (Mike Tyson, John Doe, Sarah Connor).

### El hallazgo que hay que contarle al entrenador

**El histórico de marcas nunca se guardó.** `src/legacy/CoachDashboard.tsx:301`
inserta en `athlete_progress` **sin comprobar el error**, contra una tabla que no
existe; `src/legacy/AthletePersonalView.tsx:84` la lee con `if (data)`, así que el
historial siempre salía vacío y nadie lo notó. Cada edición de marcas desde enero
falló en silencio.

Esos datos **no se pierden en la migración: nunca existieron**. Si el entrenador
daba por hecho que tenía el histórico, hay que decírselo de frente.

> Lección para el código nuevo: toda escritura comprueba el error y lo propaga.
> Un `await` sin `if (error) throw` es una pérdida de datos silenciosa esperando
> a ocurrir.

### Recomendación: no migrar, arrancar limpio

Son **9 registros, la mitad de prueba, sin un solo dato de contacto**. Migrar 5
registros dudosos cuesta más que teclear los socios reales, y arrastraría al
modelo nuevo cuatro socios fantasma y seis marcas de cero.

La maquinaria de migración **no se bota**: sirve tal cual para el primer cliente
de verdad, y está probada con 27 aserciones. Simplemente no se usa aquí.

El plan para el box del entrenador pasa a ser:
1. Pedirle la lista real de socios con **teléfono** (lo que de verdad falta).
2. Cargarla con el importador de Excel, que es el camino que va a usar todo
   cliente nuevo — y así se prueba con datos reales antes de vendérselo a nadie.
3. Descartar el proyecto viejo cuando él confirme que no falta nada.

### Correcciones que la auditoría provocó en la migración

- **Un `'0'` ya no se migra como marca.** Parseaba limpiamente, así que la regla
  de "descartar lo ilegible" no lo atrapaba, y habría entrado como un PR
  legítimo de 0 kg que ensuciaría rankings y gráficas. Nadie levanta 0 kg ni hace
  Karen en 0 segundos: el cero se descarta en todas las métricas.
- **La unidad de peso ya no se asume.** En la misma columna conviven valores de
  285 y 305 (que parecen libras) con otros de 13 y 22 (que parecen kilos).
  `migrate_box()` recibe la unidad como parámetro y el informe final cuenta
  cuántas marcas superan 200 para que un humano las revise.

### Riesgo de producción, independiente de la migración

RLS sigue **desactivada** en las dos tablas del proyecto viejo, con **cero
políticas**, y el rol `anon` conserva `DELETE` y `TRUNCATE`. Cualquiera con la
llave anónima —que viaja en el navegador— puede vaciar el proyecto. Hay que
asumir que los datos actuales pudieron ser alterados por terceros.

Como la decisión es no migrar, la solución más limpia es **cerrar o borrar ese
proyecto** en cuanto el entrenador confirme. Mientras siga en pie, revocar los
permisos de `anon` es cuestión de un minuto.
