"""
Paso 4: Empaquetar todo en SCORM 1.2
"""
import os
import json
import shutil
import zipfile
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "output"
TEMPLATE_DIR = PROJECT_ROOT / "templates"

def load_exercises():
    """Cargar ejercicios desde JSON"""
    with open(OUTPUT_DIR / "ejercicios.json") as f:
        return json.load(f)

def generate_quiz_html(quiz_data):
    """Generar HTML del quiz"""
    html = ""
    for q in quiz_data:
        if q["type"] == "multiple_choice":
            options_html = ""
            for i, opt in enumerate(q["options"]):
                options_html += f'''
                <div class="option" onclick="selectOption({q['id']}, {i})">
                    <span class="option-marker">{chr(65+i)}</span>
                    <span>{opt}</span>
                </div>'''

            html += f'''
            <div class="question-card" id="question-{q['id']}">
                <div class="question-number">Pregunta {q['id']}</div>
                <div class="question-text">{q['question']}</div>
                <div class="options">{options_html}</div>
                <div class="feedback"></div>
            </div>'''

        elif q["type"] == "true_false":
            html += f'''
            <div class="question-card" id="question-{q['id']}">
                <div class="question-number">Pregunta {q['id']}</div>
                <div class="question-text">{q['question']}</div>
                <div class="options">
                    <div class="option" onclick="selectOption({q['id']}, 0)">
                        <span class="option-marker">V</span>
                        <span>Verdadero</span>
                    </div>
                    <div class="option" onclick="selectOption({q['id']}, 1)">
                        <span class="option-marker">F</span>
                        <span>Falso</span>
                    </div>
                </div>
                <div class="feedback"></div>
            </div>'''

    return html

def generate_dd_html(dd_data):
    """Generar HTML del drag & drop"""
    items_html = ""
    for item in dd_data["items"]:
        items_html += f'''
        <div class="dd-item" data-id="{item['id']}" draggable="true">
            {item['text']}
        </div>'''

    zones_html = ""
    category_names = {"phishing": "🚨 Phishing", "legitimo": "✅ Legítimo"}
    for cat in dd_data["categories"]:
        zones_html += f'''
        <div class="drop-zone" data-category="{cat}">
            <h3>{category_names.get(cat, cat)}</h3>
        </div>'''

    return items_html, zones_html

def create_imsmanifest(course_id: str, course_title: str):
    """Crear archivo imsmanifest.xml para SCORM 1.2"""
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{course_id}" version="1.0"
    xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
    http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">

    <metadata>
        <schema>ADL SCORM</schema>
        <schemaversion>1.2</schemaversion>
    </metadata>

    <organizations default="org1">
        <organization identifier="org1">
            <title>{course_title}</title>
            <item identifier="item1" identifierref="res1">
                <title>{course_title}</title>
            </item>
        </organization>
    </organizations>

    <resources>
        <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="index.html">
            <file href="index.html"/>
            <file href="audio_curso.mp3"/>
        </resource>
    </resources>
</manifest>'''

def generate_video_content(has_video: bool, has_audio: bool):
    """Generar HTML del contenido multimedia"""
    if has_video:
        return '''
        <div class="video-container">
            <video controls>
                <source src="video_curso.mp4" type="video/mp4">
                Tu navegador no soporta video HTML5.
            </video>
        </div>'''
    elif has_audio:
        return '''
        <div class="audio-player">
            <div class="audio-visual">🎧</div>
            <p style="color: white; margin-bottom: 20px;">Escucha el contenido del curso</p>
            <audio controls>
                <source src="audio_curso.mp3" type="audio/mpeg">
                Tu navegador no soporta audio HTML5.
            </audio>
        </div>'''
    else:
        return '<p>Contenido no disponible</p>'

def package_scorm(course_title: str = "Seguridad de la Información",
                  course_id: str = None,
                  duration: str = "15 minutos"):
    """Empaquetar todo en un archivo SCORM"""

    if course_id is None:
        course_id = f"course_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    print("=" * 50)
    print(f"Empaquetando SCORM: {course_title}")
    print("=" * 50)

    # Crear directorio temporal para el paquete
    package_dir = OUTPUT_DIR / "scorm_package"
    if package_dir.exists():
        shutil.rmtree(package_dir)
    package_dir.mkdir()

    # Cargar ejercicios
    exercises = load_exercises()
    quiz_data = exercises["quiz"]
    dd_data = exercises["drag_drop"]

    # Generar HTML de ejercicios
    quiz_html = generate_quiz_html(quiz_data)
    dd_items_html, dd_zones_html = generate_dd_html(dd_data)

    # Detectar contenido multimedia disponible
    has_video = (OUTPUT_DIR / "video_curso.mp4").exists()
    has_audio = (OUTPUT_DIR / "audio_curso.mp3").exists()
    video_content = generate_video_content(has_video, has_audio)

    # Convertir quiz_data para JavaScript (manejar True/False de Python)
    quiz_data_js = []
    for q in quiz_data:
        q_copy = q.copy()
        if q["type"] == "true_false":
            # Convertir False de Python a 1 (índice de "Falso") o 0 (índice de "Verdadero")
            q_copy["correct"] = 1 if q["correct"] == False else 0
        quiz_data_js.append(q_copy)

    # Leer template y reemplazar placeholders
    with open(TEMPLATE_DIR / "scorm_template.html") as f:
        template = f.read()

    html = template.replace("{{COURSE_TITLE}}", course_title)
    html = html.replace("{{DURATION}}", duration)
    html = html.replace("{{VIDEO_CONTENT}}", video_content)
    html = html.replace("{{QUIZ_CONTENT}}", quiz_html)
    html = html.replace("{{DD_INSTRUCTION}}", dd_data["instruction"])
    html = html.replace("{{DD_ITEMS}}", dd_items_html)
    html = html.replace("{{DD_ZONES}}", dd_zones_html)
    html = html.replace("{{QUIZ_DATA}}", json.dumps(quiz_data_js))
    html = html.replace("{{DD_DATA}}", json.dumps(dd_data))

    # Guardar HTML
    with open(package_dir / "index.html", "w") as f:
        f.write(html)
    print("✅ index.html generado")

    # Copiar archivos multimedia
    if has_audio:
        shutil.copy(OUTPUT_DIR / "audio_curso.mp3", package_dir / "audio_curso.mp3")
        print("✅ Audio copiado")

    if has_video:
        shutil.copy(OUTPUT_DIR / "video_curso.mp4", package_dir / "video_curso.mp4")
        print("✅ Video copiado")

    # Crear imsmanifest.xml
    manifest = create_imsmanifest(course_id, course_title)
    with open(package_dir / "imsmanifest.xml", "w") as f:
        f.write(manifest)
    print("✅ imsmanifest.xml generado")

    # Crear archivo ZIP
    zip_path = OUTPUT_DIR / f"{course_id}.zip"
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file in package_dir.iterdir():
            zipf.write(file, file.name)

    print(f"\n✅ SCORM empaquetado: {zip_path}")
    print(f"   Tamaño: {zip_path.stat().st_size / 1024:.1f} KB")

    # Limpiar directorio temporal
    shutil.rmtree(package_dir)

    return zip_path

if __name__ == "__main__":
    package_scorm()
