"""
Servicio de generación de guiones/diseño instruccional.
"""
import json
from typing import Dict, List, Any, Optional, Tuple
from openai import OpenAI

from ..config import get_openai_key

COURSE_TYPE_GUIDANCE = {
    "compliance": "Prioriza precisión normativa, decisiones correctas y consecuencias de error.",
    "onboarding": "Prioriza claridad, orientación práctica y pasos concretos para el primer mes.",
    "proceso_sistema": "Prioriza secuencia operativa, checkpoints y prevención de errores frecuentes.",
    "habilidades_blandas": "Prioriza conversación realista, empatía, escucha y criterio conductual.",
    "producto_ventas": "Prioriza propuesta de valor, detección de necesidad, objeciones y cierre.",
}


def _empresa_desc(empresa: Dict[str, Any] | None) -> tuple[str, str]:
    """(nombre para el prompt, contexto de industria para ejemplos)."""
    if empresa and empresa.get("nombre"):
        industria = empresa.get("industria") or empresa.get("descripcion_prompt") or "la industria de la empresa"
        return empresa["nombre"], industria
    return "Davivienda", "banca colombiana"


def generar_guion(
    recurso: Dict[str, Any],
    contexto_curso: Dict[str, str],
    empresa: Dict[str, Any] | None = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Genera el guion/contenido detallado para un recurso específico.

    Args:
        recurso: Dict con id, tipo_recurso, bloque, objetivo, descripcion
        contexto_curso: Dict con nombre, audiencia, objetivo general

    Returns:
        Tuple de (guion generado, error si hubo)
    """
    api_key = get_openai_key()
    if not api_key:
        return None, "Falta OPENAI_API_KEY"

    tipo = recurso.get("tipo_recurso", "Video")

    # Prompts específicos por tipo de recurso
    instrucciones_tipo = {
        "Video avatar": """
Genera un guion de video con avatar virtual.
- voiceover: Texto completo que dirá el avatar (conversacional, profesional)
- puntos_clave: Lista de 3-5 puntos principales
- duracion_estimada: Duración en segundos""",

        "Video": """
Genera un guion de video con slides.
- voiceover: Texto completo de la narración
- slides: Lista de objetos {titulo, bullets: [...]}
- duracion_estimada: Duración en segundos""",

        "Manual": """
Genera un MANUAL: documento explicativo detallado y bien estructurado que el
participante puede leer y consultar. Explicá los temas a fondo, con claridad.
- titulo: Título del manual
- introduccion: Párrafo breve que presenta de qué trata
- secciones: Lista de {titulo, contenido}. El "contenido" es texto explicativo
  desarrollado (2 a 5 párrafos por sección, podés usar viñetas dentro con "- ").
  Entre 3 y 6 secciones.""",

        "Video externo": """
Genera la referencia a un video/curso EXTERNO (YouTube u oficial) sobre una
herramienta técnica de terceros.
- titulo: Título del recurso
- url: URL del video/curso (YouTube u oficial). Si no tenés una URL confiable,
  dejala vacía para que Learning la complete.
- descripcion: Qué se aprende y por qué es relevante para este curso""",

        "Interactivo": """
Genera contenido interactivo con botones/acordeones.
- titulo: Título de la sección
- elementos: Lista de {etiqueta, contenido_oculto}
- instruccion: Texto que guía al usuario""",

        "Infografía": """
Genera contenido para una infografía.
- titulo: Título principal
- secciones: Lista de {icono, titulo, descripcion}
- dato_destacado: Un número o dato impactante""",

        "Comparador": """
Genera una tabla comparativa.
- titulo: Título de la comparación
- columnas: Lista de nombres de columnas
- filas: Lista de {aspecto, valores: [...]}""",

        "Flashcards": """
Genera tarjetas de repaso.
- titulo: Título del set
- tarjetas: Lista de {frente, reverso}""",

        "Caso práctico": """
Genera un caso práctico con decisiones.
- escenario: Descripción de la situación
- preguntas: Lista de {pregunta, opciones: [...], correcta: índice, feedback}""",

        "Quiz": """
Genera preguntas de evaluación.
- titulo: Título del quiz
- preguntas: Lista de {pregunta, opciones: [...], correcta: índice, explicacion}""",
    }

    instruccion = instrucciones_tipo.get(tipo, instrucciones_tipo["Video"])

    empresa_nombre, empresa_industria = _empresa_desc(empresa)

    prompt = f"""Eres un diseñador instruccional experto en e-learning corporativo para {empresa_nombre}.

CONTEXTO DEL CURSO:
- Nombre: {contexto_curso.get('nombre', '')}
- Arquetipo: {contexto_curso.get('course_type', 'compliance')}
- Audiencia: {contexto_curso.get('audiencia', '')}
- Objetivo general: {contexto_curso.get('objetivo', '')}
- Guía didáctica: {COURSE_TYPE_GUIDANCE.get(contexto_curso.get('course_type', 'compliance'), COURSE_TYPE_GUIDANCE['compliance'])}

RECURSO A DESARROLLAR:
- Tipo: {tipo}
- Bloque: {recurso.get('bloque', '')}
- Objetivo específico: {recurso.get('objetivo', '')}
- Descripción: {recurso.get('descripcion', '')}
- Duración máxima: {recurso.get('duracion_min', 3)} minutos

INSTRUCCIONES:
{instruccion}

REGLAS:
1. Lenguaje profesional pero accesible
2. Ejemplos relevantes para {empresa_industria}
3. Contenido práctico y aplicable
4. Coherencia estricta con el arquetipo del curso

Responde SOLO con JSON:
{{
  "id": {recurso.get('id', 1)},
  "tipo": "{tipo}",
  "bloque": "{recurso.get('bloque', '')}",
  "contenido": {{ ... }}
}}"""

    try:
        client = OpenAI(api_key=api_key, timeout=60.0)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.7
        )

        content = response.choices[0].message.content
        start = content.find('{')
        end = content.rfind('}') + 1
        guion = json.loads(content[start:end])

        return guion, None

    except Exception as e:
        return None, str(e)


def generar_guiones_batch(
    malla: List[Dict[str, Any]],
    contexto_curso: Dict[str, str],
    max_workers: int = 8,
    empresa: Dict[str, Any] | None = None,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Genera guiones para todos los recursos de una malla en paralelo.

    Las llamadas a OpenAI se ejecutan concurrentemente (ThreadPoolExecutor)
    para no exceder el timeout de la Cloud Function en mallas grandes.

    Returns:
        Tuple de (lista de guiones, lista de errores) en el orden de la malla.
    """
    from concurrent.futures import ThreadPoolExecutor

    if not malla:
        return [], []

    workers = max(1, min(max_workers, len(malla)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        resultados = list(
            executor.map(lambda r: generar_guion(r, contexto_curso, empresa=empresa), malla)
        )

    guiones = []
    errores = []
    for recurso, (guion, error) in zip(malla, resultados):
        if guion:
            guiones.append(guion)
        if error:
            errores.append(f"Recurso {recurso.get('id')}: {error}")

    return guiones, errores
