"""
Generador de video con HeyGen.
"""
import time
import requests
from typing import Tuple, Optional, Dict, Any

from ..config import get_heygen_key, AVATARS


def crear_video_heygen(
    audio_url: str,
    avatar_id: str = "hada",
    dimension: Dict[str, int] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Inicia la generación de video con HeyGen.

    Args:
        audio_url: URL pública del audio
        avatar_id: ID o nombre del avatar (hada, annie, caroline)
        dimension: Dimensiones del video {"width": 1920, "height": 1080}

    Returns:
        Tuple de (video_id para polling, error si hubo)
    """
    api_key = get_heygen_key()
    if not api_key:
        return None, "Falta HEYGEN_API_KEY"

    # Resolver nombre a ID
    if avatar_id in AVATARS:
        avatar_id = AVATARS[avatar_id]

    if dimension is None:
        dimension = {"width": 1920, "height": 1080}

    headers = {
        "X-Api-Key": api_key,
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
        "dimension": dimension,
        "aspect_ratio": "16:9"
    }

    try:
        response = requests.post(
            "https://api.heygen.com/v2/video/generate",
            json=payload,
            headers=headers,
            timeout=30
        )

        if response.status_code != 200:
            return None, f"Error HeyGen: {response.status_code} - {response.text}"

        data = response.json()
        video_id = data.get("data", {}).get("video_id")

        if not video_id:
            return None, f"No se obtuvo video_id: {data}"

        return video_id, None

    except Exception as e:
        return None, str(e)


def verificar_video_heygen(video_id: str) -> Dict[str, Any]:
    """
    Verifica el estado de un video en HeyGen.

    Returns:
        Dict con {status, video_url, error}
    """
    api_key = get_heygen_key()
    if not api_key:
        return {"status": "error", "error": "Falta HEYGEN_API_KEY"}

    headers = {"X-Api-Key": api_key}

    try:
        response = requests.get(
            f"https://api.heygen.com/v1/video_status.get?video_id={video_id}",
            headers=headers,
            timeout=10
        )

        if response.status_code != 200:
            return {"status": "error", "error": f"HTTP {response.status_code}"}

        data = response.json().get("data", {})
        status = data.get("status", "unknown")

        result = {"status": status}

        if status == "completed":
            result["video_url"] = data.get("video_url")
        elif status == "failed":
            result["error"] = data.get("error", "Unknown error")

        return result

    except Exception as e:
        return {"status": "error", "error": str(e)}


def esperar_video_heygen(video_id: str, max_intentos: int = 60) -> Tuple[Optional[str], Optional[str]]:
    """
    Espera a que el video esté listo (polling).

    Args:
        video_id: ID del video
        max_intentos: Máximo número de intentos (5s cada uno = 5 min default)

    Returns:
        Tuple de (video_url, error si hubo)
    """
    for _ in range(max_intentos):
        result = verificar_video_heygen(video_id)

        if result["status"] == "completed":
            return result.get("video_url"), None
        elif result["status"] == "failed":
            return None, result.get("error", "Video falló")
        elif result["status"] == "error":
            return None, result.get("error", "Error verificando")

        time.sleep(5)

    return None, "Timeout esperando video"
