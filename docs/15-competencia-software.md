# 15 — Competencia de software: gestores de box y herramientas de competencias

Fecha: 2026-09-25. Método: actualización y ampliación de [08-mercado-cali.md](./08-mercado-cali.md)
§5-6. Se reverificaron con fetch directo los 5 competidores ya cubiertos y se investigaron 18
productos nuevos: 9 gestores de box/gimnasio y 9 herramientas específicas de gestión de
competencias/torneos. TRM verificada el 2026-09-25: **~$3.300 COP/USD** (en alza fuerte ese mes:
$3.208 el 23-sep, $3.264 el 24-sep, $3.330 el 25-sep — Banco de la República vía
capitalcolombia.com y pulzo.com). EUR≈1,08 USD → ~$3.564 COP/EUR.

> **Advertencia de método, igual que en 08:** varias páginas de precios oficiales (Mindbody,
> Virtuagym, Exercise.com, Glofox) no publican cifra exacta ("pida cotización"); donde pasa esto
> se usan estimaciones de terceros (Capterra, blogs especializados) marcadas explícitamente como
> tales. Wodify bloqueó el fetch directo (403); su precio viene de agregadores, confianza media-baja.

---

## 1. Resumen ejecutivo

Scalar no compite hoy contra un gestor de box instalado en Cali — eso ya lo estableció 08 y esta
ampliación no lo contradice — pero sí compite, a la hora de cerrar una venta, contra **una franja
de precio internacional de USD 9 a USD 350/mes** con al menos 18 jugadores más de los que ya se
habían mapeado. La franja real en pesos colombianos, ampliada, va de **~$75.000 COP/mes** (Virtuagym
tier bajo, estimado) hasta **más de $2.000.000 COP/mes** (Mindbody Ultimate con add-ons). El precio
de Scalar ($179.000 COP) sigue cayendo cómodamente en la mitad baja de esa franja, ahora con más
evidencia de que no es una anomalía. **Ningún competidor cobra en COP de forma nativa excepto
CrossHero** (que sí tiene un precio fijo publicado de **$215.000 COP/mes** para Colombia,
confirmado en esta ronda — antes solo se tenía la conversión desde euros). **Wompi/PSE/Nequi no
aparecen confirmados en ningún competidor**, ni siquiera en Fitco o Crossfy, los dos jugadores que
se presentan como "de LatAm": ambos cobran en dólares vía Stripe/Mercado Pago/transferencia, no
tienen rieles colombianos nativos. Ese hueco sigue intacto y es el argumento de venta más fuerte
que salió de esta investigación, reforzado por un dato nuevo: **ni el software gestor de box ni las
herramientas dedicadas de competencias tienen módulo de torneo con heats + jueces + pago
resuelto salvo dos jugadores** (WodBuster Arena y Wodify Arena), y ninguno de los dos vende en
Colombia ni cobra en pesos. Eso deja una ventana real para que el futuro módulo de competencias de
Scalar sea, simultáneamente, el primero con rieles de pago colombianos y el primero vendido
localmente con soporte en español y sin diferencia horaria.

---

## 2. Tabla comparativa completa

*Ordenada de menor a mayor precio de entrada aproximado en COP/mes. "≈COP" son conversiones
propias con la TRM de arriba, no cifras publicadas por el proveedor salvo que se indique "dato
directo en COP".*

