#!/usr/bin/env python3
"""
Generador de Malla Curricular con IA
Toma contenido bruto y genera una malla estructurada
"""

import os
import json
import subprocess
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

# Configuración
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def extract_text_from_docx(file_path: str) -> str:
    """Extrae texto de un archivo .docx usando textutil (macOS)"""
    temp_file = "/tmp/extracted_content.txt"
    subprocess.run([
        "textutil", "-convert", "txt",
        file_path, "-output", temp_file
    ], check=True)

    with open(temp_file, "r", encoding="utf-8") as f:
        return f.read()


def read_content(file_path: str) -> str:
    """Lee contenido de diferentes formatos"""
    path = Path(file_path)

    if path.suffix.lower() == ".docx":
        return extract_text_from_docx(file_path)
    elif path.suffix.lower() in [".txt", ".md"]:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    else:
        raise ValueError(f"Formato no soportado: {path.suffix}")


SYSTEM_PROMPT = """Eres un experto en Diseño Instruccional para cursos e-learning corporativos.
Tu tarea es analizar contenido bruto y crear una Malla Curricular estructurada.

REGLAS:
1. Divide el contenido en etapas lógicas: Introducción, Desarrollo (múltiples bloques), Cierre
2. Cada bloque debe tener un objetivo de aprendizaje medible (verbos de Bloom)
3. Identifica el tipo de habilidad: Conocimiento técnico, Habilidad técnica, Conocimiento del negocio, Habilidad blanda
4. Sugiere el tipo de recurso más apropiado para cada bloque
5. Estima duraciones realistas (total no mayor a la duración indicada)
6. Incluye evaluaciones donde sea apropiado

TIPOS DE RECURSO DISPONIBLES:
- Video avatar: Presentador virtual explicando conceptos
- Interactivo (Reveal buttons): Botones que revelan información al hacer clic
- Infografía: Visualización de datos o procesos
- Comparador: Tabla comparativa interactiva
- Flashcards: Tarjetas de repaso
- Caso práctico: Escenario con decisiones
- Quiz: Preguntas de evaluación
- Video: Video tradicional sin avatar

FORMATO DE SALIDA (JSON):
{
  "modulo": "Nombre del módulo",
  "audiencia": "Descripción de la audiencia",
  "duracion_total": "X minutos",
  "objetivos_generales": ["objetivo 1", "objetivo 2"],
  "malla": [
    {
      "id": 1,
      "etapa": "Introducción|Desarrollo|Cierre",
      "bloque": "Nombre del bloque",
      "objetivo": "Al finalizar, el participante podrá...",
      "habilidad": "Descripción de la habilidad",
      "tipo_habilidad": "Conocimiento técnico|Habilidad técnica|Conocimiento del negocio|Habilidad blanda",
      "recurso": "Nombre descriptivo del recurso",
      "tipo_recurso": "Video avatar|Interactivo|Infografía|etc",
      "descripcion": "Qué se verá en este recurso",
      "duracion_min": 2,
      "evaluacion": "Quiz 1|null"
    }
  ]
}"""


def generate_malla(content: str, module_name: str, audience: str, duration: int, level: str) -> dict:
    """Genera la malla curricular usando OpenAI GPT-4"""

    client = OpenAI(api_key=OPENAI_API_KEY)

    user_prompt = f"""Analiza el siguiente contenido y genera una Malla Curricular estructurada.

INFORMACIÓN DEL CURSO:
- Nombre del módulo: {module_name}
- Audiencia: {audience}
- Nivel: {level}
- Duración máxima: {duration} minutos

CONTENIDO BRUTO A ANALIZAR:
---
{content}
---

Genera la malla curricular en formato JSON siguiendo exactamente la estructura indicada.
Asegúrate de que la suma de duraciones no exceda {duration} minutos.
Incluye al menos una evaluación (quiz) al final.
Responde SOLO con el JSON, sin texto adicional."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=4096,
        temperature=0.7
    )

    # Extraer JSON de la respuesta
    response_text = response.choices[0].message.content

    # Buscar el JSON en la respuesta
    start = response_text.find("{")
    end = response_text.rfind("}") + 1
    json_str = response_text[start:end]

    return json.loads(json_str)


def malla_to_csv(malla: dict) -> str:
    """Convierte la malla a formato CSV para Google Sheets"""

    headers = [
        "ID", "Etapa", "Bloque", "Objetivo de Aprendizaje", "Habilidad",
        "Tipo de Habilidad", "Nombre del Recurso", "Tipo de Recurso",
        "Descripción", "Duración (min)", "Evaluación", "COMENTARIOS DI",
        "COMENTARIOS ÁREA", "ESTADO"
    ]

    rows = [",".join(headers)]

    for item in malla["malla"]:
        row = [
            str(item.get("id", "")),
            item.get("etapa", ""),
            item.get("bloque", ""),
            f'"{item.get("objetivo", "")}"',  # Quoted for commas
            f'"{item.get("habilidad", "")}"',
            item.get("tipo_habilidad", ""),
            item.get("recurso", ""),
            item.get("tipo_recurso", ""),
            f'"{item.get("descripcion", "")}"',
            str(item.get("duracion_min", "")),
            item.get("evaluacion", "") or "-",
            "",  # Comentarios DI
            "",  # Comentarios Área
            ""   # Estado
        ]
        rows.append(",".join(row))

    # Agregar filas para feedback (iteración)
    rows.append("")  # Línea vacía
    rows.append("FEEDBACK GENERAL:,\"Escribe aquí el feedback para generar una nueva versión (ej: reducir duración, agregar caso práctico, etc.)\"")

    return "\n".join(rows)


def save_malla(malla: dict, output_path: str):
    """Guarda la malla en diferentes formatos"""

    base_path = Path(output_path).with_suffix("")

    # Guardar JSON completo
    with open(f"{base_path}.json", "w", encoding="utf-8") as f:
        json.dump(malla, f, indent=2, ensure_ascii=False)
    print(f"✓ JSON guardado: {base_path}.json")

    # Guardar CSV para importar a Google Sheets
    csv_content = malla_to_csv(malla)
    with open(f"{base_path}.csv", "w", encoding="utf-8") as f:
        f.write(csv_content)
    print(f"✓ CSV guardado: {base_path}.csv")

    # Guardar resumen legible
    summary = f"""MALLA CURRICULAR: {malla['modulo']}
{'=' * 60}

