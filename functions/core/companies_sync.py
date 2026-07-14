"""
Sync de la colección `companies` desde el Google Sheet "Empresas AI Learning Studio".

El Sheet es la fuente que administra el equipo (una fila por empresa; listas
separadas por coma). Una función programada (cada 15 min) baja el CSV export
del sheet y upsertea los docs de companies/{id}.

Requisito de acceso: el sheet debe estar compartido como "cualquier persona con
el enlace: Lector" (el export CSV es un fetch sin credenciales), o compartido
con la service account de las functions. Si el fetch devuelve 401/403/redirect
a login, se loguea el error y no se toca nada.

Reglas de seguridad del sync:
- Nunca pisa `scorm.shell_html` (se administra desde el dashboard).
- Solo procesa filas con company_id slug válido (la fila de ayuda se ignora).
- set(merge=True): campos no presentes en el sheet no se borran.
"""
from __future__ import annotations

import csv
import io
import logging
import re

import requests
from google.cloud.firestore import SERVER_TIMESTAMP

logger = logging.getLogger(__name__)

_SLUG_RE = re.compile(r"[a-z0-9][a-z0-9_-]*")


def _split(v) -> list[str]:
    return [s.strip() for s in str(v).split(",") if s and str(s).strip()] if v else []


def _row_to_company(row: dict) -> tuple[str, dict]:
    cid = str(row.get("company_id") or "").strip().lower()
    if not _SLUG_RE.fullmatch(cid or ""):
        raise ValueError(f"company_id inválido: {cid!r}")
    nombre = str(row.get("nombre") or cid.title()).strip()
    dominios = _split(row.get("dominios"))
    if not dominios:
        raise ValueError(f"{cid}: sin dominios")
    passing_raw = str(row.get("passing_score") or "").strip()
    return cid, {
        "nombre": nombre,
        "activo": str(row.get("activo") or "si").strip().lower() not in ("no", "false", "0"),
        "dominios": dominios,
        "learning_domains": _split(row.get("learning_domains")) or dominios,
        "industria": str(row.get("industria") or "").strip(),
        "descripcion_prompt": str(row.get("descripcion_prompt") or "").strip(),
        "branding": {
            "nombre_display": f"{nombre} E-Learning",
            "color_primario": str(row.get("color_primario") or "#DA291C").strip(),
            "color_acento": str(row.get("color_acento") or "#FFD700").strip(),
            "logo_url": str(row.get("logo_url") or "").strip() or None,
            "fuente_titulos": str(row.get("fuente_titulos") or "Montserrat").strip(),
            "fuente_texto": str(row.get("fuente_texto") or "Open Sans").strip(),
        },
        "email": {"from_name": str(row.get("email_from_name") or f"{nombre} E-Learning").strip()},
        "app_url": str(row.get("app_url") or "").strip() or None,
        "areas": _split(row.get("areas")) or None,
        "lms_nombre": str(row.get("lms_nombre") or "").strip() or None,
        "defaults": {
            "voice_id": str(row.get("voice_id") or "JddqVF50ZSIR7SRbJE6u").strip(),
            "avatar_id": str(row.get("avatar_id") or "Hada_LivelyGestures_Front_public").strip(),
            "passing_score": int(float(passing_raw)) if passing_raw else 70,
        },
        # Sin shell_html a propósito: el shell editado en el dashboard no se pisa.
        "scorm": {"manifest_identifier": f"{cid}_scorm"},
    }


def fetch_sheet_companies(sheet_id: str) -> dict[str, dict]:
    """Baja el CSV export del Google Sheet y devuelve {company_id: doc}."""
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    resp = requests.get(url, timeout=30, allow_redirects=True)
    ctype = resp.headers.get("Content-Type", "")
    if resp.status_code != 200 or "text/html" in ctype:
        # Redirect a login de Google = el sheet no es público para lectura.
        raise RuntimeError(
            f"No se pudo leer el sheet (HTTP {resp.status_code}, {ctype}). "
            "Verificar que esté compartido como 'cualquier persona con el enlace: Lector'."
        )
    companies: dict[str, dict] = {}
    for row in csv.DictReader(io.StringIO(resp.content.decode("utf-8"))):
        try:
            cid, data = _row_to_company(row)
        except ValueError:
            continue  # fila de ayuda / incompleta
        companies[cid] = data
    return companies


def sync_companies_from_sheet(db, sheet_id: str) -> dict:
    """Upsertea las empresas del sheet en Firestore. Devuelve resumen."""
    companies = fetch_sheet_companies(sheet_id)
    if not companies:
        logger.warning("Sheet sin filas de empresa válidas — no se sincroniza nada.")
        return {"synced": 0, "created": [], "updated": []}

    created, updated = [], []
    for cid, data in companies.items():
        ref = db.collection("companies").document(cid)
        existed = ref.get().exists
        data["updated_at"] = SERVER_TIMESTAMP
        data["synced_from_sheet"] = True
        ref.set(data, merge=True)
        (updated if existed else created).append(cid)

    if created:
        logger.info("Empresas NUEVAS desde el sheet: %s", created)
    logger.info("Sync de empresas OK: %d (nuevas: %d)", len(companies), len(created))
    return {"synced": len(companies), "created": created, "updated": updated}
