# Proyecto: Automatización E-Learning → SCORM

## Contexto
Pipeline automatizado para crear cursos e-learning en formato SCORM para Davivienda (LMS: Territorium).

## APIs Configuradas (.env)
- **ElevenLabs**: Text-to-Speech (voz colombiana: "Clau Bogotá Natural Neutral")
- **HeyGen**: Avatares de video
- **Canva**: Diseño (MCP integrado)

---

## FLUJO CANVA VIDEO (RECOMENDADO)

Pipeline de generación de videos con Canva MCP:
```
Streamlit → Audio ElevenLabs → Request JSON → Claude MCP Canva → MP4
```

### Cuando el usuario pide "genera video canva":

1. **Leer el request JSON** de `/output/canva_requests/`
2. **Generar presentación Canva** con los datos del request:
   ```
   - Usar mcp__claude_ai_Canva__request-outline-review
   - Luego mcp__claude_ai_Canva__generate-design-structured
   - Luego mcp__claude_ai_Canva__create-design-from-candidate
   - Finalmente mcp__claude_ai_Canva__export-design (MP4)
   ```
3. **Descargar el MP4** y combinarlo con el audio:
   ```bash
   ffmpeg -y -i video_canva.mp4 -i audio.mp3 \
     -filter_complex "[0:v]setpts=PTS*($AUDIO_DURATION/$VIDEO_DURATION)[v]" \
     -map "[v]" -map 1:a -c:v libx264 -c:a aac -shortest video_final.mp4
   ```

### Ejemplo de request JSON:
```json
{
  "topic": "FATCA y CRS",
  "slides": [
    {"title": "Título", "description": "Puntos clave"},
    ...
  ],
  "audio_path": "/output/.../audio.mp3",
  "audio_duration": 38.5
}
```

---

## APRENDIZAJES Y PROCESOS ESTANDARIZADOS

### 1. Enfoque Slides + Voiceover (Módulo 2 - Implementado)
Pipeline probado y funcional:
```
HTML Slides → Chrome Headless (PNG) → FFmpeg + Audio → Video MP4 → SCORM
```

**Archivos generados:**
- `/output/modulo2_portales/` - Módulo completo de Tipos de Portales
- `slide_01_portada.html` ... `slide_10_quiz_q3.html` - 10 slides HTML
- `base_v2.css` - Template CSS reutilizable con branding Davivienda
- `video_modulo2.mp4` - Video final (109 segundos)
- `scorm_final/` - Paquete SCORM con quiz interactivo

**Comandos clave:**
```bash
# Renderizar HTML a PNG (1920x1080)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu \
  --screenshot="render.png" \
  --window-size=1920,1080 \
  "file://$(pwd)/slide.html"

# Crear segmento de video con imagen + audio
ffmpeg -loop 1 -i render.png -i audio.mp3 \
  -c:v libx264 -tune stillimage -c:a aac \
  -b:a 192k -pix_fmt yuv420p \
  -shortest segment.mp4

# Concatenar segmentos
ffmpeg -f concat -safe 0 -i concat.txt \
  -c copy video_final.mp4
```

### 2. Template CSS Davivienda (`base_v2.css`)
- Logo casita SVG inline (no URLs externas)
- Colores: `--red-primary: #DA291C`, `--yellow-davi: #FFD700`
- Fuentes: Montserrat (títulos), Open Sans (cuerpo)
- Barra de progreso con flechas
- Cards, badges, iconos reutilizables

### 3. SCORM Player con Quiz Interactivo
Características implementadas:
- Controles de video custom (play/pause, seek, ±10s, fullscreen)
- Quiz overlay que pausa video en timestamps específicos
- Keyboard shortcuts (Espacio, Flechas, F)
- SCORM 1.2 API para tracking en Territorium
- Pantalla de resultados con porcentaje

**Estructura del quiz en JS:**
```javascript
const quizzes = [
  { time: 107, question: "...", options: [...], correct: 0 },
  { time: 108, question: "...", options: [...], correct: 2 },
  // ...
];
```

### 4. Voz ElevenLabs
- Voice ID: `SplyIQAjgy4DKGAnOrHi` ("Clau Bogotá Natural Neutral")
- Modelo: `eleven_multilingual_v2`
- Settings: stability 0.6, similarity_boost 0.8
- Costo: ~$0.01-0.02 por clip de 30s

### 5. Notas Técnicas Importantes
- **PIL/Pillow**: Incompatible con arquitectura macOS, usar ImageMagick
- **Chrome headless**: Requiere rutas absolutas para CSS
- **CSS en slides**: Usar `href="base_v2.css"` (mismo directorio), NO rutas relativas externas
- **FFmpeg concat**: Requiere archivo `.txt` con formato `file 'nombre.mp4'`
- **SCORM 1.2**: Compatible con Territorium, usar `cmi.core.lesson_status`

