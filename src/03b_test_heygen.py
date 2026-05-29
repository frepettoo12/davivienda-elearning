"""
Test HeyGen con avatar público
"""
import os
import requests
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")
HEYGEN_BASE_URL = "https://api.heygen.com"

headers = {
    "X-Api-Key": HEYGEN_API_KEY,
    "Content-Type": "application/json"
}

# Listar algunos avatares públicos
print("Buscando avatares públicos...")
response = requests.get(f"{HEYGEN_BASE_URL}/v2/avatars", headers=headers)
data = response.json()
avatars = data.get("data", {}).get("avatars", [])

# Buscar avatares que NO sean "Federico" (o sea, los públicos)
public_avatars = [a for a in avatars if "Federico" not in a.get("avatar_name", "")]
print(f"\nAvatares públicos disponibles: {len(public_avatars)}")
for a in public_avatars[:10]:
    print(f"  - {a.get('avatar_name')} | ID: {a.get('avatar_id')}")

# Probar con un avatar público simple y texto corto
test_payload = {
    "video_inputs": [
        {
            "character": {
                "type": "avatar",
                "avatar_id": public_avatars[0].get("avatar_id") if public_avatars else "Angela-inblackskirt-20220820",
                "avatar_style": "normal"
            },
            "voice": {
                "type": "text",
                "input_text": "Hola, bienvenido a este curso sobre seguridad de la información. En los próximos minutos aprenderás las mejores prácticas.",
                "voice_id": "bSugxZDc8QiytLbxnPDn"  # Juliana español
            }
        }
    ],
    "dimension": {
        "width": 1280,
        "height": 720
    }
}

print(f"\nUsando avatar: {test_payload['video_inputs'][0]['character']['avatar_id']}")
print("Creando video de prueba (texto corto)...")

response = requests.post(
    f"{HEYGEN_BASE_URL}/v2/video/generate",
    headers=headers,
    json=test_payload
)

print(f"Status: {response.status_code}")
print(f"Response: {response.text}")

if response.status_code == 200:
    video_id = response.json().get("data", {}).get("video_id")
    print(f"\nVideo ID: {video_id}")

    # Esperar
    for i in range(30):
        time.sleep(10)
        status_resp = requests.get(
            f"{HEYGEN_BASE_URL}/v1/video_status.get?video_id={video_id}",
            headers=headers
        )
        status_data = status_resp.json().get("data", {})
        status = status_data.get("status")
        print(f"Estado: {status}")

        if status == "completed":
            print(f"✅ Video listo: {status_data.get('video_url')}")

            # Descargar
            video_url = status_data.get("video_url")
            video_content = requests.get(video_url).content
            output_path = Path(__file__).parent.parent / "output" / "video_test.mp4"
            with open(output_path, "wb") as f:
                f.write(video_content)
            print(f"✅ Guardado en {output_path}")
            break
        elif status == "failed":
            print(f"❌ Error: {status_data}")
            break
