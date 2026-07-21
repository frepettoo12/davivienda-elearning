"""
Google Secret Manager: almacenamiento seguro de las API keys de IA por empresa
(BYOK). La key NUNCA se guarda en Firestore (solo un flag); vive cifrada acá.

Secret por empresa: `anthropic-key-{company_id}`. Requiere:
  - Secret Manager API habilitada en el proyecto.
  - La service account de las Functions con rol `roles/secretmanager.admin`
    (crear secret + agregar versión). El agent-service (lector) usa `secretAccessor`.
"""
import os
import re

from google.cloud import secretmanager
from google.api_core import exceptions as gexc

_PROJECT = (
    os.environ.get("GCLOUD_PROJECT")
    or os.environ.get("GOOGLE_CLOUD_PROJECT")
    or "davivienda-elearning"
)

_client = None


def _sm():
    global _client
    if _client is None:
        _client = secretmanager.SecretManagerServiceClient()
    return _client


def _secret_id(company_id: str) -> str:
    # IDs de secret válidos: [a-zA-Z0-9_-]. Sanitizamos el company_id.
    cid = re.sub(r"[^a-zA-Z0-9_-]", "-", str(company_id or ""))[:200]
    return f"anthropic-key-{cid}"


def set_byok_key(company_id: str, api_key: str) -> None:
    """Crea el secret de la empresa si no existe y agrega una versión con la key."""
    sid = _secret_id(company_id)
    parent = f"projects/{_PROJECT}"
    name = f"{parent}/secrets/{sid}"
    try:
        _sm().get_secret(request={"name": name})
    except gexc.NotFound:
        _sm().create_secret(request={
            "parent": parent,
            "secret_id": sid,
            "secret": {"replication": {"automatic": {}}},
        })
    _sm().add_secret_version(request={
        "parent": name,
        "payload": {"data": api_key.encode("utf-8")},
    })


def clear_byok_key(company_id: str) -> None:
    """Deshabilita todas las versiones vigentes (equivale a borrar la key)."""
    name = f"projects/{_PROJECT}/secrets/{_secret_id(company_id)}"
    try:
        for v in _sm().list_secret_versions(request={"parent": name}):
            if v.state == secretmanager.SecretVersion.State.ENABLED:
                try:
                    _sm().destroy_secret_version(request={"name": v.name})
                except Exception:
                    pass
    except gexc.NotFound:
        pass
