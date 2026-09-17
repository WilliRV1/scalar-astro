# Prompt para el Claude Code local (con el MCP de Supabase autenticado)

Copiar y pegar tal cual. Es **solo de lectura**: no migra ni modifica nada.

---

Tienes el MCP de Supabase autenticado contra el proyecto `wgicwqtsiiwqsxgqjlcw`.

**Regla absoluta: esta tarea es de SOLO LECTURA.** No ejecutes ningún `insert`,
`update`, `delete`, `alter`, `drop` ni `create`. No apliques migraciones. No crees
ramas de base de datos. No ejecutes ninguna función. Si algo parece requerir una
escritura, detente y dilo en el informe. Solo consultas `select`.

## Contexto

Ese proyecto contiene el prototipo de una app de gestión para un box de CrossFit.
Vamos a migrarlo a un modelo nuevo, multi-cliente, y **antes de tocar nada necesito
saber exactamente qué hay**. El esquema viejo es:

- `athletes` (id, created_at, name, avatar_url, payment_status, cut_day,
  referral_source, back_squat, bench_press, deadlift, shoulder_press, front_squat,
  clean_rm, push_press, karen, burpees_100, snatch_rm, access_code)
- `workout_logs` (id, created_at, athlete_id, energy, rpe, notes, date)
- `athlete_progress` (id, created_at, athlete_id, field_name, value)

La migración que ya escribimos convierte esas columnas de texto a un modelo
numérico. Mapea los `field_name` de `athlete_progress` contra esta lista exacta:

```
back_squat, front_squat, deadlift, bench_press, shoulder_press,
push_press, clean_rm, snatch_rm, karen, burpees_100
```

Y convierte los valores así: `"120"` y `"120 kg"` → 120 · `"85,5"` → 85.5 ·
`"8:30"` → 510 segundos · `"1:02:30"` → 3750 segundos. Lo que no encaje se
descarta (no se guarda como 0).

## Lo que necesito que averigües

### 1. Inventario
Lista todas las tablas de los esquemas `public` y `legacy`, con su número de filas.
Indica si existen `athletes`, `workout_logs` y `athlete_progress`, y si `athletes`
todavía tiene la columna `back_squat` (eso confirma que es el esquema viejo y no
uno ya migrado).

### 2. Estado de seguridad
Para cada tabla de `public`: ¿tiene RLS habilitada? ¿cuántas políticas tiene?
Esto es para confirmar la exposición actual de los datos.

### 3. Atletas
- Total de atletas.
- Distribución de `payment_status`.
- Valores distintos de `cut_day` y cuántos atletas tiene cada uno. Marca los
  vacíos, nulos y los que no sean un número entre 1 y 31.
- Cuántos nombres tienen 1, 2, 3 o más palabras (los de 3+ hay que revisarlos
  a mano tras migrar).
- ¿Hay nombres duplicados?
- Distribución de `referral_source`.
- Rango de fechas de `created_at` (el más viejo y el más nuevo).

### 4. **Lo más importante: `field_name` sin mapear**
Lista **todos** los valores distintos de `athlete_progress.field_name` con su
conteo. Marca explícitamente cuáles **no** están en la lista de 10 de arriba.

> Esto es crítico: un `field_name` que no esté mapeado se perdería en silencio
> durante la migración. Si aparece alguno, es lo primero que tengo que corregir.

### 5. Formatos de valor
Para `athlete_progress` y para las 10 columnas de marcas de `athletes`, dame
**valores de ejemplo reales** (5 a 10 por campo) que muestren la variedad de
formatos. Busca en particular:
- valores con unidades escritas ("120 kg", "120kg", "120 lb")
- comas decimales ("85,5")
- tiempos en formatos distintos ("8:30", "8.30", "8m30s", "1:02:30")
- texto no numérico ("muchos", "n/a", "-", "?", "pendiente")
- celdas vacías o en blanco
- cualquier cosa rara que no encaje en las reglas de conversión de arriba

Cuenta **cuántos valores no se podrían convertir** con esas reglas.

### 6. Datos que faltan
- ¿Existe alguna columna con teléfono, celular, correo o documento en cualquier
  tabla del proyecto? (Sospecho que no, y es lo que más falta.)
- ¿Cuántos atletas tienen `avatar_url`?
- ¿Cuántos tienen al menos una marca registrada, y cuántos ninguna?

### 7. Registros de entrenamiento
`workout_logs`: total, rango de fechas, cuántos atletas distintos aparecen y
cuántos tienen notas no vacías.

### 8. Resto del proyecto
¿Hay buckets de Storage con archivos? ¿Hay Edge Functions desplegadas? ¿Hay
usuarios en `auth.users`? ¿Hay algún cron configurado?

## Formato del informe

Devuélvelo en Markdown, en español, con una tabla por sección. Termina con:

**Riesgos para la migración** — lista ordenada por gravedad de todo lo que
podría hacer que se pierdan o se deformen datos, con el número de filas afectadas.

**Lo que hay que pedirle al entrenador** — datos que no existen en la base y que
tiene que aportar él.

No propongas cambios de código ni ejecutes la migración. Solo el informe.