### 6. Correcciones Fonéticas (ElevenLabs)
Palabras que se pronuncian mal y su corrección:

| Palabra | Problema | Corrección | Notas |
|---------|----------|------------|-------|
| Pyme | Dice "PAIM" (inglés) | `Píme` o `Pí-me` | Acentuar la i |
| <!-- agregar más según se detecten --> |

**Cómo aplicar:** Reemplazar en el texto antes de enviar a la API.

```python
FONEMAS = {
    "Pyme": "Píme",
    "pyme": "píme",
    "Pymes": "Pímes",
    "pymes": "pímes",
}

def aplicar_fonemas(texto):
    for palabra, correccion in FONEMAS.items():
        texto = texto.replace(palabra, correccion)
    return texto
```

---

### 7. Voces ElevenLabs - Comparación
Voces probadas para estilo más dinámico:
| Voz | Voice ID | Estilo | Mejor para |
|-----|----------|--------|------------|
| Clau (original) | `SplyIQAjgy4DKGAnOrHi` | Profesional, neutral | Corporativo formal |
| **Valeria** ⭐ | `JddqVF50ZSIR7SRbJE6u` | Casual, conversacional | Podcast/dinámico |
| Gaby | `a0MaQpDjx7p7bZmqzFp1` | Joven, energética | Social media |

**Settings para voz expresiva:**
```python
"voice_settings": {
    "stability": 0.35,        # Más bajo = más variación
    "similarity_boost": 0.7,
    "style": 0.6,             # Más emoción
    "use_speaker_boost": True
}
```

---

## REFERENCIA: Articulate Storyline (VS SCORM)

### Análisis Detallado - "Visión Digital"
SCORM de Facultad Digital Davivienda analizado:

**Herramienta**: Articulate Storyline 360
**Estilo visual**:
- Fondo degradado cyan/turquesa con patrón tech
- Marco con líneas geométricas estilo circuito
- Acentos rojos y elementos flotantes

**Avatar/Presentadora**:
- Video REAL (no IA) - mujer en sweater rojo
- Estudio estilo podcast con neón "Visión Digital"
- Iluminación LED púrpura/magenta
- Mesa blanca, micrófono profesional, taza brandeada
- Posición: parada, moviendose, con frames de contenido al costado

**Estructura de compartimientos (4 videos):**
| Archivo | Duración | Tipo | Contenido |
|---------|----------|------|-----------|
| 5b4hV7j0Zxo | ~17s | Intro corta | Definición transformación digital |
| 5kSD9umna4S | ~30s | Introducción | Presenta los 2 aspectos a analizar |
| 6Kk84iMmfwZ | ~80s | Contenido | Modelos de negocio (Cloud, IoT, Freemium) |
| 6TAzrgifFg9 | ~185s | Video podcast | Los 5 beneficios - estilo entrevista |

**Elementos técnicos:**
- 92 triggers/interacciones
- Transcripts JS con cues timestamped (captions)
- Player con seekbar, volumen, CC
- Framework JS pesado (~4MB)

---

## DISEÑO INSTRUCCIONAL: Estructura de Compartimientos

### Concepto
En lugar de generar todo con HeyGen (caro), combinamos diferentes tipos de segmentos según el contenido:

```
┌─────────────────────────────────────────────────────────────┐
│                    MÓDULO COMPLETO                          │
├─────────────────────────────────────────────────────────────┤
│  [AVATAR]  [SLIDES]  [AVATAR]  [QUIZ]  [SLIDES]  [AVATAR]  │
│   intro    contenido  transic  evalua   datos     cierre   │
│   ~20s     ~60s       ~10s     ~30s     ~40s      ~15s     │
│  HeyGen    HTML+voz   HeyGen   HTML/JS  HTML+voz  HeyGen   │
│  ~$0.50    ~$0.04     ~$0.25   GRATIS   ~$0.03    ~$0.35   │
└─────────────────────────────────────────────────────────────┘
                    Total: ~$1.17 vs ~$4+ todo HeyGen
```

### Tipos de Compartimientos

| Tipo | Tecnología | Costo | Cuándo usar |
|------|------------|-------|-------------|
| **Avatar Presentador** | HeyGen + ElevenLabs | ~$0.05/s | Intro, cierre, transiciones importantes |
| **Slides + Voiceover** | HTML + Chrome + FFmpeg | ~$0.01/30s | Contenido informativo, datos, procesos |
| **Motion Graphics** | HTML/CSS animado | Gratis | Datos que aparecen, diagramas |
| **Quiz Interactivo** | HTML/JS | Gratis | Evaluación, pausas para reflexión |
| **Video Stock** | Pexels/Pixabay | Gratis | B-roll, ilustraciones de conceptos |