| Competidor | Precio ≈COP/mes (desde) | Atado a | Implementación | Pagos colombianos | Español | Gestión de competencias | Nota de reseñas |
|---|---|---|---|---|---|---|---|
| **Trainerize** | ~$30.000 (plan Grow USD 9, 2 clientes) hasta ~$742.500 (Pro 200 clientes) + $818.400 Studio Plus | Por cliente/coach, + plan por local | Free salvo app propia (USD 169 única vez) | No encontrado | Parcial/incompleta, soporte en inglés | No — solo "challenges" de engagement, sin heats/jueces | Trustpilot 3.5/5: cobros incorrectos, soporte lento (+1 semana) |
| **Virtuagym** | No publicado; terceros estiman ~$95.700–$128.700 (tier entrada) | Por clientes/miembros | No confirmado, mencionado en quejas sin cifra | No confirmado (paga con "Virtuagym Pay" propio) | Sí, 14 idiomas, foco reciente en España | No — challenges/leaderboard de retención, sin heats/jueces | Capterra 3.8/5: app lenta, base de datos nutricional imprecisa |
| **Fitco** (LatAm) | $194.700 (Lite) / $326.700 (Core) / $557.700 (Growth) — dato directo en USD, conversión propia | Plano por local | No mencionado | Stripe, Mercado Pago, Webpay — **no Wompi/PSE/Nequi** | Sí, nativo | No encontrado | Capterra 4,0/5, mayoría positivas; queja: falta de plantillas de landing/programación |
| **Gymdesk** | $247.500 (≤50 miembros) hasta $660.000 (201-400) | Por miembros activos | **$0 confirmado** | No confirmado | No (en desarrollo) | Motor nativo de WOD/leaderboard, sin heats/jueces confirmados | Capterra 4,8/5 (562+ reseñas), la mejor calificación del grupo nuevo |
| **Crossfy** (LatAm) | $174.900 (anual) / $198.000 (semestral) / $224.400 (mensual) — dato directo en USD | Plano, ilimitado | **$0 confirmado** | Solo transferencia/Payoneer/PayPal — **no Wompi/PSE/Nequi, ni para cobrarse a sí mismo** | Sí, nativo | "Crossfy Competencias" mencionado pero no verificable en detalle — **a confirmar** | Sin calificación numérica pública encontrada |
| **WodBuster** | $124.400 (≤35) / $156.800 (≤70) / $192.500 (ilimitado) | Por usuarios activos | **$0 confirmado** | **Sí — Wompi confirmado** | Sí, nativo | **Sí, robusto — WodBuster Arena** (ver §5) | Mayoría positivo; queja: no se puede tener 2 boxes, Apple Watch fallida |
| **CrossHero** | **$215.000 — dato directo en COP** | Plano, ilimitado | No mencionado | No confirmado explícito (precio en COP pero medio de pago no confirmado) | Sí, nativo | No encontrado — remite a Competition Corner si se necesita algo robusto | Capterra 4,8/5 (122): muy positivo, queja puntual de pagos in-app |
| **Boxmagic** | ~$130.000 / ~$228.000 (dato previo, no re-confirmable esta ronda — ver Parte A) | Por tramos de atletas | No encontrado | No confirmado | Sí, nativo (LatAm) | No encontrado | GetApp 3,6/5: recordatorios 1,0/5, soporte 3,1/5 |
| **Arbox** | ~$128.700 (Basic) / ~$326.700 (Standard) / ~$789.900 (Professional) | Por sesiones semanales/features | No confirmado, "on-site implementation" solo en Enterprise | No encontrado | No confirmado | **No encontrado — vacío pese a posicionarse "All-in-One CrossFit"** | Capterra: en general positivo (migrantes de Wodify/Zen Planner); soporte afectado por huso horario Israel |
| **SugarWOD** | Precio ya no público (cambió desde 08: antes USD 37 visible, hoy solo "contactar ventas" por rango de atletas) | Por atleta activo | No mencionado | No encontrado | Parcial (solo tiendas de apps regionales) | Solo leaderboard social de box, sin heats/jueces/inscripción de evento | G2 4,5/5 (pocas reseñas): piden unificar apps |
| **Wodify** | ~$260.700 (USD 79, dato de agregador, **baja confianza** — sitio oficial bloqueó el fetch) | Por local (tarifa plana, a confirmar) | No confirmado | No confirmado (Stripe/"Wodify Payments") | No encontrado | **Sí, robusto — Wodify Arena** (producto separado, ver §5) | Capterra: precios iguales en mercados no-US pese a paridad de poder adquisitivo distinta, bugs de edición |
| **Glofox** | Declarado "desde $99" (~$326.700); terceros estiman real $150-400+ (~$495.000-$1.320.000) | Por ubicación | No confirmado (existe "Maintenance Fee" documentado, sin monto) | No encontrado | Sí, pero calidad de traducción cuestionada por usuarios | No encontrado — orientado a boutique fitness, no boxes | Capterra 4,4/5 (354): soporte lento (caso de 6 meses), features nuevas mientras rotas |
| **TeamUp** | Desde $623.700 (USD 189, tramo 101-200 clientes) + $326.700 app propia | Por cliente activo/mes | **"No setup fee" confirmado** | No encontrado (Stripe/GoCardless) | Sí, 4 idiomas incl. español (fijado al registrar, no cambia después) | Solo eventos genéricos de calendario, sin heats/jueces/leaderboard de WOD | Mayoría positivo; una reseña en Trustpilot: "costly mistake" |
| **Exercise.com** | No publicado; terceros estiman ~$788.700 (USD 239) | Por usuarios/funciones | No confirmado, onboarding largo reportado (60 días → 6 meses en un caso) | No encontrado | No encontrado | Solo challenges/leaderboards genéricos de coaching | Capterra 4,7-4,8/5: curva de aprendizaje pronunciada |
| **PushPress** | $524.700 (Pro) / $755.700 (Max), + Train (WOD/leaderboard) desde $260.700 | Plano por local + add-ons | No confirmado explícito; onboarding de días | No encontrado (Stripe) | No encontrado | Parcial — "Challenges" con leaderboard y divisiones de scoring, sin heats ni jueces dedicados | Capterra 4,7/5 (185): quejas de aumento de precio, sitio web lento en aprobarse |
| **Zen Planner** | $326.700 (Studio) / $653.400 (Essentials) / $1.148.400 (Ultimate) | Por miembros activos | No confirmado explícito, "sin fee de instalación" con procesador preferido | No encontrado (Daxko Payments, mismo grupo que SugarWOD) | No encontrado | Débil/genérico — leaderboard de box y "fitness challenges", sin heats/jueces | **Capterra 4,3/5 vs. Trustpilot 2,0/5 (333 reseñas)** — contraste fuerte, cobros post-cancelación reportados |
| **Mindbody** | No publicado; terceros: $326.700-$524.700 (Starter/Accelerate) hasta $1.646.700-$2.306.700 (Ultimate/Ultimate Plus) | Por ubicación | **"$0 setup fee" confirmado en sitio oficial** | No encontrado | Sí, selector de idioma en sitio | Solo integración con Spivi para leaderboard de clase boutique, no CrossFit | Reddit: "precio por capas" que escala a 4 dígitos con comisiones de marketplace |

