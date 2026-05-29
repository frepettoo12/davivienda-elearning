"""
Paso 3: Generar video con HeyGen
"""
import os
import requests
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")
HEYGEN_BASE_URL = "https://api.heygen.com"

def get_avatars():
    """Obtener avatares disponibles"""
    headers = {
        "X-Api-Key": HEYGEN_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.get(f"{HEYGEN_BASE_URL}/v2/avatars", headers=headers)

    if response.status_code == 200:
        data = response.json()
        avatars = data.get("data", {}).get("avatars", [])
        print(f"Avatares disponibles: {len(avatars)}")
        for avatar in avatars[:5]:
            print(f"  - {avatar.get('avatar_name', 'N/A')} ({avatar.get('avatar_id', 'N/A')})")
        return avatars
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return []

def get_voices():
    """Obtener voces disponibles en HeyGen"""
    headers = {
        "X-Api-Key": HEYGEN_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.get(f"{HEYGEN_BASE_URL}/v2/voices", headers=headers)

    if response.status_code == 200:
        data = response.json()
        voices = data.get("data", {}).get("voices", [])
        print(f"\nVoces disponibles: {len(voices)}")
        # Filtrar voces en español
        spanish_voices = [v for v in voices if v.get("language", "").startswith("es")]
        print(f"Voces en español: {len(spanish_voices)}")
        for voice in spanish_voices[:5]:
            print(f"  - {voice.get('name', 'N/A')} ({voice.get('voice_id', 'N/A')})")
        return voices, spanish_voices
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return [], []

def create_video(text: str, avatar_id: str = None, voice_id: str = None):
    """Crear video con avatar hablando"""

    headers = {
        "X-Api-Key": HEYGEN_API_KEY,
        "Content-Type": "application/json"
    }

    # Payload para crear video
    payload = {
        "video_inputs": [
            {
                "character": {
                    "type": "avatar",
                    "avatar_id": avatar_id or "Angela-inblackskirt-20220820",  # Avatar por defecto
                    "avatar_style": "normal"
                },
                "voice": {
                    "type": "text",
                    "input_text": text,
                    "voice_id": voice_id or "es-ES-ElviraNeural"  # Voz española por defecto
                }
            }
        ],
        "dimension": {
            "width": 1920,
            "height": 1080
        }
    }

    print("Creando video en HeyGen...")
    response = requests.post(
        f"{HEYGEN_BASE_URL}/v2/video/generate",
        headers=headers,
        json=payload
    )

    if response.status_code == 200:
        data = response.json()
        video_id = data.get("data", {}).get("video_id")
        print(f"✅ Video creado - ID: {video_id}")
        return video_id
    else:
        print(f"❌ Error creando video: {response.status_code}")
        print(response.text)
        return None

def check_video_status(video_id: str):
    """Verificar estado del video"""
    headers = {
        "X-Api-Key": HEYGEN_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.get(
        f"{HEYGEN_BASE_URL}/v1/video_status.get?video_id={video_id}",
        headers=headers
    )

    if response.status_code == 200:
        data = response.json()
        status = data.get("data", {}).get("status")
        video_url = data.get("data", {}).get("video_url")
        return status, video_url
    else:
        print(f"Error: {response.status_code}")
        return None, None

def wait_for_video(video_id: str, max_wait: int = 300):
    """Esperar a que el video esté listo"""
    print("Esperando que el video esté listo...")
    start_time = time.time()

    while time.time() - start_time < max_wait:
        status, video_url = check_video_status(video_id)
        print(f"  Estado: {status}")

        if status == "completed":
            print(f"✅ Video listo: {video_url}")
            return video_url
        elif status == "failed":
            print("❌ Error generando video")
            return None

        time.sleep(10)

    print("❌ Timeout esperando video")
    return None

def download_video(url: str, output_path: str = None):
    """Descargar video"""
    output_dir = Path(__file__).parent.parent / "output"
    output_path = output_path or output_dir / "video_curso.mp4"

    print(f"Descargando video...")
    response = requests.get(url)

    if response.status_code == 200:
        with open(output_path, "wb") as f:
            f.write(response.content)
        print(f"✅ Video guardado en {output_path}")
        return output_path
    else:
        print(f"❌ Error descargando: {response.status_code}")
        return None

def main():
    print("=" * 50)
    print("Verificando conexión con HeyGen...")
    print("=" * 50)

    # Obtener avatares y voces disponibles
    avatars = get_avatars()
    all_voices, spanish_voices = get_voices()

    if not avatars:
        print("No se pudo conectar a HeyGen")
        return

    # Leer texto para el video (usamos solo una parte para la prueba)
    output_dir = Path(__file__).parent.parent / "output"
    tts_file = output_dir / "texto_tts.txt"

    if not tts_file.exists():
        print("❌ Primero ejecuta 01_generate_script.py")
        return

    with open(tts_file) as f:
        text = f.read()

    # Para la prueba, usamos solo los primeros 500 caracteres (ahorra créditos)
    test_text = text[:500]

    print("\n" + "=" * 50)
    print(f"Generando video de prueba ({len(test_text)} caracteres)...")
    print("=" * 50)

    # Usar primer avatar disponible y voz en español
    avatar_id = avatars[0].get("avatar_id") if avatars else None
    voice_id = spanish_voices[0].get("voice_id") if spanish_voices else None

    print(f"Avatar: {avatar_id}")
    print(f"Voz: {voice_id}")

    video_id = create_video(test_text, avatar_id, voice_id)

    if video_id:
        video_url = wait_for_video(video_id)
        if video_url:
            download_video(video_url)

if __name__ == "__main__":
    main()