### Flujo de Producción Optimizado
```
1. DISEÑO INSTRUCCIONAL
   └─ Definir compartimientos y duraciones

2. PRE-PRODUCCIÓN (Gratis)
   ├─ Guiones por compartimiento
   ├─ Storyboard visual
   └─ Templates HTML

3. AUDIO (Barato - ~$0.02/30s)
   ├─ Generar todos los audios ElevenLabs
   ├─ Iterar hasta perfecto
   └─ Validar duraciones

4. VIDEO AVATAR (Solo lo necesario)
   ├─ Seleccionar avatar HeyGen
   ├─ Generar solo intros/cierres/transiciones
   └─ ~20-30% del contenido total

5. SLIDES + COMPOSICIÓN (Gratis)
   ├─ Renderizar HTML → PNG
   ├─ FFmpeg: imagen + audio → video
   └─ Concatenar todos los segmentos

6. EMPAQUETADO SCORM
   └─ Player interactivo + quizzes
```

---

## Experimentos HeyGen

### Avatares Probados
| Avatar | ID | Estilo | Notas |
|--------|-----|--------|-------|
| **Hada LivelyGestures** ⭐ | `Hada_LivelyGestures_Front_public` | Gestos animados | Mejor para dinamismo |
| Annie Business | `Annie_Business_Casual_Standing_Front_public` | Profesional | Standing, formal |
| Caroline Office | `Caroline_Office_Standing_Front_public` | Corporativo | Standing, serio |
| Adriana BizTalk | `Adriana_BizTalk_Front_public` | Talk show | Sentada |

### Configuración Video Avatar
```python
payload = {
    "video_inputs": [{
        "character": {
            "type": "avatar",
            "avatar_id": "Hada_LivelyGestures_Front_public",
            "avatar_style": "normal"
        },
        "voice": {
            "type": "audio",
            "audio_url": "URL_DEL_AUDIO"
        }
    }],
    "dimension": {"width": 720, "height": 1280}  # Vertical para split
}
```

### Composición Split (Avatar + Contenido)
```bash
ffmpeg -y \
  -i avatar.mp4 -i contenido.png \
  -filter_complex "
    [0:v]scale=672:1080:force_original_aspect_ratio=increase,crop=672:1080[avatar];
    [1:v]scale=1920:1080[bg];
    [bg][avatar]overlay=0:0[out]
  " \
  -map "[out]" -map 0:a \
  -c:v libx264 -c:a aac output.mp4
```

---

## PENDIENTES MÓDULO 2 AVATAR

### Críticos
1. **Logo Davivienda**: Actualizar en todos los templates (usar logo oficial, no el SVG genérico)
2. **Murmullo en transición**: Recortar audio/video al final de cada segmento para evitar el "murmullo" de 1 segundo
3. **Generar videos faltantes**: Segmentos 03-06 (Pyme, Empresarial, Corporativo, Conclusión)

### SCORM Player Features
- [ ] Controles: Play/Pause, Seek, ±10s, Fullscreen
- [ ] Quiz interactivo con timestamps
- [ ] Subtítulos sincronizados (captions)
- [ ] Botón reiniciar
- [ ] Encuadre responsive
- [ ] SCORM 1.2 tracking (cmi.core.lesson_status)
- [ ] Pantalla de resultados

### Mejoras Técnicas
- Crossfade entre segmentos (evitar cortes bruscos)
- Normalizar volumen audio (voz vs música)
- Optimizar tamaño de video para LMS

---

## Archivos Clave del Proyecto
```
ia-davivienda/
├── CLAUDE.md                 # Este archivo - aprendizajes
├── .env                      # API keys (no commitear)
│
├── scripts/                  # Scripts reutilizables
│   ├── generate_module.py    # Pipeline completo de generación
│   └── compose_avatar_split.sh
│
├── templates/                # Sistema modular de templates
│   ├── css/
│   │   ├── brand.css         # Variables de marca Davivienda
│   │   └── components.css    # Componentes reutilizables
│   └── layouts/
│       ├── avatar-split.html     # Avatar (35%) + contenido (65%)
│       ├── content-fullscreen.html # Slides sin avatar
│       └── cover.html            # Portadas de módulo
│
├── output/
│   ├── mvp/                  # MVP inicial
│   ├── modulo2_portales/     # Módulo 2 completo (slides+voz)
│   └── heygen_test/          # Pruebas avatar con gestos
│       ├── avatar_final.mp4      # Avatar HeyGen
│       ├── video_compuesto_v1.mp4 # Avatar + contenido
│       └── intro_valeria_v2.mp3  # Audio corregido
│
└── briefs/                   # Briefs de entrada
```

