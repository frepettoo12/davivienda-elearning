# Resumen de Costos — Pipeline E-Learning IA (Davivienda)

> Documento para estimar y presentar el costo de operar el pipeline.
> Fecha: jun 2026. Los precios de IA (por token) son firmes; los de ElevenLabs/HeyGen
> dependen del **plan contratado** (facturan por créditos) → confirmar el plan real.

---

## 0. Cómo leer este documento — las dos naturalezas del costo

| Tipo | Qué es | Cómo escala | Ejemplos |
|------|--------|-------------|----------|
| **Variable** | Se paga por uso | Sube con la cantidad de cursos/minutos generados | Gemini, Claude, ElevenLabs, HeyGen, SendGrid |
| **Fijo (infra)** | Hosting siempre prendido | Casi plano hasta que haya mucho tráfico | Firebase Functions, Firestore, Storage, Cloud Run |

La unidad de negocio natural es **el curso** (y dentro de él, el **recurso** y el **minuto de media**).
Todo lo de abajo se traduce a "cuánto cuesta producir 1 curso".

---

## 1. Unidades de medida por servicio (lo central)

Cada API factura en su propia unidad técnica. Esta es la tabla que hay que tener clara:

| Servicio | Para qué se usa | Unidad de facturación (técnica) | Unidad de negocio (cómo la traducimos) |
|----------|-----------------|----------------------------------|-----------------------------------------|
| **Gemini 2.5 Flash** | Generar mallas y guiones (texto) | **Tokens** (input + output), por 1M | Por malla y por guión generado |
| **Anthropic Claude** (Agent SDK) | Editar HTML/CSS/JS de cada recurso | **Tokens** (input + output, con caché), por 1M | Por **edición** de recurso |
| **ElevenLabs** | Voz (TTS) | **Caracteres** de texto (créditos) | Por **minuto de audio** |
| **HeyGen** | Video con avatar | **Créditos** (≈ minutos de video) | Por **minuto de video avatar** |
| **SendGrid** | Emails (notificaciones/menciones) | **Email enviado** | Por email |
| **Cloud Functions** | Backend (mallas, audio, video, SCORM) | **Invocaciones** + **GB-segundo** de cómputo | Por curso (varias llamadas) |
| **Firestore** | Base de datos | **Documentos** leídos / escritos / borrados | Por curso (despreciable) |
| **Cloud Storage** | Guardar audio/video/SCORM | **GB almacenados/mes** + **GB transferidos** (egress) | Por curso almacenado + por vista |
| **Cloud Run** | agent-service (compone video con ffmpeg) | **vCPU-segundo** + **GiB-segundo** + requests | Por video compuesto |

---

## 2. Costos VARIABLES — las 4 unidades de medida (jun 2026)

Todo lo que escala con el uso se reduce a **4 variables**. Esta es la tabla de precio por unidad:

| # | Variable | Unidad de medida | Precio por unidad | Qué la mueve |
|---|----------|------------------|-------------------|--------------|
| 1 | **Minuto de avatar (HeyGen)** | 1 minuto de video con avatar | **~$0.50/min** *(rango 0.30–1.00)* | Intros, cierres, transiciones. **Se genera ~3× hasta quedar bien → se factura ×3.** |
| 2 | **Minuto de voz (ElevenLabs)** | 1 minuto de audio TTS | **~$0.15/min** *(rango 0.10–0.30)* | Voiceover de slides y videos de contenido |
| 3 | **Edición de Claude** | 1 edición de un recurso (editar→renderizar→corregir) | **~$0.12** *(Haiku $0.05 · Sonnet $0.12 · Opus $0.27)* | Cada vez que se itera el HTML/diseño de un recurso |
| 4 | **Texto Gemini 2.5 Flash** | 1 curso ≈ ~70k tokens | **~$0.10/curso** *($0.30/1M in · $2.50/1M out)* | Generar la malla + los guiones + iteraciones |

