#!/usr/bin/env python3
"""
Verificar estado del video de HeyGen y descargarlo cuando esté listo.
Uso: python src/check_video_status.py
"""
import os
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")

# Video ID del curso completo
VIDEO_ID = "1b6f4766953641e28a9ad5c2e59a7f3d"

headers = {"X-Api-Key": HEYGEN_API_KEY}

print(f"Verificando video {VIDEO_ID}...")
resp = requests.get(
    f"https://api.heygen.com/v1/video_status.get?video_id={VIDEO_ID}",
    headers=headers
)
data = resp.json().get("data", {})
status = data.get("status")

print(f"Estado: {status}")

if status == "completed":
    video_url = data.get("video_url")
    print(f"\n✅ Video completado!")
    print(f"URL: {video_url}")

    print("\nDescargando...")
    video_content = requests.get(video_url).content
    output_path = Path(__file__).parent.parent / "output" / "video_curso.mp4"
    with open(output_path, "wb") as f:
        f.write(video_content)

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"✅ Video guardado: {output_path}")
    print(f"   Tamaño: {size_mb:.1f} MB")

    # Abrir video
    os.system(f"open '{output_path}'")

elif status == "failed":
    print(f"\n❌ Error: {data.get('error')}")

elif status == "processing":
    print("\n⏳ Aún procesando...")
    print("Ejecuta este script de nuevo en unos minutos.")

else:
    print(f"\nEstado desconocido: {status}")
    print(data)