---

## Costos Estimados
| Recurso | Costo | Notas |
|---------|-------|-------|
| ElevenLabs TTS | ~$0.01/30s | Voz colombiana |
| HeyGen Avatar | ~$0.05-0.10/30s | Video con avatar |
| Chrome/FFmpeg | Gratis | Local |
| **Módulo slides+voz** | ~$0.10-0.15 | Sin avatar |
| **Módulo con avatar** | ~$0.50-1.00 | Con HeyGen |

---

## MVP STREAMLIT - Generador de Mallas (Mayo 2026)

### Descripción
App web local para generar mallas curriculares con IA. Reemplaza el workflow anterior de Google Sheets + Apps Script.

### Cómo correr
```bash
cd /Users/federico/Desktop/ia-davivienda
streamlit run app.py
# Abre http://localhost:8501
```

### Dependencias
```bash
pip install streamlit pandas openai python-docx PyPDF2
```

### Funcionalidades
1. **Tab "Nueva Solicitud"**:
   - Formulario: nombre, audiencia, nivel, duración, área, objetivo, temas
   - Upload de documentación (PDF, DOCX, TXT) - se extrae el texto como contexto
   - Genera malla con GPT-4o

2. **Tab "Malla Actual"**:
   - Tabla editable (modificar celdas directo)
   - Campo de feedback para regenerar con cambios
   - Historial de versiones

3. **Tab "Exportar"**:
   - Descargar CSV/JSON
   - Guardar en `/output`

### API Key
Se carga automáticamente desde `~/Desktop/escalar/.env` (busca `OPENAI_API_KEY=`).
También se puede pegar manualmente en el sidebar.

### Estructura de Malla Generada
```json
[
  {
    "id": 1,
    "etapa": "Introducción|Desarrollo|Cierre",
    "bloque": "Nombre del bloque",
    "objetivo": "Al finalizar, el participante podrá...",
    "tipo_recurso": "Video avatar|Video|Interactivo|Infografía|Comparador|Flashcards|Caso práctico|Quiz",
    "recurso": "Nombre descriptivo",
    "descripcion": "Qué contiene",
    "duracion_min": 2
  }
]
```

### Tipos de Recurso Disponibles
| Tipo | Descripción |
|------|-------------|
| Video avatar | Presentador virtual (HeyGen) |
| Video | Video tradicional sin avatar |
| Interactivo | Botones que revelan info al clic |
| Infografía | Visualización de datos/procesos |
| Comparador | Tabla comparativa interactiva |
| Flashcards | Tarjetas pregunta/respuesta |
| Caso práctico | Escenario con decisiones y feedback |
| Quiz | Preguntas de evaluación |

### Archivos del MVP
```
ia-davivienda/
├── app.py                    # App Streamlit principal
├── output/                   # Mallas exportadas
│   ├── malla_*.csv
│   └── malla_*.json
```

### Notas Técnicas
- Un bloque puede tener múltiples recursos (filas con mismo nombre de bloque)
- La documentación subida se limita a 8000 caracteres para el prompt
- El historial de versiones se guarda en session_state (se pierde al recargar)

---

## PRÓXIMO: Pipeline Completo

### Flujo Objetivo
```
Solicitud (Streamlit)
    → Malla Curricular (GPT-4o)
    → Aprobación/Iteración
    → Guión detallado por recurso
    → Generación de assets (audio, video, slides)
    → Empaquetado SCORM
```

### Scripts Existentes (en /scripts/)
- `generate_malla.py` - Genera malla desde contenido raw
- `generate_guion.py` - Genera guión desde malla aprobada
- `iterate_malla.py` - Itera malla con feedback

---

## SCORM FATCA & CRS - Curso Completo (Mayo 2026)

### Estructura del Curso
```
1. Portada (Cover)
2. Welcome (Genially-style interactivo)
3. Intro Video (Avatar HeyGen + Contenido split)
4. Video de Contenido (Slides + Voiceover)
5. Infografía Interactiva (Flip cards)
6. Comparador (Tabla FATCA vs CRS)
7. Caso Práctico (3 preguntas progresivas)
8. Drag & Drop (Clasificar clientes)
9. Quiz (8 preguntas)
10. Resultados (Certificación)
```

