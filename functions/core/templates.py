"""
Templates de diseño instruccional para la generación de mallas (multi-tenant).

Reemplazan a los COURSE_TYPE_PROFILES hardcodeados: viven en Firestore
(colección `templates`), son editables desde el dashboard, y pueden ser
globales (company_id null, visibles para todas las empresas) o propios de una
empresa. La IA sugiere cuál usar según la solicitud (`sugerir_template`) y el
humano valida antes de generar.

Doc de template:
    nombre, descripcion (cuándo usarlo — la IA elige en base a esto),
    focus, estructura[4], resource_mix, gamification,
    company_id (null = global), activo, base (course_type legacy si aplica)
"""
from __future__ import annotations

from google.cloud.firestore import SERVER_TIMESTAMP

from core.services.malla_service import COURSE_TYPE_PROFILES

# Descripciones "cuándo usar" para el seed de los 5 perfiles legacy.
_CUANDO_USAR = {
    "compliance": "Normativas, regulaciones, prevención de riesgos, temas legales o de cumplimiento donde equivocarse tiene consecuencias (AML, FATCA, seguridad de la información, códigos de conducta).",
    "onboarding": "Incorporación de gente nueva: bienvenida, cultura, conocer el rol, primeras tareas y herramientas del día a día.",
    "proceso_sistema": "Aprender a ejecutar un proceso operativo o usar un sistema/herramienta paso a paso, con foco en reducir errores.",
    "habilidades_blandas": "Comunicación, liderazgo, feedback, atención al cliente, trabajo en equipo — conductas y criterio interpersonal.",
    "producto_ventas": "Conocer un producto o servicio para venderlo o asesorarlo: propuesta de valor, objeciones, argumentación y cierre.",
}


def ensure_seed(db) -> None:
    """Crea los 5 templates globales desde los perfiles legacy si la colección
    aún no tiene ninguno global. Idempotente y barato (una query liviana)."""
    existing = list(
        db.collection("templates").where("company_id", "==", None).limit(1).stream()
    )
    if existing:
        return
    for key, p in COURSE_TYPE_PROFILES.items():
        db.collection("templates").document(key).set({
            "nombre": p["label"],
            "descripcion": _CUANDO_USAR.get(key, p["focus"]),
            "focus": p["focus"],
            "estructura": p["structure"],
            "resource_mix": p["resource_mix"],
            "gamification": p["gamification"],
            "company_id": None,
            "activo": True,
            "base": key,
            "created_at": SERVER_TIMESTAMP,
            "updated_at": SERVER_TIMESTAMP,
        }, merge=True)


def list_templates(db, company_id: str | None) -> list[dict]:
    """Templates visibles para una empresa: globales + propios. Ordena globales
    primero. Filtra inactivos."""
    ensure_seed(db)
    out: list[dict] = []
    seen: set[str] = set()

    def _collect(query):
        for snap in query.stream():
            if snap.id in seen:
                continue
            d = snap.to_dict() or {}
            if not d.get("activo", True):
                continue
            d["id"] = snap.id
            out.append(d)
            seen.add(snap.id)

    _collect(db.collection("templates").where("company_id", "==", None))
    if company_id:
        _collect(db.collection("templates").where("company_id", "==", company_id))
    return sorted(out, key=lambda t: (t.get("company_id") is not None, t.get("nombre", "").lower()))


def get_template(db, template_id: str, company_id: str | None) -> dict | None:
    """Un template por id, validando que sea global o de la empresa."""
    snap = db.collection("templates").document(template_id).get()
    if not snap.exists:
        return None
    d = snap.to_dict() or {}
    owner = d.get("company_id")
    if owner is not None and owner != company_id:
        return None
    if not d.get("activo", True):
        return None
    d["id"] = snap.id
    return d


def template_for_prompt(t: dict) -> dict:
    """Normaliza un template a los campos que consume generar_malla."""
    return {
        "label": t.get("nombre", ""),
        "focus": t.get("focus", ""),
        "structure": (list(t.get("estructura") or []) + [""] * 4)[:4],
        "resource_mix": t.get("resource_mix", ""),
        "gamification": t.get("gamification", ""),
    }