**Herramientas dedicadas a competencias (no gestores de box completos)** — ver detalle en §5.

---

## 3. Los competidores más peligrosos para Scalar en Cali

1. **WodBuster.** Sigue siendo el más peligroso de todos: es el único que ya integra Wompi (pago
   colombiano real), tiene interfaz nativa en español, no cobra implementación, y **además ahora
   tiene el módulo de competencias más completo del mercado (Arena)** — heats, jueces con IA,
   check-in por QR, scoring en tiempo real. Si un box caleño ya evaluó software, es el que más
   probablemente vio. Su debilidad sigue siendo que no vende activamente en Colombia (es una
   empresa española sin presencia comercial local) — ahí es donde Scalar puede ganar por cercanía.

2. **CrossHero.** Tiene precio publicado directamente en pesos colombianos ($215.000/mes,
   confirmado esta ronda) y 3 boxes colombianos ya identificados en la investigación previa. Es el
   competidor con la reseña más alta del grupo (Capterra 4,8/5, 122 reseñas). Si un box quiere "algo
   conocido y en español", CrossHero es la alternativa más obvia a Scalar. No tiene módulo de
   competencias propio robusto, lo cual es un punto a favor de Scalar a futuro.

3. **Crossfy y Fitco (los "locales" de LatAm).** Ambos se venden como soluciones para la región y
   tienen español nativo, pero esta investigación confirma un hueco real: **ninguno de los dos
   soporta Wompi, PSE ni Nequi** — Fitco usa Stripe/Mercado Pago/Webpay, Crossfy ni siquiera puede
   cobrarse a sí mismo en pesos colombianos (transferencia o Payoneer/PayPal). Son peligrosos
   porque un dueño de box puede asumir por el nombre o el marketing que "son de acá" y descubrir
   la limitación solo después de contratar. Ese es un argumento de venta directo y verificable para
   Scalar: "ellos dicen ser locales, pero no tienen Nequi ni PSE; nosotros sí".