### Archivos del SCORM
```
output/scorm_fatca/
├── index.html          # Estructura principal
├── styles.css          # Estilos completos
├── script.js           # Lógica del curso
├── scorm_api.js        # API SCORM 1.2
├── genially.html       # Template Genially (referencia)
├── imsmanifest.xml     # Manifest SCORM
└── assets/
    ├── logo.png
    ├── intro.mp4           # Video split (avatar + contenido)
    ├── content_video.mp4   # Video slides + voiceover
    ├── bg_music.mp3        # Música de fondo (volumen 0.65)
    ├── quiz_music.mp3      # Música del quiz
    └── frames/             # Frames HTML para intro
        ├── frame_01.html   # Título FATCA & CRS
        ├── frame_02.html   # + FATCA bullet
        ├── frame_03.html   # + CRS bullet
        ├── frame_04.html   # + Tu rol bullet
        └── frame_05.html   # ¡Comencemos!
```

---

## PREFERENCIAS AVATAR Y VOZ (APROBADAS)

### Avatar Preferido: Hada LivelyGestures ⭐
```
Avatar ID: Hada_LivelyGestures_Front_public
Estilo: Gestos animados, dinámico
Formato: Vertical 720x1280 (para split)
```

### Voz Preferida: Valeria ⭐
```
Voice ID: JddqVF50ZSIR7SRbJE6u
Estilo: Casual, conversacional, expresiva
Modelo: eleven_multilingual_v2
```

### Settings de Voz Expresiva
```python
"voice_settings": {
    "stability": 0.35,        # Más bajo = más variación natural
    "similarity_boost": 0.7,
    "style": 0.6,             # Más emoción
    "use_speaker_boost": True
}
```

---

## WORKFLOW: Video Split (Avatar + Contenido)

### Concepto
Video con avatar a la izquierda (35%) y contenido animado a la derecha (65%).
**IMPORTANTE:** El contenido debe tener SIEMPRE texto visible, sin espacios en blanco.

### Paso 1: Generar Audio (ElevenLabs)
```bash
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/JddqVF50ZSIR7SRbJE6u" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Tu guión aquí...",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.35,
      "similarity_boost": 0.7,
      "style": 0.6,
      "use_speaker_boost": true
    }
  }' --output audio.mp3
```

### Paso 2: Subir Audio (para URL pública)
```bash
# Usar tmpfiles.org para obtener URL pública
curl -F "file=@audio.mp3" "https://tmpfiles.org/api/v1/upload"
# Respuesta: {"data":{"url":"https://tmpfiles.org/ID/audio.mp3"}}
# URL directa: https://tmpfiles.org/dl/ID/audio.mp3
```

### Paso 3: Generar Video HeyGen
```bash
curl -X POST "https://api.heygen.com/v2/video/generate" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "video_inputs": [{
      "character": {
        "type": "avatar",
        "avatar_id": "Hada_LivelyGestures_Front_public",
        "avatar_style": "normal"
      },
      "voice": {
        "type": "audio",
        "audio_url": "https://tmpfiles.org/dl/ID/audio.mp3"
      }
    }],
    "dimension": {"width": 720, "height": 1280}
  }'
# Respuesta: {"data":{"video_id":"xxx"}}
```

### Paso 4: Verificar Estado y Descargar
```bash
# Verificar estado (polling cada 30s)
curl -s "https://api.heygen.com/v1/video_status.get?video_id=xxx" \
  -H "X-Api-Key: $HEYGEN_API_KEY"
# Cuando status="completed", descargar video_url
```

### Paso 5: Crear Frames de Contenido
**Estructura de tiempos (ejemplo 25s):**
| Tiempo | Frame | Contenido |
|--------|-------|-----------|
| 0-5s | frame_01 | Título principal |
| 5-12s | frame_02 | + Primer bullet |
| 12-18s | frame_03 | + Segundo bullet |
| 18-23s | frame_04 | + Tercer bullet |
| 23-25s | frame_05 | CTA "¡Comencemos!" |

**Template HTML para frames (1200x1080):**
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            width: 1200px;
            height: 1080px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            font-family: 'Montserrat', sans-serif;
        }
        /* ... estilos de bullets, íconos, etc. */
    </style>
</head>
<body>
    <!-- Contenido acumulativo -->
</body>
</html>
```

### Paso 6: Renderizar Frames a PNG
```bash
for i in 01 02 03 04 05; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless --disable-gpu \
    --screenshot="frame_${i}.png" \
    --window-size=1200,1080 \
    "file://$(pwd)/frame_${i}.html"
done
```

### Paso 7: Crear Segmentos de Video
```bash
# Crear segmento por cada frame con duración específica
ffmpeg -y -loop 1 -i frame_01.png -t 5 -c:v libx264 -pix_fmt yuv420p -r 30 seg_01.mp4
ffmpeg -y -loop 1 -i frame_02.png -t 7 -c:v libx264 -pix_fmt yuv420p -r 30 seg_02.mp4
# ... etc