Audiencia: {malla['audiencia']}
Duración total: {malla['duracion_total']}
Nivel: {malla.get('nivel', 'No especificado')}

OBJETIVOS GENERALES:
{chr(10).join(f"  • {obj}" for obj in malla['objetivos_generales'])}

{'=' * 60}
ESTRUCTURA DEL CURSO:
{'=' * 60}

"""
    for item in malla["malla"]:
        summary += f"""
{item['id']}. [{item['etapa']}] {item['bloque']}
   Objetivo: {item['objetivo']}
   Recurso: {item['recurso']} ({item['tipo_recurso']})
   Duración: {item['duracion_min']} min
   Evaluación: {item.get('evaluacion') or 'No'}
   ─────────────────────────────────────────────────
"""

    with open(f"{base_path}_resumen.txt", "w", encoding="utf-8") as f:
        f.write(summary)
    print(f"✓ Resumen guardado: {base_path}_resumen.txt")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Genera Malla Curricular desde contenido bruto")
    parser.add_argument("input_file", help="Archivo con contenido bruto (.docx, .txt)")
    parser.add_argument("--nombre", "-n", required=True, help="Nombre del módulo")
    parser.add_argument("--audiencia", "-a", required=True, help="Audiencia objetivo")
    parser.add_argument("--duracion", "-d", type=int, default=20, help="Duración en minutos (default: 20)")
    parser.add_argument("--nivel", "-l", default="Básico", choices=["Básico", "Intermedio", "Avanzado"])
    parser.add_argument("--output", "-o", help="Archivo de salida (sin extensión)")

    args = parser.parse_args()

    # Verificar API key
    if not OPENAI_API_KEY:
        print("❌ Error: OPENAI_API_KEY no está configurada")
        print("   Ejecuta: export OPENAI_API_KEY='tu-api-key'")
        return

    print(f"\n📚 Generando Malla Curricular")
    print(f"   Módulo: {args.nombre}")
    print(f"   Audiencia: {args.audiencia}")
    print(f"   Duración: {args.duracion} min")
    print(f"   Nivel: {args.nivel}")
    print()

    # Leer contenido
    print("📖 Leyendo contenido bruto...")
    content = read_content(args.input_file)
    print(f"   {len(content)} caracteres leídos")

    # Generar malla
    print("\n🤖 Generando malla con IA (GPT-4o)...")
    malla = generate_malla(
        content=content,
        module_name=args.nombre,
        audience=args.audiencia,
        duration=args.duracion,
        level=args.nivel
    )

    # Guardar
    output_path = args.output or f"malla_{args.nombre.lower().replace(' ', '_')}"
    print(f"\n💾 Guardando archivos...")
    save_malla(malla, output_path)

    print(f"\n✅ Malla generada exitosamente!")
    print(f"\n📋 Resumen:")
    print(f"   • {len(malla['malla'])} bloques de contenido")
    total_min = sum(item.get('duracion_min', 0) for item in malla['malla'])
    print(f"   • {total_min} minutos totales")
    print(f"\n📤 Para subir a Google Sheets:")
    print(f"   1. Abre Google Sheets")
    print(f"   2. Archivo → Importar → Subir → {output_path}.csv")
    print(f"   3. O copia el contenido del CSV")


if __name__ == "__main__":
    main()
