#!/usr/bin/env python3
"""
Generador de Guión Detallado con IA
Toma una malla curricular y genera el guión con timestamps
"""

import os
import json
import csv
from pathlib import Path
from openai import OpenAI

# Cargar .env si existe
try:
    from dotenv import load_dotenv
    load_dotenv()
    # También cargar del proyecto escalar si existe
    escalar_env = Path.home() / "Desktop/escalar/.env"
    if escalar_env.exists():
        load_dotenv(escalar_env)
except ImportError:
    pass

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def read_malla_json(file_path: str) -> dict:
    """Lee malla desde archivo JSON"""
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def read_malla_csv(file_path: str) -> dict:
    """Lee malla desde archivo CSV"""
    malla = {"malla": []}

    with open(file_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            malla["malla"].append({
                "id": row.get("ID"),
                "etapa": row.get("Etapa"),
                "bloque": row.get("Bloque"),
                "objetivo": row.get("Objetivo de Aprendizaje"),
                "tipo_recurso": row.get("Tipo de Recurso"),
                "descripcion": row.get("Descripción"),
                "duracion_min": int(row.get("Duración (min)", 2)),
                "evaluacion": row.get("Evaluación")
            })

    return malla


SYSTEM_PROMPT = """Eres un experto guionista de cursos e-learning corporativos para Davivienda.
Tu tarea es crear guiones detallados con timestamps precisos para cada cápsula/sección del curso.

REGLAS DE GUIÓN:
1. Usar tono profesional pero cercano, adecuado para colaboradores de banco
2. Lenguaje claro y directo, sin tecnicismos innecesarios
3. Frases cortas (máximo 15-20 palabras por segmento de audio)
4. Incluir pausas naturales entre conceptos
5. Timestamps en intervalos de 5 segundos aproximadamente
6. Describir visuales de forma clara para el equipo de producción

TIPOS DE RECURSO Y CÓMO GUIONARLOS:

VIDEO AVATAR:
- Texto que dice el avatar
- Descripción de gestos/expresiones si aplica
- Elementos visuales que aparecen al costado

INTERACTIVO (Reveal buttons):
- Texto del botón
- Contenido que se revela al hacer clic
- No hay audio, solo texto en pantalla

INFOGRAFÍA:
- Narración que acompaña
- Descripción de cada elemento visual
- Orden de aparición de elementos

COMPARADOR:
- Narración introductoria
- Columnas y filas de la tabla
- Destacados o diferencias clave

FLASHCARDS:
- Pregunta de cada tarjeta (frente)
- Respuesta de cada tarjeta (reverso)

CASO PRÁCTICO:
- Descripción del escenario
- Datos del personaje/empresa
- Opciones de respuesta
- Feedback para respuesta correcta e incorrecta

QUIZ:
- Pregunta
- 4 opciones de respuesta
- Respuesta correcta indicada
- Retroalimentación

FORMATO DE SALIDA (JSON):
{
  "modulo": "Nombre del módulo",
  "version": "1.0",
  "fecha": "YYYY-MM-DD",
  "duracion_total": "X minutos",
  "capsulas": [
    {
      "id": 1,
      "titulo": "Nombre de la cápsula",
      "tipo_recurso": "Video avatar|Interactivo|etc",
      "duracion_segundos": 60,
      "objetivo": "Lo que logrará el participante",
      "guion": [
        {
          "tiempo": "00:00 - 00:05",
          "visual": "Descripción de lo que se ve",
          "audio": "Texto exacto que se escucha (null si no hay audio)"
        }
      ],
      "evaluacion": {
        "pregunta": "Texto de la pregunta",
        "opciones": ["A", "B", "C", "D"],
        "correcta": 0,
        "feedback_correcto": "Mensaje si acierta",
        "feedback_incorrecto": "Mensaje si falla"
      }
    }
  ]
}"""


def generate_guion(malla: dict, content_bruto: str = None) -> dict:
    """Genera el guión detallado usando OpenAI GPT-4"""

    client = OpenAI(api_key=OPENAI_API_KEY)

    # Construir descripción de la malla
    malla_desc = "MALLA CURRICULAR A GUIONAR:\n\n"
    for item in malla["malla"]:
        malla_desc += f"""
Cápsula {item['id']}: {item['bloque']}
- Etapa: {item['etapa']}
- Objetivo: {item['objetivo']}
- Tipo de recurso: {item['tipo_recurso']}
- Descripción: {item['descripcion']}
- Duración: {item['duracion_min']} minutos
- Evaluación: {item.get('evaluacion', 'No')}
---
"""

    user_prompt = f"""{malla_desc}

{f"CONTENIDO DE REFERENCIA:{chr(10)}{content_bruto[:8000]}" if content_bruto else ""}

Genera el guión detallado para CADA cápsula de la malla.
Incluye timestamps precisos, descripciones visuales claras y textos de audio exactos.
Para cápsulas interactivas (sin avatar), indica qué texto aparece en pantalla.
Si hay evaluación indicada, incluye la pregunta con opciones y feedback.
Responde SOLO con el JSON, sin texto adicional."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=8192,
        temperature=0.7
    )

    response_text = response.choices[0].message.content

    # Extraer JSON
    start = response_text.find("{")
    end = response_text.rfind("}") + 1
    json_str = response_text[start:end]

    return json.loads(json_str)


def guion_to_document(guion: dict) -> str:
    """Convierte el guión a formato documento legible"""

    doc = f"""GUIÓN DEL CURSO: {guion['modulo']}
{'═' * 70}

Versión: {guion.get('version', '1.0')}
Fecha: {guion.get('fecha', 'N/A')}
Duración total: {guion.get('duracion_total', 'N/A')}

{'═' * 70}
"""

    for capsula in guion['capsulas']:
        doc += f"""

{'═' * 70}
CÁPSULA {capsula['id']}: {capsula['titulo'].upper()}
{'═' * 70}

Tipo de recurso: {capsula['tipo_recurso']}
Duración: {capsula['duracion_segundos']} segundos
Objetivo: {capsula['objetivo']}

GUIÓN DETALLADO:
{'─' * 60}
"""

        for segmento in capsula['guion']:
            doc += f"""
[{segmento['tiempo']}]
Visual:  {segmento['visual']}
Audio:   {f'"{segmento["audio"]}"' if segmento.get('audio') else '(Sin audio)'}
"""

        if capsula.get('evaluacion'):
            ev = capsula['evaluacion']
            doc += f"""
{'─' * 60}
EVALUACIÓN:
{'─' * 60}
Pregunta: {ev['pregunta']}

"""
            for i, opcion in enumerate(ev['opciones']):
                marca = "✓" if i == ev['correcta'] else " "
                doc += f"  {chr(65+i)}) [{marca}] {opcion}\n"

            doc += f"""
Feedback correcto: {ev.get('feedback_correcto', '')}
Feedback incorrecto: {ev.get('feedback_incorrecto', '')}
"""

    doc += f"""

{'═' * 70}
FIN DEL GUIÓN
{'═' * 70}
"""

    return doc


def save_guion(guion: dict, output_path: str):
    """Guarda el guión en diferentes formatos"""

    base_path = Path(output_path).with_suffix("")

    # JSON completo
    with open(f"{base_path}.json", "w", encoding="utf-8") as f:
        json.dump(guion, f, indent=2, ensure_ascii=False)
    print(f"✓ JSON guardado: {base_path}.json")

    # Documento legible
    doc = guion_to_document(guion)
    with open(f"{base_path}.txt", "w", encoding="utf-8") as f:
        f.write(doc)
    print(f"✓ Documento guardado: {base_path}.txt")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Genera Guión desde Malla Curricular")
    parser.add_argument("malla_file", help="Archivo de malla (.json o .csv)")
    parser.add_argument("--contenido", "-c", help="Archivo con contenido bruto adicional (opcional)")
    parser.add_argument("--output", "-o", help="Archivo de salida (sin extensión)")

    args = parser.parse_args()

    if not OPENAI_API_KEY:
        print("❌ Error: OPENAI_API_KEY no está configurada")
        return

    # Leer malla
    print("📖 Leyendo malla curricular...")
    malla_path = Path(args.malla_file)
    if malla_path.suffix == ".json":
        malla = read_malla_json(args.malla_file)
    elif malla_path.suffix == ".csv":
        malla = read_malla_csv(args.malla_file)
    else:
        print(f"❌ Formato no soportado: {malla_path.suffix}")
        return

    print(f"   {len(malla['malla'])} cápsulas encontradas")

    # Leer contenido adicional si existe
    content_bruto = None
    if args.contenido:
        print(f"📄 Leyendo contenido de referencia...")
        with open(args.contenido, "r", encoding="utf-8") as f:
            content_bruto = f.read()

    # Generar guión
    print("\n🤖 Generando guión con IA (GPT-4o)...")
    guion = generate_guion(malla, content_bruto)

    # Guardar
    output_path = args.output or f"guion_{malla_path.stem}"
    print(f"\n💾 Guardando archivos...")
    save_guion(guion, output_path)

    print(f"\n✅ Guión generado exitosamente!")
    print(f"   • {len(guion['capsulas'])} cápsulas")
    total_seg = sum(c.get('duracion_segundos', 0) for c in guion['capsulas'])
    print(f"   • {total_seg // 60}:{total_seg % 60:02d} minutos totales")


if __name__ == "__main__":
    main()