# Concatenar segmentos
cat > concat.txt << EOF
file 'seg_01.mp4'
file 'seg_02.mp4'
file 'seg_03.mp4'
file 'seg_04.mp4'
file 'seg_05.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i concat.txt -c copy content_video.mp4
```

### Paso 8: Componer Video Split Final
```bash
ffmpeg -y \
  -i avatar.mp4 \
  -i content_video.mp4 \
  -filter_complex "
    [0:v]scale=672:-1,crop=672:1080:0:(in_h-1080)/2[avatar];
    [1:v]scale=1248:1080[content];
    [avatar][content]hstack=inputs=2[out]
  " \
  -map "[out]" \
  -map 0:a \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 192k \
  -shortest \
  intro_final.mp4
```

**Resultado:** Video 1920x1080 con avatar (35% izq) + contenido (65% der)

---

## RECURSOS INTERACTIVOS SCORM

### 1. Infografía con Flip Cards
```html
<div class="info-card-flip">
    <div class="card-inner">
        <div class="card-front fatca"><!-- Frente --></div>
        <div class="card-back fatca"><!-- Dorso con detalles --></div>
    </div>
</div>
```
```javascript
card.addEventListener('click', () => card.classList.toggle('flipped'));
```

### 2. Comparador (Tabla)
```html
<table class="comparison-table">
    <thead>
        <tr>
            <th>Aspecto</th>
            <th class="col-fatca">🇺🇸 FATCA</th>
            <th class="col-crs">🌍 CRS</th>
        </tr>
    </thead>
    <tbody><!-- Filas comparativas --></tbody>
</table>
```

### 3. Caso Práctico (Preguntas Progresivas)
```javascript
// Mostrar siguiente pregunta después de responder
setTimeout(() => {
    currentCasoQuestion++;
    document.getElementById('casoQ' + currentCasoQuestion).style.display = 'block';
}, 2000);
```

### 4. Drag & Drop (con retorno al banco)
```javascript
// Permitir devolver items al contenedor original
dragItemsContainer.addEventListener('drop', (e) => {
    const draggedItem = document.querySelector(`.drag-item[data-id="${itemId}"]`);
    draggedItem.classList.remove('correct', 'incorrect');
    dragItemsContainer.appendChild(draggedItem);
});
```

### 5. Música de Fondo
```javascript
const bgMusic = document.getElementById('bgMusic');
bgMusic.volume = 0.65; // 65% volumen

// Pausar cuando hay video
video.addEventListener('play', () => {
    if (!bgMusic.paused) {
        bgMusic.dataset.wasPlaying = 'true';
        bgMusic.pause();
    }
});
video.addEventListener('ended', () => {
    if (bgMusic.dataset.wasPlaying === 'true') {
        bgMusic.play();
    }
});
```

---

## GUIÓN INTRO FATCA (Ejemplo Aprobado)

```
"Hola! Bienvenido al curso de FATCA y CRS.

Estas son dos normativas internacionales que nos permiten
intercambiar información fiscal con otros países.

FATCA aplica a personas vinculadas con Estados Unidos.

CRS aplica a residentes fiscales de más de 136 países.

Como asesor, tu rol es identificar a estos clientes
y solicitar la documentación correcta.

¡Comencemos!"
```

**Duración:** ~25 segundos
**Estructura de frames:** Acumulativa (cada bullet se suma, nunca desaparece)

---

## CONFIGURACIÓN QUIZ

```javascript
const COURSE_CONFIG = {
    passingScore: 70,        // Puntaje mínimo para aprobar
    totalQuizQuestions: 8    // Total de preguntas
};

const quizQuestions = [
    {
        question: "¿Qué significa FATCA?",
        options: ["Federal...", "Foreign Account Tax Compliance Act", ...],
        correct: 1
    },
    // ... más preguntas
];
```

---

## SERVIDOR LOCAL PARA TESTING

```bash
# Iniciar servidor en puerto 8080
cd /Users/federico/Desktop/ia-davivienda/output/scorm_fatca
python3 -m http.server 8080

