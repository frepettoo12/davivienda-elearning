# Brief para presentación (10 slides) — AI Learning Studio

> Documento autocontenido para armar una presentación de 10 slides sobre la plataforma.
> Audiencia sugerida: decisores de Learning & Development / RRHH / innovación de empresas medianas y grandes.
> Tono: producto real y funcionando (no concepto) — mostrar velocidad, costo y control humano.

---

## Qué es (elevator pitch)

**AI Learning Studio** es una plataforma multiempresa que convierte una solicitud de curso en un
paquete SCORM listo para el LMS corporativo, usando IA en cada etapa pero con **validación humana
en cada decisión importante**. Lo que a un equipo de L&D le toma semanas y miles de dólares con
proveedores externos, acá se resuelve en horas y por menos de $10 de costo variable por curso.

- **URL productiva**: https://ai-learning-studio.web.app (login con Google corporativo)
- **Clientes activos**: Davivienda (banco, Colombia) y ACHS (seguridad y salud laboral, Chile)
- **Salida**: SCORM 1.2 estándar — compatible con Territorium, Moodle y cualquier LMS corporativo

---

## Estructura sugerida de 10 slides

### Slide 1 — Portada
- Título: **AI Learning Studio**
- Bajada: "De la solicitud al curso SCORM en horas, no semanas. IA en cada paso, humanos en cada decisión."
- URL: ai-learning-studio.web.app

### Slide 2 — El problema
- Producir un curso e-learning corporativo hoy: **4–8 semanas** y **USD 3.000–10.000** por módulo con proveedores externos.
- Los equipos de L&D son cuello de botella: cada área pide cursos y la fila crece.
- El contenido queda desactualizado rápido y re-versionarlo cuesta casi lo mismo que hacerlo de nuevo.

### Slide 3 — La solución
- Pipeline completo asistido por IA: **solicitud → diseño instruccional → contenido → audio/video → SCORM → LMS**.
- Cada etapa la propone la IA y la **valida una persona** (human-in-the-loop): nada se publica solo.
- Multiempresa white-label: cada compañía opera con su marca, sus dominios y su contexto de industria.

### Slide 4 — Cómo funciona (el pipeline, para diagrama de flujo)
1. **Solicitud**: cualquier empleado pide un curso desde un formulario (o carga masiva por Excel).
2. **Template**: la IA lee la solicitud y sugiere el template de diseño instruccional (con razón y % de confianza); el diseñador valida o cambia.
3. **Malla curricular**: la IA genera la estructura del curso (etapas, bloques, objetivos con verbos de Bloom, tipos de recurso, duraciones). Se itera con feedback en lenguaje natural.
4. **Guiones**: la IA escribe el guión de cada recurso (voiceover, preguntas de quiz, casos prácticos) con ejemplos de la industria del cliente.
5. **Contenido**: cada recurso se convierte en HTML interactivo editable con un **agente de IA que ve el resultado renderizado y se autocorrige** (el diferencial técnico — slide 5).
6. **Audio y video**: voz sintética natural (ElevenLabs) y presentadores avatar (HeyGen), componibles en videos "avatar + slides".
7. **SCORM**: empaquetado automático SCORM 1.2 con player navegable, tracking de progreso y aprobación por quizzes.
8. **LMS**: descarga y subida al LMS corporativo.

### Slide 5 — El diferencial técnico: el Modo Agente
- El editor de contenido no es un chat que "adivina" código: es un **agente (Claude Agent SDK)** que edita el HTML, **lo renderiza en un navegador real, mira el screenshot con visión propia y corrige** lo que quedó mal (overflow, texto cortado, contraste) — hasta 2 rondas de auto-verificación.
- El humano pide cambios en lenguaje natural ("hacé el comparador más visual, con tarjetas") y ve el resultado en vivo.
- Se pueden adjuntar imágenes de referencia y el agente replica el estilo.

