"""
Servicio de generación de mallas curriculares con GPT-4.
"""
import json
from typing import Dict, List, Any, Optional, Tuple
from openai import OpenAI

from ..config import get_openai_key


TIPOS_RECURSO = [
    "Video avatar",
    "Video",
    "Interactivo",
    "Infografía",
    "Comparador",
    "Flashcards",
    "Caso práctico",
    "Quiz",
    "Timeline",
    "Drag & Drop",
    "Accordion",
    "Simulador",
]

COURSE_TYPE_PROFILES = {
    "compliance": {
        "label": "Compliance crítico",
        "focus": "mitigación de riesgo, cumplimiento normativo y decisiones correctas",
        "structure": [
            "Contexto normativo y riesgo",
            "Reglas operativas aplicables",
            "Escenarios de decisión realistas",
            "Evaluación con criterio de aprobación explícito",
        ],
        "resource_mix": "priorizar Comparador + Caso práctico + Quiz; usar Video avatar solo para apertura/cierre",
        "gamification": "baja, centrada en feedback claro y consecuencias de error",
    },
    "onboarding": {
        "label": "Onboarding",
        "focus": "acelerar integración, contexto de cultura y primeras tareas",
        "structure": [
            "Bienvenida y propósito",
            "Qué hace el rol y cómo se mide",
            "Procesos y herramientas clave",
            "Checklist de primeras acciones",
        ],
        "resource_mix": "priorizar Video avatar + Interactivo + Infografía + Flashcards",
        "gamification": "media-baja, progresión por hitos y logros iniciales",
    },
    "proceso_sistema": {
        "label": "Proceso o sistema",
        "focus": "ejecución correcta paso a paso y reducción de errores operativos",
        "structure": [
            "Flujo completo del proceso",
            "Paso a paso con puntos de control",
            "Errores frecuentes y cómo evitarlos",
            "Práctica aplicada",
        ],
        "resource_mix": "priorizar Video + Interactivo + Caso práctico + Quiz",
        "gamification": "baja, centrada en dominio de tarea",
    },
    "habilidades_blandas": {
        "label": "Habilidades blandas",
        "focus": "conductas observables, conversación y criterio interpersonal",
        "structure": [
            "Marco conceptual breve",
            "Situaciones reales de interacción",
            "Buenas prácticas y anti-patrones",
            "Reflexión y aplicación al puesto",
        ],
        "resource_mix": "priorizar Caso práctico + Interactivo + Flashcards + Quiz",
        "gamification": "media, enfocada en toma de decisiones y feedback",
    },
    "producto_ventas": {
        "label": "Producto y ventas",
        "focus": "dominio de propuesta de valor, objeciones y cierre",
        "structure": [
            "Propuesta de valor",
            "Segmentos, necesidades y encaje",
            "Objeciones y respuestas",
            "Simulación comercial",
        ],
        "resource_mix": "priorizar Comparador + Caso práctico + Video + Quiz",
        "gamification": "media, con retos de argumentación y diagnóstico",
    },
}


def _empresa_desc(empresa: Dict[str, Any] | None) -> str:
    """Descripción de la empresa para los prompts. Default legacy: Davivienda."""
    if empresa and empresa.get("nombre"):
        industria = empresa.get("industria") or empresa.get("descripcion_prompt") or ""
        return f"{empresa['nombre']} ({industria})" if industria else empresa["nombre"]
    return "Davivienda (banco colombiano)"


