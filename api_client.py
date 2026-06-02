"""
Cliente para la API de Firebase.
Reemplaza las llamadas directas a OpenAI/ElevenLabs/HeyGen.
"""
import requests
from typing import Dict, Any, Optional, List, Tuple

# URLs de la API
BASE_URL = "https://us-central1-davivienda-elearning.cloudfunctions.net"
API_URLS = {
    # Mallas
    "crear_malla": "https://crear-malla-elrtzny3ba-uc.a.run.app",
    "obtener_malla": "https://obtener-malla-elrtzny3ba-uc.a.run.app",
    "iterar_malla": "https://iterar-malla-endpoint-elrtzny3ba-uc.a.run.app",
    "generar_guiones": "https://generar-guiones-endpoint-elrtzny3ba-uc.a.run.app",
    # Audio/Video
    "generar_audio": "https://generar-audio-endpoint-elrtzny3ba-uc.a.run.app",
    "generar_video": "https://generar-video-endpoint-elrtzny3ba-uc.a.run.app",
    "obtener_job": "https://obtener-job-elrtzny3ba-uc.a.run.app",
    # Health
    "health": "https://health-elrtzny3ba-uc.a.run.app",
    # Solicitudes Dashboard
    "crear_solicitud": "https://us-central1-davivienda-elearning.cloudfunctions.net/crear_solicitud",
    "listar_solicitudes": "https://us-central1-davivienda-elearning.cloudfunctions.net/listar_solicitudes",
    "obtener_solicitud": "https://us-central1-davivienda-elearning.cloudfunctions.net/obtener_solicitud",
    "actualizar_solicitud": "https://us-central1-davivienda-elearning.cloudfunctions.net/actualizar_solicitud",
    "agregar_comentario": "https://us-central1-davivienda-elearning.cloudfunctions.net/agregar_comentario",
    "mis_solicitudes": "https://us-central1-davivienda-elearning.cloudfunctions.net/mis_solicitudes",
}


def _post(endpoint: str, data: Dict[str, Any], timeout: int = 120) -> Tuple[Optional[Dict], Optional[str]]:
    """Helper para hacer POST a la API."""
    try:
        url = API_URLS.get(endpoint, endpoint)
        response = requests.post(url, json=data, timeout=timeout)

        if response.status_code >= 400:
            error_data = response.json() if response.text else {}
            return None, error_data.get("error", f"HTTP {response.status_code}")

        return response.json(), None
    except requests.exceptions.Timeout:
        return None, "Timeout - la operación tardó demasiado"
    except Exception as e:
        return None, str(e)


def _get(endpoint: str, timeout: int = 30) -> Tuple[Optional[Dict], Optional[str]]:
    """Helper para hacer GET a la API."""
    try:
        url = API_URLS.get(endpoint, endpoint)
        response = requests.get(url, timeout=timeout)

        if response.status_code >= 400:
            error_data = response.json() if response.text else {}
            return None, error_data.get("error", f"HTTP {response.status_code}")

        return response.json(), None
    except Exception as e:
        return None, str(e)


# ============== MALLAS ==============