# Acceder en: http://localhost:8080
```

---

## JUEGO INTERACTIVO: "El Día del Asesor" (Mayo 2026)

### Descripción
Simulador RPG donde el usuario es un asesor de Davivienda que debe clasificar clientes según FATCA, CRS o Normal.

### Ubicación
```
output/juego_fatca/
├── index.html      # Estructura HTML
├── styles.css      # Estilos tema Davivienda
├── game.js         # Lógica del juego
├── clientes.js     # Base de datos de 23 clientes
├── scorm_api.js    # API SCORM 1.2
└── imsmanifest.xml # Manifest SCORM
```

### Mecánicas
- 3 niveles (días) con dificultad progresiva
- 3 vidas, sistema de puntos con bonus por velocidad y racha
- 23 clientes con casos FATCA, CRS, normales y "trampas"
- Atajos de teclado: 1=FATCA, 2=CRS, 3=Normal, Enter=continuar

### Insignias por Precisión
| Precisión | Insignia |
|-----------|----------|
| >= 90% | 🏆 Asesor Maestro |
| >= 70% | ⭐ Asesor Experto |
| >= 50% | 📋 Asesor Competente |
| < 50% | 📚 Asesor en Formación |

---

## ERRORES COMUNES EN SCORM/LMS

### 1. JavaScript no funciona en LMS (botones no responden)
**Causa:** Errores de JS que rompen la ejecución antes de registrar event listeners.

**Solución:** Envolver TODO en try-catch, especialmente:
- Inicialización SCORM
- Web Audio API
- Cualquier API del navegador que pueda fallar

```javascript
// MAL - Si SCORM falla, rompe todo
function initSCORM() {
    SCORM.init();
    SCORM.set('cmi.core.lesson_status', 'incomplete');
}

// BIEN - Falla silenciosamente
function initSCORM() {
    try {
        if (typeof SCORM !== 'undefined' && SCORM.init) {
            SCORM.init();
        }
    } catch (e) {
        console.log('SCORM not available:', e);
    }
}
```

### 2. Métodos SCORM incorrectos
**Causa:** Usar métodos que no existen en el wrapper SCORM.

**El wrapper `scorm_api.js` tiene estos métodos:**
```javascript
SCORM.init()           // Inicializar
SCORM.setStatus(s)     // 'passed', 'failed', 'incomplete'
SCORM.setScore(n)      // 0-100
SCORM.commit()         // Guardar
SCORM.finish()         // Terminar
```

**NO usar:** `SCORM.set()`, `SCORM.save()`, `SCORM.quit()` (no existen)

### 3. Web Audio API falla en iframe
**Causa:** Algunos LMS bloquean AudioContext en iframes.

**Solución:**
```javascript
function initAudio() {
    try {
        if (!audioCtx && AudioContext) {
            audioCtx = new AudioContext();
        }
    } catch (e) {
        // Audio no disponible, continuar sin sonido
    }
}
```

### 4. Pantalla completa en LMS
**Solución:** Agregar botón que use Fullscreen API:
```javascript
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}
```

---

## CHECKLIST PRE-PUBLICACIÓN SCORM

- [ ] Videos reproducen correctamente
- [ ] Música de fondo funciona (clic en botón 🔇)
- [ ] Navegación anterior/siguiente funciona
- [ ] Flip cards voltean
- [ ] Drag & drop permite devolver items
- [ ] Caso práctico muestra feedback
- [ ] Quiz calcula puntaje correcto
- [ ] Pantalla de resultados muestra aprobado/reprobado
- [ ] imsmanifest.xml tiene todos los archivos listados
- [ ] ZIP del SCORM se sube correctamente a Territorium

---

## MODO AGENTE — Editor HTML/CSS/JS con Claude Agent SDK (Jun 2026)

### Por qué
El editor de contenido actual usa **gpt-4o en single-shot** (`functions/main.py` → `iterar_guion_endpoint`): una sola llamada, sin ver el render, sin verificar, sin reintentar → el output de HTML/CSS/JS queda pobre. El "Modo Agente" replica la potencia de Claude Code: un **loop agéntico que edita → renderiza → ve el error → se autocorrige**.

### Aprendizaje clave: la potencia NO es el modelo, es el harness
El 80% de la diferencia de calidad viene del **loop de verificación**, no de cambiar de modelo. Claude lee el archivo real, hace un edit puntual, **renderiza con Chrome headless, mira el screenshot con sus propios ojos** y corrige. gpt-4o single-shot nunca ve el resultado. (En el spike el agente detectó "el nav se corta en mobile" mirando el render — imposible de saber leyendo solo el código.)

### Arquitectura (`agent-service/`)
```
Frontend Next.js (/dashboard/editor)
   │  POST /agent/edit  (instruction, model)   ◄── stream SSE de progreso en vivo
   ▼
agent-service (Node/Express)
   - agent.mjs   → núcleo: query() del SDK + VERIFY_INSTRUCTIONS (render headless)
   - server.mjs  → API SSE + CORS + sirve /workspace (preview) y /public (playground)
   - spike.mjs   → demo CLI
   - public/index.html → playground local standalone
   - sample-workspace/ → proyecto HTML de prueba (+ .orig backup)
