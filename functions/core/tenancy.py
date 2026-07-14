"""
Resolución de tenant (empresa) para el modelo multi-company.

Fuente de verdad: colección Firestore `companies/{company_id}`:
    nombre, activo, dominios[], learning_domains[], industria, descripcion_prompt,
    branding{...}, email{from_name}, app_url, areas[], lms_nombre,
    defaults{voice_id, avatar_id, passing_score}, scorm{shell_html, manifest_identifier}

Mapeo usuario→empresa: por dominio del email (companies.dominios array-contains).
Usuarios de dominios no registrados (ej. gmail solicitante) se mapean vía
`users/{uid}.company_id` (se persiste al crear su primera solicitud).

Los docs de datos legados sin `company_id` pertenecen a `davivienda`
(DEFAULT_COMPANY_ID): la plataforma nació single-tenant para Davivienda.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import firebase_admin
from firebase_admin import firestore

DEFAULT_COMPANY_ID = "davivienda"

# Config mínima embebida por si la colección `companies` aún no fue seedeada
# (scripts/seed_companies.py). Mantiene el comportamiento pre-multi-tenant.
FALLBACK_COMPANY = {
    "nombre": "Davivienda",
    "activo": True,
    "dominios": ["davivienda.com", "alkemy.org"],
    "learning_domains": ["davivienda.com", "alkemy.org"],
    "industria": "banca colombiana",
    "descripcion_prompt": "banco colombiano líder en servicios financieros",
    "branding": {
        "nombre_display": "Davivienda E-Learning",
        "color_primario": "#DA291C",
        "color_acento": "#FFD700",
        "logo_url": None,
        "fuente_titulos": "Montserrat",
        "fuente_texto": "Open Sans",
    },
    "email": {"from_name": "Davivienda E-Learning"},
    "app_url": None,
    "areas": None,
    "lms_nombre": "Territorium",
    "defaults": {
        "voice_id": "JddqVF50ZSIR7SRbJE6u",
        "avatar_id": "Hada_LivelyGestures_Front_public",
        "passing_score": 70,
    },
    "scorm": {"shell_html": "", "manifest_identifier": "davivienda_scorm"},
}


@dataclass
class RequestContext:
    """Identidad + tenant del request autenticado."""
    uid: str
    email: str
    company_id: str | None
    company: dict | None
    rol: str  # "learning" | "solicitante"
    is_superadmin: bool = False


def _db():
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    return firestore.client()


# Cache in-module (las instancias warm de Functions lo comparten). TTL corto:
# cambios en `companies` tardan hasta _TTL segundos en verse por instancia.
_TTL = 300
_domain_cache: dict[str, tuple[float, str | None]] = {}   # domain -> (expira, company_id|None)
_company_cache: dict[str, tuple[float, dict | None]] = {}  # company_id -> (expira, doc|None)


def get_company(company_id: str) -> dict | None:
    """Doc de la company por id (cacheado). Nunca lanza: si Firestore falla,
    davivienda cae al FALLBACK_COMPANY embebido y el resto devuelve None."""
    hit = _company_cache.get(company_id)
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        snap = _db().collection("companies").document(company_id).get()
        data = snap.to_dict() if snap.exists else None
    except Exception:
        # Falla transitoria: último valor conocido (o fallback davivienda) sin cachear.
        if hit:
            return hit[1]
        return dict(FALLBACK_COMPANY) if company_id == DEFAULT_COMPANY_ID else None
    if data is None and company_id == DEFAULT_COMPANY_ID:
        data = dict(FALLBACK_COMPANY)
    _company_cache[company_id] = (time.time() + _TTL, data)
    return data


def resolve_company_by_domain(domain: str) -> tuple[str | None, dict | None]:
    """(company_id, doc) para un dominio de email, o (None, None)."""
    domain = (domain or "").lower()
    hit = _domain_cache.get(domain)
    if hit and hit[0] > time.time():
        cid = hit[1]
        return (cid, get_company(cid)) if cid else (None, None)

    try:
        docs = list(
            _db().collection("companies")
            .where("dominios", "array_contains", domain)
            .limit(1)
            .stream()
        )
    except Exception:
        # Falla transitoria: no cachear un "no existe" falso.
        return (None, None) if not hit else (hit[1], get_company(hit[1]) if hit[1] else None)
    if docs:
        cid, data = docs[0].id, docs[0].to_dict()
        _domain_cache[domain] = (time.time() + _TTL, cid)
        _company_cache[cid] = (time.time() + _TTL, data)
        return cid, data

    # Colección sin seed: preservar el mapeo legacy de Davivienda.
    if domain in FALLBACK_COMPANY["dominios"] and not _companies_seeded():
        _domain_cache[domain] = (time.time() + _TTL, DEFAULT_COMPANY_ID)
        return DEFAULT_COMPANY_ID, get_company(DEFAULT_COMPANY_ID)

    _domain_cache[domain] = (time.time() + _TTL, None)
    return None, None


_seeded: tuple[float, bool] | None = None


def _companies_seeded() -> bool:
    global _seeded
    if _seeded and _seeded[0] > time.time():
        return _seeded[1]
    try:
        exists = bool(list(_db().collection("companies").limit(1).stream()))
    except Exception:
        exists = False
    _seeded = (time.time() + _TTL, exists)
    return exists


_superadmins: tuple[float, set] | None = None


def get_superadmin_emails() -> set[str]:
    """Emails con acceso cross-tenant (config/platform.superadmin_emails), cacheado.

    Solo cachea lecturas exitosas: si Firestore falla no se guarda un set vacío
    (eso degradaría al superadmin a usuario común por _TTL segundos)."""
    global _superadmins
    if _superadmins and _superadmins[0] > time.time():
        return _superadmins[1]
    try:
        snap = _db().collection("config").document("platform").get()
        emails = {
            str(e).strip().lower()
            for e in ((snap.to_dict() or {}).get("superadmin_emails", []) if snap.exists else [])
            if e
        }
    except Exception:
        # Falla transitoria: usar el último valor conocido sin renovar el TTL.
        return _superadmins[1] if _superadmins else set()
    _superadmins = (time.time() + _TTL, emails)
    return emails


def list_companies() -> list[dict]:
    """Listado liviano de empresas activas (para el selector de superadmin)."""
    out = []
    try:
        for snap in _db().collection("companies").stream():
            d = snap.to_dict() or {}
            if not d.get("activo", True):
                continue
            out.append({
                "id": snap.id,
                "nombre": d.get("nombre") or snap.id,
                "color_primario": (d.get("branding") or {}).get("color_primario"),
            })
    except Exception:
        pass
    return sorted(out, key=lambda c: c["nombre"].lower())


def resolve_user_company(uid: str) -> tuple[str | None, dict | None]:
    """Mapeo explícito users/{uid}.company_id (solicitantes de dominios no registrados)."""
    try:
        snap = _db().collection("users").document(uid).get()
    except Exception:
        return None, None
    if not snap.exists:
        return None, None
    cid = (snap.to_dict() or {}).get("company_id")
    if not cid:
        return None, None
    return cid, get_company(cid)


def assign_user_company(uid: str, email: str, company_id: str) -> None:
    """Persiste el mapeo usuario→empresa (primera solicitud de un externo)."""
    _db().collection("users").document(uid).set(
        {
            "email": email,
            "company_id": company_id,
            "rol": "solicitante",
            "updated_at": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )


def owner_company_id(doc_data: dict | None) -> str:
    """company_id dueño de un doc de datos; legacy sin campo = davivienda."""
    return (doc_data or {}).get("company_id") or DEFAULT_COMPANY_ID