> **Las 2 primeras (HeyGen/ElevenLabs) son las más "blandas":** facturan por plan/créditos, así que
> el $/min depende del plan contratado. **Acción:** confirmar el plan de cada uno para fijar el número.
>
> **Iteración del avatar:** igual que el contenido se itera con Claude, el video de avatar rara vez
> sale bien a la primera → se asume **~3 generaciones** por minuto final (factor editable).
>
> **SendGrid (emails):** gratis hasta 100/día → el volumen actual entra holgado en el tier gratis. **$0.**

### La fórmula del costo de un curso

```
Costo_curso (USD) = (min_avatar × 3 generaciones × $0.50)   ← HeyGen
                  + (min_voz                      × $0.15)   ← ElevenLabs
                  + (ediciones                    × $0.12)   ← Claude
                  + $0.10                                    ← Gemini (texto del curso)
```

Cambiando las variables se recalcula cualquier curso. El bloque de infra (sección 3) es aparte y casi fijo.

---

## 3. Costos FIJOS de infraestructura (por mes, GCP/Firebase)

Todos tienen **tier gratis** generoso. Con el volumen actual (uso interno del equipo Learning),
la mayoría queda **dentro del free tier** o en pocos dólares.

| Servicio | Tier gratis mensual | Precio si se excede | Estimado a este volumen |
|----------|---------------------|----------------------|--------------------------|
| **Cloud Functions** | 2M invocaciones, 400k GB-seg | $0.40/M invoc. + $0.0000025/GB-seg | **~$0** (dentro del free) |
| **Firestore** | 50k lecturas, 20k escrituras/día, 1 GB | $0.06/100k lecturas, $0.18/100k escrituras | **~$0** |
| **Cloud Storage** | 5 GB | $0.026/GB/mes almacenado + $0.12/GB egress | **~$0.50–3/mes** (videos pesan) |
| **Cloud Run** (agent-service) | 180k vCPU-seg, 360k GiB-seg, 2M req | $0.000024/vCPU-seg + $0.0000025/GiB-seg | **~$0–5/mes** (ffmpeg es CPU-intensivo) |
| **Firebase Hosting / Auth** | Hosting 10 GB, Auth gratis (Google) | egress extra | **~$0** |

**Infra fija total estimada: ~$5–15 USD/mes** mientras sea uso interno.
Escala con: cantidad de videos almacenados (Storage), vistas de cursos (egress) y
composiciones de video (Cloud Run). Cloud Run escala a cero → **sin costo cuando nadie lo usa**.

---

## 4. La receta de 1 CURSO (en las 4 variables)

Curso de referencia: **~10 recursos**, **~12 minutos** de contenido total. Esos 12 min se reparten
entre avatar (caro, solo intros/cierres) y voz (barato, todo el contenido).

> **1 curso estándar = 3 min de avatar (×3 generaciones) + 9 min de voz + 12 ediciones de Claude + 1 texto Gemini**

| Variable | Cantidad | Precio unitario | Subtotal |
|----------|----------|-----------------|----------|
| 🎭 Avatar (HeyGen) | **3 min × 3 generaciones = 9 min** | $0.50/min | **$4.50** |
| 🎙️ Voz (ElevenLabs) | **9 min** | $0.15/min | **$1.35** |
| 🤖 Ediciones de Claude (Sonnet) | **12 ediciones** | $0.12 | **$1.44** |
| 📝 Texto Gemini (malla + guiones) | **1 curso** | $0.10 | **$0.10** |
| | | **TOTAL VARIABLE** | **≈ $7.40 / curso** |

*(Infra fija aparte: ~$0.10/curso prorrateado — ver sección 3.)*

### Escalado por tamaño de curso

Misma fórmula, distintas cantidades. *(Avatar = minutos finales; se factura ×3 por las generaciones.)*

