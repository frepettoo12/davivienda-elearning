#!/usr/bin/env python3
"""
Pipeline completo: Brief → SCORM

Uso:
    python run_pipeline.py --brief briefs/mi_brief.md --title "Mi Curso"

Opciones:
    --brief     Ruta al archivo brief (markdown o txt)
    --title     Título del curso
    --avatar    Usar HeyGen para video con avatar (requiere créditos)
    --voice     ID de voz de ElevenLabs (opcional)
"""
import argparse
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent

def run_step(script: str, description: str):
    """Ejecutar un paso del pipeline"""
    print(f"\n{'='*50}")
    print(f"▶ {description}")
    print('='*50)

    result = subprocess.run(
        [sys.executable, script],
        cwd=PROJECT_ROOT,
        capture_output=False
    )

    if result.returncode != 0:
        print(f"❌ Error en: {description}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Pipeline Brief → SCORM")
    parser.add_argument("--brief", help="Ruta al brief", default="briefs/ejemplo_seguridad_info.md")
    parser.add_argument("--title", help="Título del curso", default="Seguridad de la Información")
    parser.add_argument("--avatar", action="store_true", help="Usar HeyGen para video")
    parser.add_argument("--voice", help="ID de voz ElevenLabs", default=None)

    args = parser.parse_args()

    print("\n" + "="*50)
    print("🚀 PIPELINE DE PRODUCCIÓN E-LEARNING")
    print("="*50)
    print(f"Brief: {args.brief}")
    print(f"Título: {args.title}")
    print(f"Modo: {'Avatar (HeyGen)' if args.avatar else 'Audio + Slides'}")

    # Paso 1: Generar guión y ejercicios
    run_step("src/01_generate_script.py", "Generando guión y ejercicios")

    # Paso 2: Generar audio
    run_step("src/02_generate_audio.py", "Generando audio con ElevenLabs")

    # Paso 3: Generar video (si se solicita avatar)
    if args.avatar:
        run_step("src/03_generate_video_heygen.py", "Generando video con HeyGen")

    # Paso 4: Empaquetar SCORM
    run_step("src/04_package_scorm.py", "Empaquetando SCORM")

    print("\n" + "="*50)
    print("✅ PIPELINE COMPLETADO")
    print("="*50)
    print(f"\nArchivo SCORM generado en: output/")
    print("Listo para subir a Territorium 🎉")

if __name__ == "__main__":
    main()
