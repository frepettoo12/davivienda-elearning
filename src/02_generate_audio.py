"""
Paso 2: Generar audio con ElevenLabs
"""
import os
import requests
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv(Path(__file__).parent.parent / ".env")

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"

def get_voices():
    """Obtener voces disponibles"""
    headers = {"xi-api-key": ELEVENLABS_API_KEY}
    response = requests.get(f"{ELEVENLABS_BASE_URL}/voices", headers=headers)

    if response.status_code == 200:
        voices = response.json()["voices"]
        print("Voces disponibles:")
        for voice in voices[:10]:  # Mostrar primeras 10
            print(f"  - {voice['name']} ({voice['voice_id']})")
        return voices
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return []

def generate_audio(text: str, voice_id: str = None, output_path: str = None):
    """Generar audio desde texto"""

    # Usar una voz por defecto si no se especifica
    # "Antoni" es una voz masculina en español
    if voice_id is None:
        voice_id = "ErXwobaYiN019PkySvjV"  # Antoni - voz masculina clara

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }

    data = {
        "text": text,
        "model_id": "eleven_multilingual_v2",  # Soporte español
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }

    print(f"Generando audio... ({len(text)} caracteres)")

    response = requests.post(
        f"{ELEVENLABS_BASE_URL}/text-to-speech/{voice_id}",
        headers=headers,
        json=data
    )

    if response.status_code == 200:
        output_dir = Path(__file__).parent.parent / "output"
        output_path = output_path or output_dir / "audio_curso.mp3"

        with open(output_path, "wb") as f:
            f.write(response.content)

        print(f"✅ Audio guardado en {output_path}")
        return output_path
    else:
        print(f"❌ Error: {response.status_code} - {response.text}")
        return None

def main():
    # Primero listar voces disponibles
    print("=" * 50)
    print("Verificando conexión con ElevenLabs...")
    print("=" * 50)
    voices = get_voices()

    if not voices:
        print("No se pudo conectar a ElevenLabs")
        return

    # Leer texto para TTS
    output_dir = Path(__file__).parent.parent / "output"
    tts_file = output_dir / "texto_tts.txt"

    if not tts_file.exists():
        print("❌ Primero ejecuta 01_generate_script.py")
        return

    with open(tts_file) as f:
        text = f.read()

    print("\n" + "=" * 50)
    print("Generando audio del curso...")
    print("=" * 50)

    # Buscar voz en español
    spanish_voice = None
    for voice in voices:
        labels = voice.get("labels", {})
        if labels.get("language") == "es" or "spanish" in voice["name"].lower():
            spanish_voice = voice["voice_id"]
            print(f"Usando voz en español: {voice['name']}")
            break

    generate_audio(text, voice_id=spanish_voice)

if __name__ == "__main__":
    main()
