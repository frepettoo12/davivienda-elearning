#!/usr/bin/env python3
"""
Iterador de Malla Curricular con Feedback
Lee feedback del Google Sheet y regenera una versión mejorada
"""

import os
import json
import re
import argparse
from pathlib import Path
from openai import OpenAI

# Cargar .env
try:
    from dotenv import load_dotenv
    load_dotenv()
    escalar_env = Path.home() / "Desktop/escalar/.env"
    if escalar_env.exists():
        load_dotenv(escalar_env)
except ImportError:
    pass

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


SYSTEM_PROMPT = """Eres un experto en Diseño Instruccional para cursos e-learning corporativos.
Tu tarea es MEJORAR una Malla Curricular existente basándote en el feedback recibido.

REGLAS:
1. Mantén la estructura general pero incorpora TODOS los cambios solicitados en el feedback
2. Si el feedback pide agregar contenido, agrégalo
3. Si el feedback pide reducir duración, ajusta los tiempos
4. Si el feedback pide cambiar recursos, cámbialos
5. Mantén el formato JSON exacto de la malla original
6. Suma de duraciones no debe exceder el total original (salvo que el feedback lo pida)

TIPOS DE RECURSO DISPONIBLES:
- Video avatar: Presentador virtual explicando conceptos
- Interactivo (Reveal buttons): Botones que revelan información al hacer clic
- Infografía: Visualización de datos o procesos
- Comparador: Tabla comparativa interactiva
- Flashcards: Tarjetas de repaso
- Caso práctico: Escenario con decisiones
- Quiz: Preguntas de evaluación
- Video: Video tradicional sin avatar

Responde SOLO con el JSON mejorado, sin texto adicional."""


def parse_malla_text(text: str) -> dict:
    """Parsea el texto de la malla (puede venir de Sheet o archivo)"""
    lines = text.strip().split('\n')

    malla = {
        "modulo": "Módulo",
        "audiencia": "",
        "duracion_total": "",
        "objetivos_generales": [],
        "feedback_general": "",
        "malla": []
    }

    # Buscar feedback general (línea que empieza con FEEDBACK:)
    for line in lines:
        if line.upper().startswith("FEEDBACK:") or line.upper().startswith("FEEDBACK GENERAL:"):
            malla["feedback_general"] = line.split(":", 1)[1].strip()
            break

    # Parsear filas de la malla (CSV-like)
    header_found = False
    for line in lines:
        if "ID" in line and "Etapa" in line and "Bloque" in line:
            header_found = True
            continue

        if header_found and line.strip() and not line.upper().startswith("FEEDBACK"):
            # Parsear línea CSV simple
            parts = line.split(',')
            if len(parts) >= 10:
                try:
                    item = {
                        "id": int(parts[0]) if parts[0].isdigit() else len(malla["malla"]) + 1,
                        "etapa": parts[1].strip(),
                        "bloque": parts[2].strip(),
                        "objetivo": parts[3].strip().strip('"'),
                        "habilidad": parts[4].strip().strip('"') if len(parts) > 4 else "",
                        "tipo_habilidad": parts[5].strip() if len(parts) > 5 else "",
                        "recurso": parts[6].strip() if len(parts) > 6 else "",
                        "tipo_recurso": parts[7].strip() if len(parts) > 7 else "",
                        "descripcion": parts[8].strip().strip('"') if len(parts) > 8 else "",
                        "duracion_min": int(parts[9]) if len(parts) > 9 and parts[9].strip().isdigit() else 2,
                        "evaluacion": parts[10].strip() if len(parts) > 10 else None,
                        "comentario_di": parts[11].strip() if len(parts) > 11 else "",
                        "comentario_area": parts[12].strip() if len(parts) > 12 else ""
                    }
                    malla["malla"].append(item)
                except (ValueError, IndexError):
                    continue

    return malla