def generar_malla(
    nombre: str,
    course_type: str,
    audiencia: str,
    nivel: str,
    duracion_min: int,
    objetivo: str,
    temas: str,
    requiere_eval: bool = True,
    documentacion: str = "",
    empresa: Dict[str, Any] | None = None,
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """
    Genera una malla curricular usando GPT-4.

    Returns:
        Tuple de (lista de recursos de la malla, error si hubo)
    """
    api_key = get_openai_key()
    if not api_key:
        return None, "Falta OPENAI_API_KEY"

    docs_section = ""
    if documentacion:
        docs_section = f"\n\nDOCUMENTACIÓN DE REFERENCIA:{documentacion[:8000]}"

    course_type = (course_type or "compliance").strip().lower()
    profile = COURSE_TYPE_PROFILES.get(course_type, COURSE_TYPE_PROFILES["compliance"])

    prompt = f"""Eres un experto en Diseño Instruccional para e-learning corporativo de {_empresa_desc(empresa)}.

SOLICITUD DE CURSO:
- Nombre: {nombre}
- Arquetipo: {course_type} ({profile["label"]})
- Audiencia: {audiencia}
- Nivel: {nivel}
- Duración máxima: {duracion_min} minutos
- Objetivo: {objetivo}
- Temas a cubrir: {temas}
- Requiere evaluación: {"Sí" if requiere_eval else "No"}{docs_section}

PERFIL DIDÁCTICO OBLIGATORIO:
- Enfoque: {profile["focus"]}
- Estructura sugerida:
  1. {profile["structure"][0]}
  2. {profile["structure"][1]}
  3. {profile["structure"][2]}
  4. {profile["structure"][3]}
- Mix de recursos recomendado: {profile["resource_mix"]}
- Nivel de gamificación: {profile["gamification"]}

TIPOS DE RECURSO DISPONIBLES:
- Video avatar: Presentador virtual explicando (ideal para introducción, conceptos)
- Video: Video tradicional sin avatar
- Interactivo: Botones que revelan información al hacer clic
- Infografía: Visualización de datos o procesos
- Comparador: Tabla comparativa interactiva
- Flashcards: Tarjetas de repaso (pregunta/respuesta)
- Caso práctico: Escenario con decisiones y feedback
- Quiz: Preguntas de evaluación

REGLAS:
1. Divide en etapas: Introducción, Desarrollo, Cierre
2. Un bloque puede tener múltiples recursos (filas con mismo bloque)
3. Objetivos con verbos de Bloom medibles
4. Duración total NO debe exceder {duracion_min} minutos
5. Incluir Quiz al final si se requiere evaluación
6. Para cursos de compliance y proceso_sistema, incluir al menos 1 Caso práctico
7. Evitar exceso de Video avatar: máximo 1 en introducción y 1 en cierre
8. Cada recurso debe tener propósito claro y no repetir contenido

Genera una malla curricular. Responde SOLO con JSON array:
[
  {{
    "id": 1,
    "etapa": "Introducción",
    "bloque": "Nombre del bloque",
    "objetivo": "Al finalizar, el participante podrá...",
    "tipo_recurso": "Video avatar",
    "recurso": "Nombre descriptivo del recurso",
    "descripcion": "Qué contiene este recurso",
    "duracion_min": 2
  }}
]"""

    try:
        import traceback
        import sys

        # Debug: verificar API key
        key_preview = f"{api_key[:10]}...{api_key[-4:]}" if api_key and len(api_key) > 14 else "EMPTY"
        print(f"DEBUG: API key preview: {key_preview}", file=sys.stderr)

        client = OpenAI(api_key=api_key, timeout=60.0)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4000,
            temperature=0.7
        )

        content = response.choices[0].message.content
        start = content.find('[')
        end = content.rfind(']') + 1
        malla_data = json.loads(content[start:end])

        return malla_data, None

    except Exception as e:
        tb = traceback.format_exc()
        print(f"ERROR: {tb}", file=sys.stderr)
        return None, f"{type(e).__name__}: {str(e)}"


def iterar_malla(
    malla_actual: List[Dict[str, Any]],
    feedback: str,
    course_type: str = "compliance",
    empresa: Dict[str, Any] | None = None,
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """
    Regenera la malla incorporando el feedback del usuario.

    Returns:
        Tuple de (nueva malla, error si hubo)
    """
    api_key = get_openai_key()
    if not api_key:
        return None, "Falta OPENAI_API_KEY"

    course_type = (course_type or "compliance").strip().lower()
    profile = COURSE_TYPE_PROFILES.get(course_type, COURSE_TYPE_PROFILES["compliance"])

    prompt = f"""Eres un experto en Diseño Instruccional para e-learning corporativo de {_empresa_desc(empresa)}.

MALLA ACTUAL:
{json.dumps(malla_actual, indent=2, ensure_ascii=False)}

FEEDBACK DEL USUARIO:
{feedback}

ARQUETIPO DEL CURSO:
- {course_type} ({profile["label"]})
- Enfoque: {profile["focus"]}

REGLAS:
1. Incorpora TODOS los cambios del feedback
2. Mantén la estructura JSON
3. Un bloque puede tener múltiples recursos
4. No rompas la coherencia del arquetipo de curso

TIPOS DE RECURSO: Video avatar, Video, Interactivo, Infografía, Comparador, Flashcards, Caso práctico, Quiz

Responde SOLO con el JSON array actualizado."""

    try:
        client = OpenAI(api_key=api_key, timeout=60.0)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4000,
            temperature=0.7
        )

        content = response.choices[0].message.content
        start = content.find('[')
        end = content.rfind(']') + 1
        nueva_malla = json.loads(content[start:end])

        return nueva_malla, None

    except Exception as e:
        return None, str(e)
