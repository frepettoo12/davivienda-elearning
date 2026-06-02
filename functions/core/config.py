"""
Configuración y API keys para el proyecto.
Las keys se cargan desde variables de entorno (Firebase secrets).
"""
import os


def get_openai_key() -> str:
    """Obtiene la API key de OpenAI desde el environment."""
    return os.environ.get("OPENAI_API_KEY", "").strip()


def get_elevenlabs_key() -> str:
    """Obtiene la API key de ElevenLabs desde el environment."""
    return os.environ.get("ELEVENLABS_API_KEY", "").strip()


def get_heygen_key() -> str:
    """Obtiene la API key de HeyGen desde el environment."""
    return os.environ.get("HEYGEN_API_KEY", "").strip()


# Voces ElevenLabs
VOICES = {
    "valeria": "JddqVF50ZSIR7SRbJE6u",  # Casual, conversacional
    "clau": "SplyIQAjgy4DKGAnOrHi",      # Profesional, neutral
    "gaby": "a0MaQpDjx7p7bZmqzFp1",      # Joven, energética
}

# Avatares HeyGen
AVATARS = {
    "hada": "Hada_LivelyGestures_Front_public",
    "annie": "Annie_Business_Casual_Standing_Front_public",
    "caroline": "Caroline_Office_Standing_Front_public",
}

# Correcciones fonéticas para ElevenLabs
FONEMAS = {
    "Pyme": "Píme",
    "pyme": "píme",
    "Pymes": "Pímes",
    "pymes": "pímes",
}


def aplicar_fonemas(texto: str) -> str:
    """Aplica correcciones fonéticas al texto."""
    for palabra, correccion in FONEMAS.items():
        texto = texto.replace(palabra, correccion)
    return texto