```

### Cómo correr local
```bash
cd agent-service && npm install          # instala @anthropic-ai/claude-agent-sdk
PORT=8090 node server.mjs                # servidor + playground en http://localhost:8090
# o el spike directo:
node spike.mjs "tu instrucción de edición"
```
- Playground standalone: http://localhost:8090
- Integrado al dashboard: levantar el frontend (`cd frontend && npm run dev`) → menú **"Editor IA"** → `/dashboard/editor`.

### Claude Agent SDK — config que usamos (`agent.mjs`)
- Paquete: `@anthropic-ai/claude-agent-sdk` (v0.3.x). Entry: `query(prompt, options)` → async iterator de mensajes (`system/init`, `assistant`, `result`).
- Opciones clave:
  - `cwd`: directorio del proyecto a editar.
  - `model`: `claude-haiku-4-5` | `claude-sonnet-4-6` (default) | `claude-opus-4-8`.
  - `systemPrompt: { type:"preset", preset:"claude_code", append: VERIFY_INSTRUCTIONS }` — hereda todo el comportamiento de Claude Code y le sumamos las reglas de verificación.
  - `permissionMode: "bypassPermissions"` — sin prompts (SOLO dentro de contenedor aislado en prod).
  - `disallowedTools`, `settingSources: []` — aislamiento.
- El SDK **spawnea el CLI de Claude Code** → el contenedor de prod debe incluirlo además del paquete npm.

### Auth y FACTURACIÓN (crítico)
- **Local**: el `.env` tiene `ANTHROPIC_API_KEY` VACÍO → el SDK usa la **sesión del CLI de Claude logueado = la suscripción Claude Max** del usuario (`auth: cli-session`). El `total_cost_usd` que reporta es solo *estimación* equivalente API; local NO se cobra aparte, pero **consume el cupo/rate-limit de Max** (~88k tok/5h en Max 5x, ~220k en Max 20x + tope semanal).
- **Producción (Cloud Run multiusuario)**: NO se puede usar el login Max personal (va contra ToS + rate limits te bloquean). **Requiere API key de Anthropic → pay-per-token real.**
- Precios API (jun 2026, por millón de tokens): Haiku 4.5 $1/$5 · Sonnet 4.6 $3/$15 · Opus 4.7/4.8 $5/$25. Caché de prompt = −90% en lo cacheado.
- Costo medido por edición (Sonnet, optimizado): **~$0.10–0.15**. Haiku ~$0.05, Opus ~$0.25–0.30.
- **Regla de decisión**: Max para tu desarrollo personal (gratis en la práctica). API key para hostear a empresas (compliant + sin paredes de rate limit). Le facturás a la empresa costo API + margen.

### Optimizaciones de costo aplicadas
- Render a media resolución: `--force-device-scale-factor=0.5` (imágenes ~4× más livianas).
- Tope de 2 rondas de autocorrección (antes iteraba sin límite).
- Saltear el render si el cambio es solo de texto.
- Selector de modelo Haiku/Sonnet/Opus por edición.

### Stream SSE (formato que consume el frontend)
```
event: init   data: {"sessionId":"..."}
event: text   data: {"kind":"text","text":"..."}
event: tool   data: {"kind":"tool","name":"Edit","detail":"..."}
event: result data: {"costUsd":0.17,"toolCalls":11,"subtype":"success"}
event: done   data: {"sessionId":"...","costUsd":...,"toolCalls":...}
```
El frontend lo lee con `fetch` + `ReadableStream` (no `EventSource`, porque el endpoint es POST).

### Estado y pendientes
- ✅ Fase 0 (spike) · ✅ Servidor SSE · ✅ Fase 2 (integrado a `/dashboard/editor`)
- ⬜ **Fase 1**: Dockerfile (Node+Chrome+CLI) + sync con Firebase Storage `agents/{sessionId}/` + deploy a Cloud Run (necesita API key + GCP).
- ⬜ **Fase 3**: validar Firebase ID token en el servicio, sandbox reforzado, `resume` multiturno.
- Plan completo: `~/.claude/plans/mellow-seeking-map.md`.

### Gotchas
- macOS arm64: si numpy/pandas/lxml dan `incompatible architecture (x86_64)`, reinstalar con `pip install --force-reinstall --no-cache-dir` (eran wheels x86_64 en Mac arm64).
- El frontend Next.js (16.x) tiene un `AGENTS.md` que avisa que difiere de versiones conocidas → copiar patrones de páginas existentes en vez de asumir.
- La app Streamlit vieja se movió a `streamlit-legacy/` (Dockerfile actualizado para deployar desde ahí).
