#!/usr/bin/env python3
"""
GENERADOR DE MÓDULOS E-LEARNING
Pipeline automatizado: Guión → Audio → Avatar → Composición → SCORM
"""

import os
import sys
import json
import time
import requests
import subprocess
from pathlib import Path

# Cargar .env
from dotenv import load_dotenv
load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")

# ============================================
# CONFIGURACIÓN
# ============================================

VOCES = {
    "clau": "SplyIQAjgy4DKGAnOrHi",      # Profesional, neutral
    "valeria": "JddqVF50ZSIR7SRbJE6u",   # Casual, conversacional
    "gaby": "a0MaQpDjx7p7bZmqzFp1",      # Joven, energética
}

AVATARES = {
    "hada_gestos": "Hada_LivelyGestures_Front_public",
    "annie_business": "Annie_Business_Casual_Standing_Front_public",
    "caroline_office": "Caroline_Office_Standing_Front_public",
}

# Correcciones fonéticas
FONEMAS = {
    "Pyme": "Píme",
    "pyme": "píme",
    "Pymes": "Pímes",
    "pymes": "pímes",
}

VOICE_SETTINGS_EXPRESIVO = {
    "stability": 0.35,
    "similarity_boost": 0.7,
    "style": 0.6,
    "use_speaker_boost": True
}

VOICE_SETTINGS_NEUTRAL = {
    "stability": 0.6,
    "similarity_boost": 0.8,
    "style": 0.0,
    "use_speaker_boost": False
}

# ============================================
# FUNCIONES
# ============================================

def aplicar_fonemas(texto):
    """Aplica correcciones fonéticas al texto"""
    for palabra, correccion in FONEMAS.items():
        texto = texto.replace(palabra, correccion)
    return texto


def generar_audio(texto, voz="valeria", expresivo=True, output_path="audio.mp3"):
    """Genera audio con ElevenLabs"""
    texto = aplicar_fonemas(texto)
    voice_id = VOCES.get(voz, VOCES["valeria"])
    settings = VOICE_SETTINGS_EXPRESIVO if expresivo else VOICE_SETTINGS_NEUTRAL

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "text": texto,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": settings
    }

    print(f"  Generando audio con {voz}...")
    r = requests.post(url, headers=headers, json=payload)

    if r.status_code == 200:
        with open(output_path, "wb") as f:
            f.write(r.content)
        print(f"  ✓ Audio: {output_path}")
        return output_path
    else:
        print(f"  ✗ Error: {r.status_code} - {r.text}")
        return None


def subir_audio_temporal(audio_path):
    """Sube audio a tmpfiles.org y retorna URL pública"""
    print(f"  Subiendo audio a URL pública...")
    r = requests.post(
        "https://tmpfiles.org/api/v1/upload",
        files={"file": open(audio_path, "rb")}
    )
    if r.status_code == 200:
        url = r.json()["data"]["url"].replace("tmpfiles.org/", "tmpfiles.org/dl/")
        print(f"  ✓ URL: {url}")
        return url
    return None


def generar_avatar_video(audio_url, avatar="hada_gestos", output_path="avatar.mp4"):
    """Genera video con avatar HeyGen"""
    avatar_id = AVATARES.get(avatar, AVATARES["hada_gestos"])

    url = "https://api.heygen.com/v2/video/generate"
    headers = {
        "X-Api-Key": HEYGEN_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "video_inputs": [{
            "character": {
                "type": "avatar",
                "avatar_id": avatar_id,
                "avatar_style": "normal"
            },
            "voice": {
                "type": "audio",
                "audio_url": audio_url
            }
        }],
        "dimension": {"width": 720, "height": 1280}
    }

    print(f"  Generando video HeyGen con {avatar}...")
    r = requests.post(url, headers=headers, json=payload)
    result = r.json()

    if "data" not in result:
        print(f"  ✗ Error: {result}")
        return None

    video_id = result["data"]["video_id"]
    print(f"  Video ID: {video_id}")

    # Poll hasta completar
    status_url = f"https://api.heygen.com/v1/video_status.get?video_id={video_id}"
    for i in range(40):  # Max ~7 min
        time.sleep(10)
        status_r = requests.get(status_url, headers=headers)
        status_data = status_r.json()
        status = status_data.get("data", {}).get("status", "unknown")
        print(f"    [{i+1}] {status}")

        if status == "completed":
            video_url = status_data["data"]["video_url"]
            video_content = requests.get(video_url).content
            with open(output_path, "wb") as f:
                f.write(video_content)
            print(f"  ✓ Avatar: {output_path}")
            return output_path
        elif status == "failed":
            print(f"  ✗ Error: {status_data}")
            return None

    print("  ✗ Timeout")
    return None