def crear_malla(
    nombre: str,
    audiencia: str,
    nivel: str,
    duracion_min: int,
    objetivo: str,
    temas: str,
    requiere_eval: bool = True,
    documentacion: str = "",
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Crea una malla curricular usando GPT-4.

    Returns:
        Tuple de (respuesta con id, malla, etc., error si hubo)
    """
    data = {
        "nombre": nombre,
        "audiencia": audiencia,
        "nivel": nivel,
        "duracion_min": duracion_min,
        "objetivo": objetivo,
        "temas": temas,
        "requiere_eval": requiere_eval,
        "documentacion": documentacion,
    }
    return _post("crear_malla", data, timeout=120)


def obtener_malla(malla_id: str) -> Tuple[Optional[Dict], Optional[str]]:
    """Obtiene una malla por su ID."""
    url = f"{API_URLS['obtener_malla']}?id={malla_id}"
    return _get(url)


def iterar_malla(malla_id: str, feedback: str) -> Tuple[Optional[Dict], Optional[str]]:
    """Itera una malla con feedback."""
    url = f"{API_URLS['iterar_malla']}?id={malla_id}"
    return _post(url, {"feedback": feedback}, timeout=120)


def generar_guiones(malla_id: str) -> Tuple[Optional[Dict], Optional[str]]:
    """Genera guiones para todos los recursos de una malla."""
    url = f"{API_URLS['generar_guiones']}?id={malla_id}"
    return _post(url, {}, timeout=180)


# ============== AUDIO ==============

def generar_audio(
    texto: str,
    voice_id: str = "valeria",
    stability: float = 0.6,
    similarity_boost: float = 0.8,
    style: float = 0.4,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Genera audio con ElevenLabs.

    Returns:
        Tuple de (respuesta con job_id, audio_url, etc., error si hubo)
    """
    data = {
        "texto": texto,
        "voice_id": voice_id,
        "stability": stability,
        "similarity_boost": similarity_boost,
        "style": style,
    }
    return _post("generar_audio", data, timeout=60)


# ============== VIDEO ==============

def generar_video(
    audio_url: str,
    avatar_id: str = "hada",
    width: int = 1920,
    height: int = 1080,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Inicia generación de video con HeyGen.

    Returns:
        Tuple de (respuesta con job_id, status, etc., error si hubo)
    """
    data = {
        "audio_url": audio_url,
        "avatar_id": avatar_id,
        "dimension": {"width": width, "height": height},
    }
    return _post("generar_video", data, timeout=60)


def obtener_job(job_id: str) -> Tuple[Optional[Dict], Optional[str]]:
    """Obtiene el estado de un job (audio/video)."""
    url = f"{API_URLS['obtener_job']}?id={job_id}"
    return _get(url)


# ============== HEALTH ==============

def health_check() -> bool:
    """Verifica si la API está funcionando."""
    result, error = _get("health")
    return result is not None and result.get("status") == "healthy"


# ============== SOLICITUDES ==============

def crear_solicitud(
    solicitante: Dict[str, str],
    curso: Dict[str, Any],
    prioridad: str = "media",
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Crea una nueva solicitud de curso.

    Args:
        solicitante: Dict con email, nombre, area
        curso: Dict con nombre, audiencia, nivel, duracion_min, objetivo, temas, requiere_eval
        prioridad: "alta", "media", "baja"

    Returns:
        Tuple de (respuesta con id, status, error si hubo)
    """
    data = {
        "solicitante": solicitante,
        "curso": curso,
        "prioridad": prioridad,
    }
    return _post("crear_solicitud", data, timeout=30)


def listar_solicitudes(
    status: Optional[str] = None,
    area: Optional[str] = None,
    asignado_a: Optional[str] = None,
    limit: int = 50,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Lista solicitudes con filtros opcionales.

    Args:
        status: Filtrar por estado (pendiente, en_revision, etc.)
        area: Filtrar por área del solicitante
        asignado_a: Filtrar por email del asignado
        limit: Máximo de resultados

    Returns:
        Tuple de (respuesta con lista de solicitudes, error si hubo)
    """
    params = []
    if status:
        params.append(f"status={status}")
    if area:
        params.append(f"area={area}")
    if asignado_a:
        params.append(f"asignado_a={asignado_a}")
    params.append(f"limit={limit}")

    query = "&".join(params)
    url = f"{API_URLS['listar_solicitudes']}?{query}"
    return _get(url)


def obtener_solicitud(solicitud_id: str) -> Tuple[Optional[Dict], Optional[str]]:
    """Obtiene una solicitud con sus comentarios."""
    url = f"{API_URLS['obtener_solicitud']}?id={solicitud_id}"
    return _get(url)


def actualizar_solicitud(
    solicitud_id: str,
    status: Optional[str] = None,
    asignado_a: Optional[str] = None,
    prioridad: Optional[str] = None,
    malla_id: Optional[str] = None,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Actualiza una solicitud.

    Args:
        solicitud_id: ID de la solicitud
        status: Nuevo estado
        asignado_a: Email del usuario asignado
        prioridad: Nueva prioridad
        malla_id: ID de malla asociada

    Returns:
        Tuple de (respuesta, error si hubo)
    """
    data = {}
    if status is not None:
        data["status"] = status
    if asignado_a is not None:
        data["asignado_a"] = asignado_a
    if prioridad is not None:
        data["prioridad"] = prioridad
    if malla_id is not None:
        data["malla_id"] = malla_id

    url = f"{API_URLS['actualizar_solicitud']}?id={solicitud_id}"
    return _post(url, data, timeout=30)


def agregar_comentario(
    solicitud_id: str,
    texto: str,
    autor: Dict[str, str],
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Agrega un comentario a una solicitud.

    Args:
        solicitud_id: ID de la solicitud
        texto: Texto del comentario
        autor: Dict con email, nombre, rol

    Returns:
        Tuple de (respuesta, error si hubo)
    """
    data = {
        "texto": texto,
        "autor": autor,
    }
    url = f"{API_URLS['agregar_comentario']}?id={solicitud_id}"
    return _post(url, data, timeout=30)


def mis_solicitudes(email: str) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Lista las solicitudes de un solicitante por email.

    Args:
        email: Email del solicitante

    Returns:
        Tuple de (respuesta con lista de solicitudes, error si hubo)
    """
    url = f"{API_URLS['mis_solicitudes']}?email={email}"
    return _get(url)


# ============== MODO LOCAL vs API ==============

# Flag para usar API o modo local
USE_API = True

def set_use_api(use_api: bool):
    """Configura si usar la API o el modo local."""
    global USE_API
    USE_API = use_api