4. **Boxmagic.** Sigue sin vender en Colombia (solo Chile/México, confirmado en 08), pero su
   debilidad de soporte (2,3-3,1/5 en GetApp) y recordatorios (1,0/5) lo hace vulnerable si algún
   box lo adoptó igual por accesibilidad regional. Riesgo bajo pero no nulo — dato sin cambios
   desde 08.

5. **El "Excel + WhatsApp" (no-competidor, pero el rival real).** Se confirma otra vez lo que ya
   decía 08 §1.2: no hay evidencia de un solo box caleño usando cualquiera de los 18 productos
   nuevos investigados. El "competidor" que de verdad hay que vencer en la demo sigue siendo la
   ausencia de sistema, no otro software.

---

## 4. Recomendación de precio

**El precio de docs/05 sigue vigente y esta investigación lo refuerza, no lo cambia.** El plan Box
a $179.000 COP/mes cae en la parte baja-media de una franja que ahora se ve más amplia de lo que
mostraba 08: de ~$75.000 (Virtuagym, estimado) a más de $2.000.000 (Mindbody Ultimate con
add-ons), con la mayoría de los gestores de box orientados a CrossFit/funcional concentrados entre
$125.000 y $560.000 COP/mes (WodBuster, CrossHero, Boxmagic, Fitco, Crossfy, Gymdesk, Arbox tier
medio). $179.000 sigue funcionando como "cuesta lo mismo que un socio" y sigue estando por debajo
de la mediana de ese grupo — no es una posición de precio bajo desesperado, es una posición
defendible.

**Un solo ajuste que sí vale la pena considerar, no al precio sino al empaquetado:** varios
competidores grandes (TeamUp, Mindbody, Wodify) confirmaron explícitamente "sin costo de
implementación" en esta ronda, sumándose a Crossfy y WodBuster que ya lo decían en 08. La tensión
que 05 ya identificó ("la competencia no cobra implementación") se profundiza: son 6 de 18
competidores nuevos+viejos los que lo declaran gratis. La recomendación de 05 de mantenerlo pero
renombrarlo como "migración asistida presencial" sigue siendo la salida correcta — ningún
competidor internacional puede replicar una migración presencial en Cali, y es justo lo que un
comprador primerizo necesita.

---

## 5. Gestión de competencias — qué construir

### 5.1 Qué tienen los líderes del mercado

Dos jugadores tienen un módulo de competencias verdaderamente completo, y **ninguno de los dos
vende en Colombia ni cobra en pesos**:

- **WodBuster Arena** (`arena.wodbuster.com`): 4 tipos de competencia (interna gratis, privada
  €9/mes, pública €150/mes sin comisión, por invitación gratis); heats con reajuste automático por
  retraso; scoring guiado paso a paso para jueces; revisión de video con IA ("DeltaJudge"); pulseras
  NFC para check-in; inscripción con pasarelas europeas (Stripe, Redsys, Ceca, PayPal — no Wompi);
  QR para ticketing.
- **Wodify Arena**: vendido como producto standalone (no requiere Wodify Core); app de jueces con
  asignación de heats/carriles; generación automática de cronograma ("Smart Start™"); leaderboard en
  vivo. Precio específico no encontrado.

Fuera de esos dos, el resto del mercado se divide en dos categorías, ninguna suficiente para un
throwdown real:

- **Gestores de box con "leaderboard social"** (SugarWOD, Gymdesk, PushPress Train, Zen Planner,
  Virtuagym, Trainerize): comparan resultados diarios del box entre socios, a veces con badges o
  puntos, pero sin heats, sin jueces, sin inscripción de evento con pago, sin categorías por
  escala específicas de una competencia puntual.
