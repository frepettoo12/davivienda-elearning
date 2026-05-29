"""
Paso 1: Generar guión y ejercicios desde un brief
"""
import os
from pathlib import Path

# El guión lo generamos manualmente por ahora (después se puede usar Claude API)
# Para el piloto, creo el guión directamente

SCRIPT_OUTPUT = """
# Guión: Seguridad de la Información

## Escena 1: Introducción (30 segundos)
**[Avatar saluda a cámara]**

Hola, bienvenido a este curso sobre Seguridad de la Información.
En los próximos minutos aprenderás las mejores prácticas para proteger
los datos de nuestra organización y evitar ser víctima de ataques cibernéticos.

---

## Escena 2: Los tres pilares (45 segundos)
**[Avatar explica con gráficos de apoyo]**

La seguridad de la información se basa en tres pilares fundamentales.
Primero, la Confidencialidad: solo las personas autorizadas pueden acceder a la información.
Segundo, la Integridad: los datos no pueden ser modificados sin autorización.
Y tercero, la Disponibilidad: la información debe estar accesible cuando la necesitamos.

---

## Escena 3: Amenazas comunes (60 segundos)
**[Avatar con ejemplos visuales]**

Existen varias amenazas que debemos conocer.
El Phishing son correos fraudulentos que intentan robar tus credenciales.
Siempre verifica el remitente antes de hacer clic en cualquier enlace.
El Malware es software malicioso que puede infectar tu equipo si descargas archivos sospechosos.
La Ingeniería Social es cuando alguien intenta manipularte para obtener información confidencial.
Y las contraseñas débiles son una puerta abierta para los atacantes.

---

## Escena 4: Buenas prácticas (60 segundos)
**[Avatar con lista de tips]**

Aquí van las mejores prácticas que debes seguir.
Usa contraseñas fuertes de al menos 12 caracteres, combinando mayúsculas, minúsculas, números y símbolos.
Nunca compartas tus credenciales con nadie, ni siquiera con compañeros de trabajo.
Antes de hacer clic en un enlace, verifica quién te lo envió.
Si recibes un correo sospechoso, repórtalo inmediatamente al área de TI.
Siempre bloquea tu equipo cuando te alejes del escritorio.
Y nunca conectes dispositivos USB que no conozcas.

---

## Escena 5: Qué hacer ante un incidente (45 segundos)
**[Avatar con tono serio pero calmado]**

Si sospechas que fuiste víctima de un ataque, sigue estos pasos.
Primero, mantén la calma.
Segundo, desconecta tu equipo de la red si es posible.
Tercero, contacta inmediatamente al área de TI.
Cuarto, no intentes solucionar el problema por tu cuenta.
Y quinto, documenta qué sucedió para ayudar en la investigación.

---

## Escena 6: Cierre (20 segundos)
**[Avatar despide]**

Recuerda: la seguridad de la información es responsabilidad de todos.
Ahora pasarás a una breve evaluación para poner en práctica lo aprendido.
¡Mucho éxito!
"""

EXERCISES = {
    "quiz": [
        {
            "id": 1,
            "type": "multiple_choice",
            "question": "¿Cuáles son los tres pilares de la seguridad de la información?",
            "options": [
                "Velocidad, Precisión, Eficiencia",
                "Confidencialidad, Integridad, Disponibilidad",
                "Prevención, Detección, Respuesta",
                "Hardware, Software, Redes"
            ],
            "correct": 1,
            "feedback": "¡Correcto! Los tres pilares son Confidencialidad, Integridad y Disponibilidad."
        },
        {
            "id": 2,
            "type": "multiple_choice",
            "question": "¿Qué es el Phishing?",
            "options": [
                "Un tipo de virus informático",
                "Una técnica de respaldo de datos",
                "Correos fraudulentos que buscan robar credenciales",
                "Un programa de antivirus"
            ],
            "correct": 2,
            "feedback": "¡Correcto! El Phishing son correos fraudulentos diseñados para robar tus credenciales."
        },
        {
            "id": 3,
            "type": "multiple_choice",
            "question": "¿Cuál es la longitud mínima recomendada para una contraseña segura?",
            "options": [
                "6 caracteres",
                "8 caracteres",
                "12 caracteres",
                "4 caracteres"
            ],
            "correct": 2,
            "feedback": "¡Correcto! Se recomienda usar contraseñas de al menos 12 caracteres."
        },
        {
            "id": 4,
            "type": "multiple_choice",
            "question": "¿Qué debes hacer primero si sospechas de un ataque?",
            "options": [
                "Intentar solucionar el problema tú mismo",
                "Ignorarlo y seguir trabajando",
                "Mantener la calma y contactar a TI",
                "Reiniciar el equipo varias veces"
            ],
            "correct": 2,
            "feedback": "¡Correcto! Lo primero es mantener la calma y contactar al área de TI."
        },
        {
            "id": 5,
            "type": "true_false",
            "question": "Es seguro compartir tu contraseña con un compañero de confianza.",
            "correct": False,
            "feedback": "¡Correcto! Nunca debes compartir tus credenciales con nadie."
        }
    ],
    "drag_drop": {
        "instruction": "Arrastra cada elemento a la categoría correcta: ¿Es un correo de Phishing o es Legítimo?",
        "items": [
            {"id": 1, "text": "Correo de banco pidiendo actualizar datos con enlace sospechoso", "category": "phishing"},
            {"id": 2, "text": "Correo de TI interno con dominio de la empresa", "category": "legitimo"},
            {"id": 3, "text": "Premio de lotería que no jugaste", "category": "phishing"},
            {"id": 4, "text": "Factura de proveedor conocido con adjunto esperado", "category": "legitimo"},
            {"id": 5, "text": "Urgente: tu cuenta será bloqueada en 24 horas", "category": "phishing"}
        ],
        "categories": ["phishing", "legitimo"]
    }
}

def save_script():
    output_dir = Path(__file__).parent.parent / "output"
    output_dir.mkdir(exist_ok=True)

    # Guardar guión
    with open(output_dir / "guion.md", "w") as f:
        f.write(SCRIPT_OUTPUT)

    # Guardar ejercicios como JSON
    import json
    with open(output_dir / "ejercicios.json", "w") as f:
        json.dump(EXERCISES, f, indent=2, ensure_ascii=False)

    print("✅ Guión guardado en output/guion.md")
    print("✅ Ejercicios guardados en output/ejercicios.json")

    # Extraer texto limpio para TTS
    lines = []
    for line in SCRIPT_OUTPUT.split('\n'):
        line = line.strip()
        if line and not line.startswith('#') and not line.startswith('*') and not line.startswith('---'):
            lines.append(line)

    tts_text = ' '.join(lines)
    with open(output_dir / "texto_tts.txt", "w") as f:
        f.write(tts_text)

    print("✅ Texto para TTS guardado en output/texto_tts.txt")
    return tts_text

if __name__ == "__main__":
    save_script()