def iterate_malla(malla: dict, feedback_adicional: str = None) -> dict:
    """Genera versión mejorada de la malla con el feedback"""

    client = OpenAI(api_key=OPENAI_API_KEY)

    # Construir el feedback completo
    feedback_parts = []

    if malla.get("feedback_general"):
        feedback_parts.append(f"FEEDBACK GENERAL: {malla['feedback_general']}")

    if feedback_adicional:
        feedback_parts.append(f"FEEDBACK ADICIONAL: {feedback_adicional}")

    # Agregar comentarios por cápsula
    for item in malla["malla"]:
        comentarios = []
        if item.get("comentario_di"):
            comentarios.append(f"DI: {item['comentario_di']}")
        if item.get("comentario_area"):
            comentarios.append(f"Área: {item['comentario_area']}")
        if comentarios:
            feedback_parts.append(f"Cápsula {item['id']} ({item['bloque']}): {'; '.join(comentarios)}")

    feedback_text = "\n".join(feedback_parts) if feedback_parts else "Sin feedback específico, optimiza la malla general."

    # Construir malla actual como JSON
    malla_json = json.dumps({
        "modulo": malla.get("modulo", "Módulo"),
        "audiencia": malla.get("audiencia", ""),
        "duracion_total": malla.get("duracion_total", "20 minutos"),
        "objetivos_generales": malla.get("objetivos_generales", []),
        "malla": [{k: v for k, v in item.items() if k not in ["comentario_di", "comentario_area"]}
                  for item in malla["malla"]]
    }, indent=2, ensure_ascii=False)

    user_prompt = f"""MALLA CURRICULAR ACTUAL:
{malla_json}

FEEDBACK A INCORPORAR:
{feedback_text}

Genera la malla mejorada incorporando TODO el feedback. Mantén el mismo formato JSON."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=4096,
        temperature=0.7
    )

    response_text = response.choices[0].message.content

    # Extraer JSON
    start = response_text.find("{")
    end = response_text.rfind("}") + 1
    json_str = response_text[start:end]

    return json.loads(json_str)


def malla_to_csv(malla: dict) -> str:
    """Convierte la malla a formato CSV"""
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
            f'"{item.get("objetivo", "")}"',
            f'"{item.get("habilidad", "")}"',
            item.get("tipo_habilidad", ""),
            item.get("recurso", ""),
            item.get("tipo_recurso", ""),
            f'"{item.get("descripcion", "")}"',
            str(item.get("duracion_min", "")),
            item.get("evaluacion", "") or "-",
            "", "", ""
        ]
        rows.append(",".join(row))

    # Agregar línea para feedback
    rows.append("")
    rows.append("FEEDBACK GENERAL:,Escribe aquí el feedback para la próxima iteración...")

    return "\n".join(rows)


def save_malla(malla: dict, output_path: str, version: int):
    """Guarda la malla iterada"""
    base_path = Path(output_path).with_suffix("")

    # JSON
    with open(f"{base_path}_v{version}.json", "w", encoding="utf-8") as f:
        json.dump(malla, f, indent=2, ensure_ascii=False)
    print(f"✓ JSON guardado: {base_path}_v{version}.json")

    # CSV
    csv_content = malla_to_csv(malla)
    with open(f"{base_path}_v{version}.csv", "w", encoding="utf-8") as f:
        f.write(csv_content)
    print(f"✓ CSV guardado: {base_path}_v{version}.csv")


def main():
    parser = argparse.ArgumentParser(description="Itera Malla Curricular con feedback")
    parser.add_argument("malla_file", help="Archivo de malla actual (.json o .csv o .txt)")
    parser.add_argument("--feedback", "-f", help="Feedback adicional por línea de comando")
    parser.add_argument("--version", "-v", type=int, default=2, help="Número de versión (default: 2)")
    parser.add_argument("--output", "-o", help="Archivo de salida (sin extensión)")

    args = parser.parse_args()

    if not OPENAI_API_KEY:
        print("❌ Error: OPENAI_API_KEY no está configurada")
        return

    # Leer malla actual
    print("📖 Leyendo malla actual...")
    malla_path = Path(args.malla_file)

    with open(malla_path, "r", encoding="utf-8") as f:
        content = f.read()

    if malla_path.suffix == ".json":
        malla = json.loads(content)
        # Agregar campos de feedback vacíos si no existen
        malla["feedback_general"] = malla.get("feedback_general", "")
        for item in malla.get("malla", []):
            item["comentario_di"] = item.get("comentario_di", "")
            item["comentario_area"] = item.get("comentario_area", "")
    else:
        malla = parse_malla_text(content)

    print(f"   {len(malla['malla'])} cápsulas encontradas")

    # Mostrar feedback detectado
    if malla.get("feedback_general"):
        print(f"   Feedback general: {malla['feedback_general'][:50]}...")
    if args.feedback:
        print(f"   Feedback adicional: {args.feedback[:50]}...")

    # Iterar
    print(f"\n🤖 Generando versión {args.version} con feedback...")
    nueva_malla = iterate_malla(malla, args.feedback)

    # Guardar
    output_path = args.output or str(malla_path.with_suffix(""))
    print(f"\n💾 Guardando archivos...")
    save_malla(nueva_malla, output_path, args.version)

    print(f"\n✅ Malla v{args.version} generada!")
    print(f"   • {len(nueva_malla['malla'])} cápsulas")
    total_min = sum(item.get('duracion_min', 0) for item in nueva_malla['malla'])
    print(f"   • {total_min} minutos totales")


if __name__ == "__main__":
    main()