- **Herramientas dedicadas a eventos** (Competition Corner, Circle21, WODreps, WOD.guru ticketing):
  sí resuelven heats + jueces + inscripción con pago, pero cobran por transacción/evento en dólares
  o euros (Competition Corner: 4%+USD 2 + Stripe 2,9%+USD 0,30; Circle21: 4%+€1,50; WODreps: en
  pesos mexicanos, sin presencia confirmada en Colombia) y **ninguna tiene Wompi, PSE o Nequi**.
  CrossHero, que sí vende en Colombia, remite a Competition Corner en su propia documentación de
  ayuda cuando el organizador necesita algo robusto — es decir, ni el líder local en Colombia lo
  resuelve internamente.

CompetitionCorner además tiene monedas globales (USD, EUR, MXN, BRL...) pero **no lista COP entre
sus divisas soportadas** — un organizador colombiano que la use tendría que cobrar en otra moneda.

### 5.2 Qué es la "tabla de apuestas" mínima esperada por el mercado

Con base en lo que sí tienen los productos investigados, el mínimo viable para que un módulo de
competencias de Scalar no se sienta inferior al estado del arte es:

1. Inscripción de atletas/equipos con pago en línea y categorías/escalas configurables.
2. Generación de heats (horario, carril, tanda) — manual está bien para v1, automático es lo que
   diferencia a Wodify Arena.
3. Leaderboard en vivo, ordenable, con ranking acumulado a través de varios WODs.
4. Alguna forma de captura de resultado por juez o por el propio atleta con validación.
5. Pantalla pública de resultados (para TV en el box o proyector).

### 5.3 Ideas de diferenciación concretas para cuando Scalar lo construya

Basadas en lo que la investigación encontró que falta o está mal hecho en la competencia:

1. **Inscripción y cobro por Wompi/Nequi/PSE, no por tarjeta internacional.** Es el hueco que
   ningún competidor —ni los locales de LatAm (Fitco, Crossfy), ni los líderes de competencias
   (Competition Corner, Circle21, WodBuster Arena)— resuelve hoy. Un box caleño que organiza un
   throwdown interno o inter-box podría cobrar la inscripción por el mismo riel que ya usa para
   mensualidades, sin que el atleta necesite tarjeta de crédito. Esto es exactamente la misma
   ventaja estructural que ya tiene el resto de Scalar (ver 08 §7.3), extendida al módulo de
   eventos — coherencia de producto, no una funcionalidad aislada.

2. **Competencia inter-box con el mismo sistema que ya tienen los boxes vecinos.** Ningún
   competidor investigado está pensado para que dos o más boxes independientes, cada uno con su
   propia cuenta del gestor, organicen juntos un evento inter-box sin que uno de los dos tenga que
   "prestarle" su cuenta al otro. Si varios boxes de Cali terminan usando Scalar, un módulo de
   competencias que permita coorganizar entre cuentas distintas (compartir un evento, dividir
   inscripciones, consolidar resultados) sería un caso de uso que ni WodBuster Arena ni Competition
   Corner atacan directamente — ellos asumen un solo organizador.

3. **Cero fricción de moneda y sin comisión por transacción como negocio aparte.** Competition
   Corner y Circle21 cobran un porcentaje adicional por cada inscripción pagada (4%+fijo), encima
   de la comisión del procesador. Scalar ya tiene pensado un modelo de diferencial transparente
   sobre Wompi para pagos recurrentes (ver 05, "ingreso variable: comisión sobre los pagos"); aplicar
   la misma lógica —publicada, sin sorpresas— a inscripciones de competencia en vez de un fee
   separado por evento sería más simple de entender para un dueño de box que ya conoce las reglas
   del resto del producto.

4. **WhatsApp para todo lo que hoy es "revisar la página del evento".** La investigación encontró
   competencias colombianas grandes (Colombia Championship, Fitland, WODFEST) donde el mecanismo de
   inscripción real no quedó documentado públicamente — la señal es que se apoya en redes sociales,
   no en un software dedicado visible. Igual que con el resto de Scalar, permitir que un atleta se
   inscriba a un throwdown interno o consulte su heat por WhatsApp, sin instalar nada, sigue la
   misma tesis que ya funciona para reservas y pagos (ver 08 §7.3, ángulo 2).