| Tamaño | Avatar (final) | Voz | Ediciones | Costo variable |
|--------|----------------|-----|-----------|----------------|
| **Chico** (5 recursos, ~6 min) | 1.5 min (×3) | 4.5 min | 6 | **≈ $3.75** |
| **Estándar** (10 recursos, ~12 min) | 3 min (×3) | 9 min | 12 | **≈ $7.40** |
| **Grande** (15 recursos, ~20 min) | 5 min (×3) | 15 min | 20 | **≈ $12.25** |

### Palancas para bajar el costo

| Palanca | Efecto |
|---------|--------|
| **Menos avatar, más voz** | Cada minuto final de avatar cuesta **~$1.50** (se genera 3×); pasarlo a voz ahorra **~$1.35/min**. Es la palanca **más fuerte**. |
| Bajar las **generaciones de avatar** (mejores prompts/seed) | De ×3 a ×2 generaciones: el bloque de avatar cae de $4.50 a **$3.00** (curso estándar a ~$5.90). |
| Usar **Haiku** en vez de Sonnet para ediciones simples | 12 ediciones: $1.44 → **$0.60** (curso estándar baja a ~$6.55). |
| Caché de prompt en Claude/Gemini | −90% sobre tokens repetidos (plantillas, contexto fijo). |

**Driver principal del costo:** el **avatar HeyGen** (~60% al iterarse ×3). Por eso la regla de
oro es usarlo solo en intros/cierres y mover todo lo posible a **voz** (10× más barato por minuto).

---

## 5. Desarrollo vs Producción (importante para el presupuesto)

| Entorno | Cómo factura el agente Claude | Costo real |
|---------|-------------------------------|------------|
| **Local (desarrollo)** | Usa la **suscripción Claude Max** del dev (sesión CLI) | **$0 extra** — consume cupo de Max, no se factura por token |
| **Producción (Cloud Run, multiusuario)** | Requiere **API key de Anthropic** → pay-per-token | El ~$1.44/curso de ediciones de la tabla de arriba |

→ Mientras se desarrolla, la parte de Claude es prácticamente gratis (cubierta por Max).
El costo real de Claude **aparece al pasar a producción** con API key.

---

## 6. Resumen ejecutivo

- **Costo de producir 1 curso: ~$7.40 USD** (variable, dominado por el avatar HeyGen al iterarse ×3).
  Sin avatar (solo voz + slides) baja a **~$3 USD**.
- **Infraestructura: ~$5–15 USD/mes** (fija, casi todo dentro del free tier de GCP; escala con storage/tráfico).
- **Modelo de cobro a Davivienda:** costo API real + margen. La unidad de venta más limpia es
  **"por curso"** (o por minuto de media para casos a medida).
- **A confirmar para cerrar números exactos:**
  1. Plan contratado de **ElevenLabs** (define $/min audio).
  2. Plan contratado de **HeyGen** (define $/min avatar — el más caro).
  3. Modelo Claude por defecto en prod (**Haiku vs Sonnet** cambia ~$1.40/curso).
  4. Volumen mensual esperado de cursos (para proyectar el total).

---

### Anexo — dónde está configurado cada costo (trazabilidad)

| Costo | Archivo |
|-------|---------|
| Texto (Gemini) | `functions/core/services/malla_service.py`, `guion_service.py`, `functions/main.py` — **hoy usa `gpt-4o`; migrar a Gemini pendiente** |
| Claude Agent | `agent-service/agent.mjs` (modelo `claude-sonnet-4-6`, tracking `costUsd`) |
| ElevenLabs | `functions/core/generators/audio.py` |
| HeyGen | `functions/core/generators/video.py` |
| SendGrid | `functions/core/notifications.py` |
| Functions (memoria/timeout) | `functions/main.py` (endpoints con `GB_1`, `timeout_sec=540`) |
| Storage / Firestore | `functions/main.py` (bucket `davivienda-elearning-assets`) |
| Cloud Run | `agent-service/server.mjs`, `Dockerfile` |