def renderizar_template(template_path, output_path):
    """Renderiza HTML a PNG con Chrome headless"""
    print(f"  Renderizando template...")
    cmd = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "--headless", "--disable-gpu",
        f"--screenshot={output_path}",
        "--window-size=1920,1080",
        f"file://{template_path}"
    ]
    subprocess.run(cmd, capture_output=True)
    print(f"  ✓ Render: {output_path}")
    return output_path


def componer_video_split(avatar_path, background_path, output_path):
    """Compone avatar (izq) + contenido (der) con FFmpeg"""
    print(f"  Componiendo video split...")
    cmd = [
        "ffmpeg", "-y",
        "-i", avatar_path,
        "-i", background_path,
        "-filter_complex",
        "[0:v]scale=672:1080:force_original_aspect_ratio=increase,crop=672:1080[avatar];"
        "[1:v]scale=1920:1080[bg];"
        "[bg][avatar]overlay=0:0[out]",
        "-map", "[out]",
        "-map", "0:a",
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        output_path
    ]
    subprocess.run(cmd, capture_output=True)
    print(f"  ✓ Video: {output_path}")
    return output_path


# ============================================
# PIPELINE PRINCIPAL
# ============================================

def generar_segmento_avatar(texto, template_path, output_dir, nombre="segmento",
                            voz="valeria", avatar="hada_gestos"):
    """
    Pipeline completo para un segmento con avatar:
    Texto → Audio → Avatar → Composición
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*50}")
    print(f"GENERANDO SEGMENTO: {nombre}")
    print(f"{'='*50}")

    # 1. Audio
    audio_path = output_dir / f"{nombre}_audio.mp3"
    if not generar_audio(texto, voz, True, str(audio_path)):
        return None

    # 2. Subir audio
    audio_url = subir_audio_temporal(str(audio_path))
    if not audio_url:
        return None

    # 3. Avatar video
    avatar_path = output_dir / f"{nombre}_avatar.mp4"
    if not generar_avatar_video(audio_url, avatar, str(avatar_path)):
        return None

    # 4. Renderizar template
    bg_path = output_dir / f"{nombre}_bg.png"
    renderizar_template(template_path, str(bg_path))

    # 5. Componer
    video_path = output_dir / f"{nombre}_final.mp4"
    componer_video_split(str(avatar_path), str(bg_path), str(video_path))

    print(f"\n✓ SEGMENTO COMPLETO: {video_path}")
    return str(video_path)


# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    # Ejemplo de uso
    texto = """Hola, bienvenidos a este módulo de Banca Empresas.
    Hoy conoceremos los tres tipos de portales transaccionales que Davivienda
    ofrece para tu empresa: el Portal Pyme, el Portal Empresarial y el Portal
    Corporativo. Cada uno está diseñado según el tamaño y las necesidades de
    tu negocio. ¡Vamos a conocerlos!"""

    template = "/Users/federico/Desktop/ia-davivienda/templates/layouts/avatar-split.html"
    output = "/Users/federico/Desktop/ia-davivienda/output/test_pipeline"

    generar_segmento_avatar(texto, template, output, "intro", "valeria", "hada_gestos")