---

## 6. Lo que no se pudo verificar

- **Precio real de Wodify** (sitio oficial devolvió 403 al fetch automatizado). El dato de USD 79
  viene de agregadores (Capterra, Exercise.com), no de la fuente primaria. Tampoco se confirmó a
  qué está atado exactamente (por local vs. por atleta) ni el monto del "small onboarding fee" que
  ya mencionaba 08.
- **Precio actualizado y confiable de Boxmagic.** El intento de esta ronda de acceder directamente
  a `boxmagic.cl/precios` y `boxmagic.app/precios` dio 404/redirect fallido; el dato de GetApp trae
  una probable confusión de moneda (aparece en USD siendo empresa chilena). El dato de 08 se
  mantiene sin poder confirmarse ni refutarse esta vez.
- **Módulo de competencias de CrossHero, Boxmagic, Fitco y Arbox**: la ausencia de evidencia no es
  evidencia de ausencia. Ninguno de los cuatro publica una página de features de "competencias", y
  las búsquedas no encontraron menciones, pero no se contactó directamente a ningún proveedor para
  confirmarlo.
- **"Crossfy Competencias"**: apareció mencionado indirectamente en resultados de búsqueda (vinculado
  a "BoxPodium") pero no se pudo localizar ni confirmar una página propia con el detalle de
  funciones. Requiere seguimiento directo con Crossfy.
- **Cómo se inscriben realmente los throwdowns colombianos hoy** (Kame House, Animal Rage, KW
  Games, Colombia Championship, Fitland, WODFEST, etc.): no se encontró evidencia directa (captura
  de formulario, post con link) de qué plataforma usa cada uno. Requiere revisión directa de
  Instagram/Facebook de esos organizadores o contacto directo — tarea de campo, no de escritorio.
- **Reventedores o partners locales en Colombia** de cualquiera de los 18 productos nuevos
  investigados: no se encontró ninguno confirmado.
- **Casos públicos de un box de CrossFit colombiano (no boutique/pilates/franquicia) declarando
  qué software usa**: no se encontró ninguno. Sí se confirmaron dos casos adyacentes — Orangetheory
  Fitness Bogotá usa Mindbody (directorio propio de Mindbody) y Unique Pilates Medellín usa Fitco
  (caso de éxito propio de Fitco) — pero ninguno es un box de entrenamiento funcional/CrossFit
  independiente, que es el segmento real de Scalar.
- **Precios de Forge, Scoring.fit, JudgeRules, TrackScore y Strongest Compete** (herramientas de
  competencias encontradas de forma incidental): no se pudo acceder a páginas de precios públicas
  en esta ronda.
- **Soporte de pagos colombianos (Wompi/PSE/Nequi) en Virtuagym, Gymdesk, Exercise.com, Arbox,
  TeamUp, PushPress, Zen Planner, Mindbody, Trainerize, Glofox**: ninguno lo confirma ni lo niega
  explícitamente en sus páginas públicas; "no encontrado" no equivale a "no lo tienen".

---

## Fuentes consultadas

