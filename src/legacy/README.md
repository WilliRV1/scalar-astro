# Componentes del prototipo (no enrutados)

Estos archivos son la interfaz del prototipo de un solo box. **No están
conectados al router** y hablan con el esquema viejo (`athletes` con columnas
`back_squat`, `karen`, …), que ya no existe.

Se conservan porque tienen trabajo de diseño y de producto que vale la pena
portar, no para ejecutarlos:

| Archivo | Se porta en | Qué se rescata |
|---|---|---|
| `CoachDashboard.tsx` | F1 | Filtros, drawer de edición, acentos por atleta, orden por fecha de corte |
| `ExcelImport.tsx` | F1 | Mapeo de columnas automático + manual. Es la herramienta de migración de cada cliente nuevo |
| `AthletePersonalView.tsx` | F2 | Sparkline de evolución y check-in diario |
| `AthleteLogin.tsx` | — | Reemplazado por OTP real. Su PIN `0000` aceptaba a cualquiera |
| `Home.tsx` | F8 | Portada del box |

Se borran cuando su contenido esté portado.
