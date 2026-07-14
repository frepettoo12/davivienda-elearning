"""
Envío de emails de notificación vía SendGrid + helpers de eventos.

Config (env vars / secrets en runtime de la función):
- SENDGRID_API_KEY  (secret) — API key de SendGrid. Si falta, los envíos se loguean y se omiten.
- SENDGRID_FROM     (env)    — remitente verificado en SendGrid. Default placeholder.
- APP_URL           (env)    — base del frontend para armar links. Default localhost:3000.

Multi-tenant: todos los disparadores aceptan `company` (doc de companies/{id}).
Con company, el branding del email (nombre, colores), los destinatarios del
equipo Learning y la base de los links salen de la config de esa empresa.
Sin company (None) se comporta como el legacy Davivienda.

Diseño: best-effort. Nunca rompe el endpoint que la llama (si el email falla, se loguea
y se sigue). Los disparadores: mención en comentario, nueva solicitud, asignación, cambio de estado.
"""
from __future__ import annotations

import os
import logging

import requests

logger = logging.getLogger(__name__)

SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"
# Default legacy (Davivienda). Con company, se usa company["learning_domains"].
LEARNING_DOMAINS = ["davivienda.com", "alkemy.org"]

_DEFAULT_BRANDING = {
    "nombre_display": "Davivienda E-Learning",
    "color_primario": "#DA291C",
    "color_acento": "#FFD700",
}


def _from() -> str:
    return os.environ.get("SENDGRID_FROM", "no-reply@davivienda-elearning.com")


def _app_url(company: dict | None = None) -> str:
    if company and company.get("app_url"):
        return str(company["app_url"]).rstrip("/")
    return os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")


def _branding(company: dict | None) -> dict:
    b = dict(_DEFAULT_BRANDING)
    if company:
        b.update({k: v for k, v in (company.get("branding") or {}).items() if v})
        if not (company.get("branding") or {}).get("nombre_display") and company.get("nombre"):
            b["nombre_display"] = f"{company['nombre']} E-Learning"
    return b


def _from_name(company: dict | None) -> str:
    if company:
        name = (company.get("email") or {}).get("from_name")
        if name:
            return name
        if company.get("nombre"):
            return f"{company['nombre']} E-Learning"
    return "Davivienda E-Learning"


def send_email(to: str | list[str], subject: str, html: str, from_name: str | None = None) -> bool:
    """Envía un email vía SendGrid. Devuelve True si se envió. Best-effort (no lanza)."""
    recipients = [to] if isinstance(to, str) else list(to)
    recipients = [r for r in {r.strip() for r in recipients} if r and "@" in r]
    if not recipients:
        return False

    api_key = os.environ.get("SENDGRID_API_KEY")
    if not api_key:
        logger.warning("SENDGRID_API_KEY no configurada — email omitido a %s (%s)", recipients, subject)
        return False

    payload = {
        "personalizations": [{"to": [{"email": r} for r in recipients]}],
        "from": {"email": _from(), "name": from_name or "Davivienda E-Learning"},
        "subject": subject,
        "content": [{"type": "text/html", "value": html}],
    }
    try:
        resp = requests.post(
            SENDGRID_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )
        if resp.status_code >= 300:
            logger.error("SendGrid error %s: %s", resp.status_code, resp.text[:300])
            return False
        return True
    except Exception as e:  # nunca romper el endpoint
        logger.error("Error enviando email: %s", e)
        return False


def _shell(
    titulo: str,
    cuerpo_html: str,
    cta_text: str | None = None,
    cta_url: str | None = None,
    company: dict | None = None,
) -> str:
    b = _branding(company)
    primario = b["color_primario"]
    nombre = b["nombre_display"]
    cta = ""
    if cta_text and cta_url:
        cta = (
            f'<a href="{cta_url}" style="display:inline-block;margin-top:18px;background:{primario};'
            f'color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600">{cta_text}</a>'
        )
    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
      <div style="background:{primario};color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
        <strong style="font-size:16px">{nombre}</strong>
      </div>
      <div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:22px">
        <h2 style="margin:0 0 12px;font-size:18px">{titulo}</h2>
        <div style="font-size:14px;line-height:1.55;color:#444">{cuerpo_html}</div>
        {cta}
      </div>
    </div>"""


# ── Disparadores ──────────────────────────────────────────────────────────────

def notify_mencion(
    emails: list[str], autor: str, solicitud_id: str, curso: str, texto: str,
    company: dict | None = None,
) -> None:
    url = f"{_app_url(company)}/dashboard/solicitudes/{solicitud_id}"
    acento = _branding(company)["color_acento"]
    cuerpo = (
        f"<p><strong>{autor or 'Alguien'}</strong> te mencionó en un comentario de la solicitud "
        f"<strong>{curso}</strong>:</p>"
        f"<blockquote style='border-left:3px solid {acento};margin:12px 0;padding:6px 14px;color:#555'>{texto}</blockquote>"
    )
    send_email(
        emails, f"Te mencionaron en «{curso}»",
        _shell("Nueva mención 💬", cuerpo, "Ver solicitud", url, company=company),
        from_name=_from_name(company),
    )


def notify_nueva_solicitud(
    solicitud_id: str, curso: str, solicitante: str, area: str,
    company: dict | None = None,
) -> None:
    """Avisa al equipo Learning de la empresa (usuarios de Firebase Auth con
    dominio en learning_domains de la company)."""
    domains = (company or {}).get("learning_domains") or LEARNING_DOMAINS
    try:
        from firebase_admin import auth as fb_auth
        destinatarios = []
        for u in fb_auth.list_users().iterate_all():
            if u.email and u.email.split("@")[-1] in domains:
                destinatarios.append(u.email)
    except Exception as e:
        logger.error("No se pudo listar usuarios para notificar nueva solicitud: %s", e)
        destinatarios = []
    if not destinatarios:
        return
    url = f"{_app_url(company)}/dashboard/solicitudes/{solicitud_id}"
    cuerpo = (
        f"<p>Se cargó una nueva solicitud de curso:</p>"
        f"<p><strong>{curso}</strong><br>Solicitante: {solicitante}<br>Área: {area}</p>"
    )
    send_email(
        destinatarios, f"Nueva solicitud: «{curso}»",
        _shell("Nueva solicitud 📥", cuerpo, "Revisar", url, company=company),
        from_name=_from_name(company),
    )


def notify_asignacion(email: str, solicitud_id: str, curso: str, company: dict | None = None) -> None:
    url = f"{_app_url(company)}/dashboard/solicitudes/{solicitud_id}"
    cuerpo = f"<p>Te asignaron la solicitud <strong>{curso}</strong>.</p>"
    send_email(
        email, f"Te asignaron «{curso}»",
        _shell("Solicitud asignada 📌", cuerpo, "Ver solicitud", url, company=company),
        from_name=_from_name(company),
    )


def notify_cambio_estado(
    email: str, solicitud_id: str, curso: str, estado: str,
    company: dict | None = None,
) -> None:
    url = f"{_app_url(company)}/solicitante/solicitud/{solicitud_id}"
    cuerpo = f"<p>Tu solicitud <strong>{curso}</strong> cambió de estado a: <strong>{estado}</strong>.</p>"
    send_email(
        email, f"«{curso}»: {estado}",
        _shell("Actualización de tu solicitud 🔔", cuerpo, "Ver detalle", url, company=company),
        from_name=_from_name(company),
    )
