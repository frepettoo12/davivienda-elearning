"""
Generar video con D-ID (alternativa económica a HeyGen)
D-ID ofrece 5 minutos gratis por mes.

Para obtener API key:
1. Crear cuenta en https://studio.d-id.com/
2. Ir a Settings > API Keys
3. Crear nueva key
"""
import os
import requests
import time
import base64
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DID_API_KEY = os.getenv("DID_API_KEY")
OUTPUT_DIR = Path(__file__).parent.parent / "output"

# URL de imagen de presentador (puedes usar cualquier imagen)
# Esta es una imagen de ejemplo de D-ID
DEFAULT_PRESENTER_URL = "https://create-images-results.d-id.com/DefaultPresenters/Mia_f/image.jpeg"

def create_talk_video(text: str, image_url: str = None, voice_id: str = "es-ES-ElviraNeural"):
    """
    Crear video con D-ID

    Args:
        text: Texto a narrar
        image_url: URL de imagen del presentador
        voice_id: ID de voz de Microsoft (D-ID usa voces de Microsoft Azure)
    """

    if not DID_API_KEY:
        print("❌ Falta DID_API_KEY en .env")
        print("\nPara obtener tu API key:")
        print("1. Crea cuenta en https://studio.d-id.com/")
        print("2. Ve a Settings > API Keys")
        print("3. Crea nueva key y agrégala al .env:")
        print("   DID_API_KEY=tu_api_key")
        return None

    headers = {
        "Authorization": f"Basic {DID_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "source_url": image_url or DEFAULT_PRESENTER_URL,
        "script": {
            "type": "text",
            "input": text,
            "provider": {
                "type": "microsoft",
                "voice_id": voice_id
            }
        },
        "config": {
            "stitch": True,  # Mejor calidad
            "result_format": "mp4"
        }
    }

    print("Creando video con D-ID...")
    print(f"Texto: {len(text)} caracteres")

    response = requests.post(
        "https://api.d-id.com/talks",
        headers=headers,
        json=payload
    )

    if response.status_code not in [200, 201]:
        print(f"❌ Error: {response.status_code}")
        print(response.text)
        return None

    data = response.json()
    talk_id = data.get("id")
    print(f"✅ Video creado - ID: {talk_id}")

    return talk_id


def get_video_status(talk_id: str):
    """Verificar estado del video"""
    headers = {
        "Authorization": f"Basic {DID_API_KEY}",
    }

    response = requests.get(
        f"https://api.d-id.com/talks/{talk_id}",
        headers=headers
    )

    if response.status_code == 200:
        data = response.json()
        return data.get("status"), data.get("result_url")
    return None, None


def wait_and_download(talk_id: str, output_path: str = None):
    """Esperar y descargar el video"""
    print("\nEsperando que el video esté listo...")

    for i in range(60):  # Max 5 minutos
        status, video_url = get_video_status(talk_id)
        print(f"  Estado: {status}")

        if status == "done":
            print(f"\n✅ Video listo!")

            # Descargar
            output_path = output_path or OUTPUT_DIR / "video_curso_did.mp4"
            video_content = requests.get(video_url).content
            with open(output_path, "wb") as f:
                f.write(video_content)

            size_mb = Path(output_path).stat().st_size / (1024 * 1024)
            print(f"✅ Video guardado: {output_path}")
            print(f"   Tamaño: {size_mb:.1f} MB")
            return output_path

        elif status == "error":
            print("❌ Error generando video")
            return None

        time.sleep(5)

    print("❌ Timeout")
    return None


def list_voices():
    """Listar voces disponibles en español"""
    print("\nVoces en español disponibles (Microsoft Azure):")
    voices = [
        ("es-ES-ElviraNeural", "Elvira", "España", "Femenina"),
        ("es-ES-AlvaroNeural", "Álvaro", "España", "Masculina"),
        ("es-MX-DaliaNeural", "Dalia", "México", "Femenina"),
        ("es-MX-JorgeNeural", "Jorge", "México", "Masculina"),
        ("es-AR-ElenaNeural", "Elena", "Argentina", "Femenina"),
        ("es-AR-TomasNeural", "Tomás", "Argentina", "Masculina"),
        ("es-CO-GonzaloNeural", "Gonzalo", "Colombia", "Masculina"),
        ("es-CO-SalomeNeural", "Salomé", "Colombia", "Femenina"),
    ]
    for voice_id, name, country, gender in voices:
        print(f"  {voice_id}: {name} ({country}, {gender})")


def main():
    print("=" * 50)
    print("D-ID Video Generator")
    print("=" * 50)

    list_voices()

    # Leer texto
    tts_file = OUTPUT_DIR / "texto_tts.txt"
    if not tts_file.exists():
        print("\n❌ Primero ejecuta 01_generate_script.py")
        return

    with open(tts_file) as f:
        text = f.read()

    # Para prueba usamos texto corto (D-ID cobra por segundo)
    test_text = text[:500]  # Primeros 500 caracteres

    print(f"\n{'='*50}")
    print(f"Generando video de prueba ({len(test_text)} caracteres)")
    print("=" * 50)

    # Usar voz argentina
    talk_id = create_talk_video(test_text, voice_id="es-AR-TomasNeural")

    if talk_id:
        wait_and_download(talk_id)


if __name__ == "__main__":
    main()
