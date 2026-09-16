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
