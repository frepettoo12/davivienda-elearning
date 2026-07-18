"""
Perfil de Salida (temario) — paso previo a la malla.

A partir de la solicitud, la IA propone el "contrato" pedagógico del curso:
qué va a poder hacer el participante al terminar (competencias) y el temario
(módulos con temas). El área solicitante lo valida antes de armar la malla.

Estados del perfil (solicitudes/{id}.perfil_salida.status):
    borrador       → generado/editado por Learning, aún no enviado
    en_validacion  → enviado al área solicitante
    con_cambios    → el área pidió ajustes (feedback en validacion_feedback)
    aprobado       → validado; habilita generar la malla
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional, Tuple

from openai import OpenAI

from ..config import get_openai_key


def _empresa_desc(empresa: Dict[str, Any] | None) -> str:
    if empresa and empresa.get("nombre"):
        industria = empresa.get("industria") or empresa.get("descripcion_prompt") or ""
        return f"{empresa['nombre']} ({industria})" if industria else empresa["nombre"]
    return "Davivienda (banco colombiano)"


def generar_perfil(
    curso: Dict[str, Any],
    empresa: Dict[str, Any] | None = None,
    perfil_actual: Dict[str, Any] | None = None,
    feedback: str | None = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Genera (o itera, si hay perfil_actual+feedback) el perfil de salida.

    Devuelve ({objetivo_general, competencias[], temario[{modulo, temas[]}]}, error).
    """
    api_key = get_openai_key()
    if not api_key:
        return None, "Falta OPENAI_API_KEY"

    iteracion = ""
    if perfil_actual and feedback:
        iteracion = f"""
PERFIL ACTUAL (a iterar):
{json.dumps(perfil_actual, indent=2, ensure_ascii=False)}

FEEDBACK A INCORPORAR (del área solicitante o del diseñador):
{feedback}

Incorporá TODOS los cambios pedidos manteniendo lo que no se cuestionó.
"""

    prompt = f"""Eres un experto en Diseño Instruccional para e-learning corporativo de {_empresa_desc(empresa)}.

Definí el PERFIL DE SALIDA de este curso: el compromiso concreto de qué va a poder
hacer el participante al terminar, y el temario que lo sostiene. Este documento lo
valida el área que pidió el curso ANTES de diseñar la malla, así que tiene que ser
claro para alguien de negocio (no jerga pedagógica).

SOLICITUD:
- Curso: {curso.get('nombre', '')}
- Audiencia: {curso.get('audiencia', '')}
- Nivel: {curso.get('nivel', '')}
- Duración objetivo: {curso.get('duracion_min', '')} minutos
- Objetivo declarado: {curso.get('objetivo', '')}
- Temas pedidos: {str(curso.get('temas', ''))[:3000]}
- Requiere evaluación: {curso.get('requiere_eval', True)}
{iteracion}
REGLAS:
1. Competencias: 3 a 6, observables y medibles ("identifica…", "aplica…", "decide…"),
   escritas para la audiencia real. Nada de "conocer" o "entender".
2. Temario: 3 a 6 módulos, cada uno con 2 a 5 temas puntuales. Debe caber en la
   duración objetivo.
3. Cubrir TODOS los temas pedidos en la solicitud; si algo no entra en la duración,
   dejalo fuera y explicalo en "fuera_de_alcance".
4. Lenguaje simple, en español.

Responde SOLO JSON:
{{
  "objetivo_general": "Al finalizar el curso, el participante podrá…",
  "competencias": ["…", "…"],
  "temario": [
    {{"modulo": "Nombre del módulo", "temas": ["tema 1", "tema 2"]}}
  ],
  "fuera_de_alcance": "qué quedó afuera y por qué, o null"
}}"""

    try:
        client = OpenAI(api_key=api_key, timeout=60.0)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Responde SOLO JSON válido, sin markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
        )
        content = response.choices[0].message.content
        start, end = content.find("{"), content.rfind("}") + 1
        perfil = json.loads(content[start:end])
        if not perfil.get("competencias") or not perfil.get("temario"):
            return None, "El perfil generado vino incompleto"
        return perfil, None
    except Exception as e:
        return None, str(e)
