"""
Generador de audio con ElevenLabs.
"""
import requests
from typing import Tuple, Optional

from ..config import get_elevenlabs_key, aplicar_fonemas, VOICES


def generar_audio(
    texto: str,
    voice_id: str = "valeria",
    stability: float = 0.6,
    similarity_boost: float = 0.8,
    style: float = 0.4,
) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Genera audio MP3 con ElevenLabs.

    Args:
        texto: Texto a convertir en audio
        voice_id: ID o nombre de la voz (valeria, clau, gaby)
        stability: Estabilidad de la voz (0-1)
        similarity_boost: Similitud con la voz original (0-1)
        style: Estilo/emoción (0-1)

    Returns:
        Tuple de (bytes del audio, error si hubo)
    """
    api_key = get_elevenlabs_key()
    if not api_key:
        return None, "Falta ELEVENLABS_API_KEY"

    # Resolver nombre de voz a ID
    if voice_id in VOICES:
        voice_id = VOICES[voice_id]

    # Aplicar correcciones fonéticas
    texto = aplicar_fonemas(texto)

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key
    }

    data = {
        "text": texto,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity_boost,
            "style": style,
            "use_speaker_boost": True
        }
    }

    try:
        response = requests.post(url, json=data, headers=headers, timeout=60)
        if response.status_code == 200:
            return response.content, None
        else:
            return None, f"Error ElevenLabs: {response.status_code} - {response.text}"
    except Exception as e:
        return None, str(e)
