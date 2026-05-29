"""
Generar video completo con HeyGen
"""
import os
import requests
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")
HEYGEN_BASE_URL = "https://api.heygen.com"
OUTPUT_DIR = Path(__file__).parent.parent / "output"

headers = {
    "X-Api-Key": HEYGEN_API_KEY,
    "Content-Type": "application/json"
}

# Leer el texto completo del guión
with open(OUTPUT_DIR / "texto_tts.txt") as f:
    full_text = f.read()

print(f"Texto completo: {len(full_text)} caracteres")

# Configuración del video
# Usamos un avatar profesional y voz en español
payload = {
    "video_inputs": [
        {
            "character": {
                "type": "avatar",
                "avatar_id": "Abigail_expressive_2024112501",  # Avatar expresivo
                "avatar_style": "normal"
            },
            "voice": {
                "type": "text",
                "input_text": full_text,
                "voice_id": "bSugxZDc8QiytLbxnPDn"  # Juliana - español
            },
            "background": {
                "type": "color",
                "value": "#1a1a2e"  # Fondo oscuro profesional
            }
        }
    ],
    "dimension": {
        "width": 1920,
        "height": 1080
    }
}

print("\nCreando video completo en HeyGen...")
print(f"Avatar: Abigail (expresivo)")
print(f"Voz: Juliana (español)")
print(f"Resolución: 1920x1080")

response = requests.post(
    f"{HEYGEN_BASE_URL}/v2/video/generate",
    headers=headers,
    json=payload
)

print(f"\nStatus: {response.status_code}")

if response.status_code != 200:
    print(f"Error: {response.text}")
    exit(1)

video_id = response.json().get("data", {}).get("video_id")
print(f"Video ID: {video_id}")

# Esperar a que el video esté listo
print("\nEsperando generación del video (esto puede tardar unos minutos)...")
start_time = time.time()

while True:
    elapsed = int(time.time() - start_time)

    status_resp = requests.get(
        f"{HEYGEN_BASE_URL}/v1/video_status.get?video_id={video_id}",
        headers=headers
    )
    status_data = status_resp.json().get("data", {})
    status = status_data.get("status")

    print(f"  [{elapsed}s] Estado: {status}")

    if status == "completed":
        video_url = status_data.get("video_url")
        print(f"\n✅ Video completado!")
        print(f"URL: {video_url}")

        # Descargar video
        print("\nDescargando video...")
        video_content = requests.get(video_url).content
        output_path = OUTPUT_DIR / "video_curso.mp4"
        with open(output_path, "wb") as f:
            f.write(video_content)

        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"✅ Video guardado: {output_path}")
        print(f"   Tamaño: {size_mb:.1f} MB")
        break

    elif status == "failed":
        error = status_data.get("error", {})
        print(f"\n❌ Error generando video:")
        print(f"   {error}")
        exit(1)

    time.sleep(15)  # Esperar 15 segundos entre checks

    if elapsed > 600:  # Timeout de 10 minutos
        print("\n❌ Timeout esperando video")
        exit(1)