### Slide 6 — Multiempresa (white-label real)
- Cada empresa configura desde el dashboard: **colores, logo (subible), fuentes, nombre**, industria (contextualiza los prompts de IA), áreas internas, voz y avatar default, puntaje de aprobación, LMS destino.
- El branding fluye a TODO: la interfaz, los recursos generados, los videos, los emails y el paquete SCORM.
- Acceso por dominio de email corporativo (quien entra con @empresa.com cae en su empresa, con datos 100% aislados).
- Alta de una empresa nueva: una fila en una planilla → operativa en 15 minutos, sin código.
- Rol **superadmin** para el equipo de plataforma: opera todas las empresas desde un selector.

### Slide 7 — Templates de diseño instruccional
- Los cursos no se generan "a ojo": parten de **templates pedagógicos** (Compliance crítico, Onboarding, Proceso/Sistema, Habilidades blandas, Producto/Ventas) que definen enfoque, estructura por etapas, mix de recursos y gamificación.
- Los templates son **editables y extensibles por empresa** — cada cliente puede codificar su propia metodología.
- La IA elige el template leyendo la solicitud; el diseñador siempre tiene la última palabra.

### Slide 8 — Costos (el número que vende)
Costo variable de UN curso completo (~15 min de contenido, con avatar, iteraciones incluidas):

| Componente | Costo |
|---|---|
| Video avatar (HeyGen, con regeneraciones) | ~$4.50 |
| Voz sintética (ElevenLabs) | ~$1.35 |
| Ediciones del agente de contenido (Claude) | ~$1.44 |
| Generación de malla y guiones (LLM) | ~$0.10 |
| **Total variable por curso** | **≈ $7.40** |

- Infraestructura fija: **~$0–10/mes** (serverless, escala desde cero).
- Comparación: el mismo curso con proveedor externo: **USD 3.000–10.000 y semanas de ida y vuelta**.
- Un curso sin avatar (solo slides + voz) baja a **menos de $1**.

### Slide 9 — Estado actual y roadmap
**Hoy en producción:**
- Plataforma completa desplegada (Firebase/GCP, serverless).
- 2 empresas operando (Davivienda, ACHS), datos aislados, marca propia.
- 12 tipos de recurso: video avatar, video slides, quiz, caso práctico, flashcards, comparador, infografía, interactivos, drag & drop, timeline, accordion, simulador.
- Notificaciones por email con @menciones, flujo de aprobación de solicitudes.

**Próximos pasos:**
- Editor agéntico en la nube (hoy el resto es cloud; el editor corre on-premise).
- Integración directa con APIs de LMS (subida automática).
- Templates de guiones por tipo de recurso (mismo modelo que los de malla).
- Analytics de consumo y costos por empresa.

### Slide 10 — Cierre / llamado a la acción
- "Tu equipo de L&D deja de producir cursos y pasa a **dirigirlos**."
- Demo en vivo: solicitud → curso SCORM en una sesión.
- URL + contacto.

---

## Datos de apoyo (por si Cowork necesita más contexto)

- **Stack**: Next.js (dashboard) + Firebase/GCP serverless (Functions Python, Firestore, Storage, Hosting) + Claude Agent SDK (editor agéntico) + GPT-4o (mallas/guiones) + ElevenLabs (TTS) + HeyGen (avatares) + FFmpeg (composición de video).
- **Seguridad**: login Google corporativo, autenticación por token en todos los endpoints, datos segregados por empresa (tenant), roles (equipo Learning / solicitante / superadmin).
- **Human-in-the-loop en 4 puntos**: validación del template, aprobación/iteración de la malla, edición del contenido, y revisión final antes de empaquetar.
- **SCORM**: 1.2 single-SCO, player con menú por bloques, progreso, bookmark/resume, aprobación por promedio de quizzes contra puntaje configurable por empresa.
- **Tiempo de ciclo observado**: de solicitud aprobada a SCORM descargable en el mismo día.
- No usar el nombre "Davivienda" como nombre del producto — el producto es **AI Learning Studio**; Davivienda y ACHS son clientes.
