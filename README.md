# Pipeline de Producción E-Learning → SCORM

Automatización del flujo de creación de contenido para e-learning.

## Flujo

```
Brief (PDF/MD)
      │
      ▼
┌─────────────────┐
│  01_generate    │  → Guión + Ejercicios
│     _script     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  02_generate    │  → Audio MP3 (ElevenLabs)
│     _audio      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  03_generate    │  → Video MP4 (HeyGen) [opcional]
│     _video      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  04_package     │  → SCORM 1.2 (.zip)
│     _scorm      │
└─────────────────┘
```

## Requisitos

```bash
pip install requests python-dotenv
```

## Configuración

Crear archivo `.env` en la raíz:

```env
ELEVENLABS_API_KEY=tu_api_key
HEYGEN_API_KEY=tu_api_key
```

## Uso

### Ejecutar pipeline completo:

```bash
python src/run_pipeline.py
```

### Con opciones:

```bash
# Solo audio (sin avatar)
python src/run_pipeline.py --title "Mi Curso"

# Con avatar HeyGen
python src/run_pipeline.py --title "Mi Curso" --avatar
```

### Ejecutar pasos individuales:

```bash
python src/01_generate_script.py   # Generar guión
python src/02_generate_audio.py    # Generar audio
python src/03_generate_video_heygen.py  # Generar video
python src/04_package_scorm.py     # Empaquetar SCORM
```

## Estructura del proyecto

```
ia-davivienda/
├── briefs/           # Briefs de entrada (PDF, MD)
├── src/              # Scripts del pipeline
├── templates/        # Templates HTML para SCORM
├── output/           # Archivos generados
│   ├── guion.md
│   ├── ejercicios.json
│   ├── audio_curso.mp3
│   ├── video_curso.mp4
│   └── course_*.zip   # ← SCORM final
└── .env              # API keys (no commitear)
```

## Características del SCORM

- ✅ SCORM 1.2 (compatible con Territorium)
- ✅ Video/Audio integrado
- ✅ Quiz multiple choice
- ✅ Ejercicios drag & drop
- ✅ Tracking de progreso y puntaje
- ✅ Diseño responsive

## APIs utilizadas

| Servicio | Uso | Estado |
|----------|-----|--------|
| ElevenLabs | Text-to-Speech | ✅ Activo |
| HeyGen | Avatares de video | ⚠️ Requiere créditos |
| Canva | Diseño de slides | ✅ Disponible |

## TODO

- [ ] Integrar Claude API para generación automática de guiones
- [ ] Agregar más tipos de ejercicios (ordenar, hotspots)
- [ ] Soporte para SCORM 2004
- [ ] Integración con Google Apps Script
- [ ] Pipeline para procesar PDFs automáticamente