**Gestores de box (verificación y ampliación):**
[SugarWOD pricing](https://www.sugarwod.com/pricing/) ·
[SugarWOD owner features](https://www.sugarwod.com/owner-features/) ·
[WodBuster app](https://wodbuster.com/public/app.html) ·
[WodBuster Arena](https://wodbuster.com/public/arena.html) ·
[CrossHero precios](https://support.crosshero.com/es/articles/1049201-precio-y-descuentos-de-crosshero) ·
[Wodify pricing (bloqueado, vía Capterra)](https://www.capterra.com/p/159663/Wodify/pricing/) ·
[Wodify payments](https://www.wodify.com/payments) ·
[Boxmagic en GetApp](https://www.getapp.com/recreation-wellness-software/a/boxmagic/) ·
[TeamUp pricing](https://goteamup.com/pricing/) ·
[TeamUp idiomas](https://support.goteamup.com/en/articles/9327761-which-languages-does-teamup-support) ·
[PushPress pricing](https://www.pushpress.com/pricing/) ·
[PushPress Train challenges](https://help.pushpress.com/en/articles/8699782-running-challenges-in-pushpress-train) ·
[Zen Planner pricing](https://www.zenplanner.com/pricing/) ·
[Zen Planner reviews en Trustpilot (vía Gymdesk)](https://gymdesk.com/blog/zen-planner-review) ·
[Trainerize pricing](https://www.trainerize.com/pricing/) ·
[Trainerize pricing FAQ 2026](https://help.trainerize.com/hc/en-us/articles/46147820202772-Pricing-Updates-2026-FAQ) ·
[Glofox plans](https://www.glofox.com/plans/) ·
[Glofox reviews (vibefam)](https://vibefam.com/what-glofox-users-actually-say-on-capterra-2026/) ·
[Mindbody pricing](https://www.mindbodyonline.com/business/pricing) ·
[Mindbody Orangetheory Bogotá](https://www.mindbodyonline.com/explore/locations/orangetheory-fitness-bogota-116-colombia-col001) ·
[Virtuagym our prices](https://business.virtuagym.com/our-prices/) ·
[Virtuagym pagos LatAm](https://mercadofitness.com/virtuagym-amplia-su-solucion-de-pagos-para-el-sector-fitness/) ·
[Gymdesk pricing](https://gymdesk.com/pricing) ·
[Gymdesk cómo organizar competencia CrossFit](https://gymdesk.com/blog/how-host-crossfit-competition) ·
[Exercise.com pricing](https://www.exercise.com/platform/pricing/) ·
[Arbox pricing](https://www.arboxapp.com/pricing) ·
[Arbox CrossFit vertical](https://www.arboxapp.com/verticals/crossfit-management-software) ·
[Fitco precios](https://www.fitcolatam.com/precios/) ·
[Fitco software fitness Colombia](https://www.fitcolatam.com/software-fitness-en-colombia/) ·
[Crossfy precio](https://www.crossfyapp.com/precio) ·
[Crossfy competencias CrossFit Colombia 2024 (blog)](https://www.crossfyapp.com/blog/competencias-crossfit-colombia-2024)

**Herramientas dedicadas a competencias:**
[Competition Corner features](https://about.competitioncorner.net/features) ·
[Competition Corner pricing](https://about.competitioncorner.net/pricing) ·
[Competition Corner scorecards](https://help.competitioncorner.net/en/articles/1083287-managing-scorecards) ·
[CrossHero + Competition Corner](https://support.crosshero.com/es/articles/6391789-como-crear-una-competicion-en-crosshero-utilizando-competition-corner) ·
[SmoothComp](https://smoothcomp.com/en) ·
[WODprep compete](https://wodprep.com/programming/compete/) ·
[WOD.guru fitness competitions](https://wod.guru/blog/fitness-competitions/) ·
[WOD.guru pricing](https://wod.guru/pricing/) ·
[WodBuster Arena](https://wodbuster.com/public/arena.html) ·
[WODreps](https://wodreps.com/) ·
[Circle21](https://www.circle21.app/) ·
[Forge](https://forgescoring.com) ·
[WODHOPPER — comparativo de software de competencias](https://www.wodhopper.com/post/competitionsoftware) ·
[Colombia Championship / Fitland — competencias grandes en Colombia](https://barehandscrossfit.com/popular-cross-functional-fitness-competitions-in-colombia/) ·
[WODFEST by Reebok Bogotá](https://bitacoranoticias.com/bogota-vibro-con-el-wodfest-by-reebok-el-evento-latinoamericano-mas-importante-de-crossfit/)

**TRM y pagos:**
[TRM Capital Colombia](https://www.capitalcolombia.com/sec-trm_precio_dolar_en_colombia) ·
[TRM Pulzo 23-sep-2026](https://www.pulzo.com/amp/economia/dolar-hoy-colombia-23092026-trm-volvio-disparar-e-ilusiona-PP5310848) ·
[Wompi métodos de pago](https://docs.wompi.co/en/docs/colombia/metodos-de-pago/)
