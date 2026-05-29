#!/usr/bin/env python3
"""
Renderizador de videos Remotion con audio ElevenLabs
Integra el pipeline completo: guion → audio → video animado
"""

import os
import json
import subprocess
import tempfile
from pathlib import Path
from mutagen.mp3 import MP3
import requests
from dotenv import load_dotenv

load_dotenv()

# Configuración
REMOTION_DIR = Path("/Users/federico/Desktop/ia-davivienda/remotion-videos")
OUTPUT_DIR = Path("/Users/federico/Desktop/ia-davivienda/output")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_ID = "JddqVF50ZSIR7SRbJE6u"  # Valeria - conversacional


def generar_audio_elevenlabs(texto: str, output_path: str) -> float:
    """Genera audio con ElevenLabs y retorna duración en segundos"""

    if not ELEVENLABS_API_KEY:
        print("⚠️  No hay API key de ElevenLabs, usando duración estimada")
        # Estimación: ~150 palabras por minuto
        palabras = len(texto.split())
        return (palabras / 150) * 60

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }

    data = {
        "text": texto,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.35,
            "similarity_boost": 0.7,
            "style": 0.5,
            "use_speaker_boost": True
        }
    }

    print(f"🎙️  Generando audio con ElevenLabs...")
    response = requests.post(url, json=data, headers=headers)

    if response.status_code != 200:
        print(f"❌ Error ElevenLabs: {response.status_code}")
        print(response.text)
        return 10.0  # Default 10 segundos

    with open(output_path, 'wb') as f:
        f.write(response.content)

    # Obtener duración real
    audio = MP3(output_path)
    duracion = audio.info.length
    print(f"✅ Audio generado: {duracion:.1f}s")

    return duracion


def render_video(
    titulo: str,
    subtitulo: str,
    bullets: list,
    guion_audio: str,
    output_path: str,
    composition_id: str = "DaviviendaVideo"
) -> str:
    """
    Renderiza un video Remotion con audio

    Args:
        titulo: Título del video
        subtitulo: Subtítulo/descripción
        bullets: Lista de puntos clave
        guion_audio: Texto para el audio
        output_path: Ruta de salida del video
        composition_id: ID de la composición Remotion

    Returns:
        Ruta del video generado
    """

    # Crear directorio temporal para assets
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.mp3")

        # Generar audio
        duracion_audio = generar_audio_elevenlabs(guion_audio, audio_path)

        # Calcular frames (30 fps) + buffer
        duracion_frames = int((duracion_audio + 2) * 30)  # +2 segundos de buffer

        # Copiar audio a carpeta public de Remotion
        public_audio = REMOTION_DIR / "public" / "audio.mp3"
        public_audio.parent.mkdir(exist_ok=True)

        if os.path.exists(audio_path):
            import shutil
            shutil.copy(audio_path, public_audio)
            audio_src = "audio.mp3"  # Remotion usa staticFile
        else:
            audio_src = None

        # Props para Remotion
        props = {
            "titulo": titulo,
            "subtitulo": subtitulo,
            "bullets": bullets,
            "audioSrc": audio_src,
            "duracionFrames": duracion_frames,
        }

        props_json = json.dumps(props)

        # Renderizar con Remotion CLI
        print(f"🎬 Renderizando video ({duracion_frames} frames)...")

        cmd = [
            "npx", "remotion", "render",
            composition_id,
            output_path,
            "--props", props_json,
            "--codec", "h264",
            "--overwrite"
        ]

        result = subprocess.run(
            cmd,
            cwd=REMOTION_DIR,
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            print(f"❌ Error renderizando:")
            print(result.stderr)
            return None

        print(f"✅ Video generado: {output_path}")
        return output_path


def render_from_guion(guion: dict, output_dir: str = None) -> str:
    """
    Renderiza video desde un guion del pipeline

    Args:
        guion: Diccionario con estructura del guion
            {
                "id": 1,
                "titulo": "...",
                "contenido": "...",  # Texto para audio
                "tipo": "video"
            }
        output_dir: Directorio de salida

    Returns:
        Ruta del video generado
    """

    if output_dir is None:
        output_dir = OUTPUT_DIR

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Extraer datos del guion
    guion_id = guion.get("id", 1)
    titulo = guion.get("titulo", "Video")
    contenido = guion.get("contenido", "")

    # Parsear contenido para extraer bullets
    # Asumimos que el contenido tiene bullets separados por saltos de línea
    lineas = [l.strip() for l in contenido.split("\n") if l.strip()]

    # Primera línea como subtítulo, resto como bullets
    if len(lineas) >= 1:
        subtitulo = lineas[0]
        bullets = lineas[1:5] if len(lineas) > 1 else ["Contenido del módulo"]
    else:
        subtitulo = "Aprende los conceptos clave"
        bullets = ["Contenido del módulo"]

    # Generar nombre de archivo
    output_path = str(output_dir / f"video_{guion_id:02d}_{titulo.lower().replace(' ', '_')[:30]}.mp4")

    return render_video(
        titulo=titulo,
        subtitulo=subtitulo,
        bullets=bullets,
        guion_audio=contenido,
        output_path=output_path
    )


# CLI
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Renderizar video Remotion con audio")
    parser.add_argument("--titulo", default="FATCA & CRS", help="Título del video")
    parser.add_argument("--subtitulo", default="Normativas de información fiscal", help="Subtítulo")
    parser.add_argument("--bullets", nargs="+", default=None, help="Lista de bullets")
    parser.add_argument("--guion", default=None, help="Texto del guion para audio")
    parser.add_argument("--output", default="output.mp4", help="Archivo de salida")

    args = parser.parse_args()

    bullets = args.bullets or [
        "FATCA: Ley estadounidense para prevenir evasión fiscal",
        "CRS: Estándar global de la OCDE con 136+ países",
        "Identificación correcta de clientes reportables",
        "Documentación y formularios requeridos",
    ]

    guion = args.guion or """
    Bienvenidos al curso de FATCA y CRS.
    En este módulo aprenderás sobre las normativas internacionales
    de intercambio de información fiscal y cómo aplicarlas
    correctamente en tu trabajo diario con los clientes de Davivienda.
    """

    render_video(
        titulo=args.titulo,
        subtitulo=args.subtitulo,
        bullets=bullets,
        guion_audio=guion,
        output_path=args.output
    )
