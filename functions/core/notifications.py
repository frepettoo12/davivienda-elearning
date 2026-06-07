"""
Envío de emails de notificación vía SendGrid + helpers de eventos.

Config (env vars / secrets en runtime de la función):
- SENDGRID_API_KEY  (secret) — API key de SendGrid. Si falta, los envíos se loguean y se omiten.
- SENDGRID_FROM     (env)    — remitente verificado en SendGrid. Default placeholder.
- APP_URL           (env)    — base del frontend para armar links. Default localhost:3000.

Diseño: best-effort. Nunca rompe el endpoint que la llama (si el email falla, se loguea
y se sigue). Los disparadores: mención en comentario, nueva solicitud, asignación, cambio de estado.
"""
from __future__ import annotations

import os
import logging

import requests

logger = logging.getLogger(__name__)

SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"
LEARNING_DOMAINS = ["davivienda.com", "alkemy.org"]


def _from() -> str:
    return os.environ.get("SENDGRID_FROM", "no-reply@davivienda-elearning.com")


def _app_url() -> str:
    return os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")


def send_email(to: str | list[str], subject: str, html: str) -> bool:
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
        "from": {"email": _from(), "name": "Davivienda E-Learning"},
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


def _shell(titulo: str, cuerpo_html: str, cta_text: str | None = None, cta_url: str | None = None) -> str:
    cta = ""
    if cta_text and cta_url:
        cta = (
            f'<a href="{cta_url}" style="display:inline-block;margin-top:18px;background:#DA291C;'
            f'color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600">{cta_text}</a>'
        )
    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
      <div style="background:#DA291C;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
        <strong style="font-size:16px">Davivienda E-Learning</strong>
      </div>
      <div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:22px">
        <h2 style="margin:0 0 12px;font-size:18px">{titulo}</h2>
        <div style="font-size:14px;line-height:1.55;color:#444">{cuerpo_html}</div>
        {cta}
      </div>
    </div>"""


# ── Disparadores ──────────────────────────────────────────────────────────────

def notify_mencion(emails: list[str], autor: str, solicitud_id: str, curso: str, texto: str) -> None:
    url = f"{_app_url()}/dashboard/solicitudes/{solicitud_id}"
    cuerpo = (
        f"<p><strong>{autor or 'Alguien'}</strong> te mencionó en un comentario de la solicitud "
        f"<strong>{curso}</strong>:</p>"
        f"<blockquote style='border-left:3px solid #FFD700;margin:12px 0;padding:6px 14px;color:#555'>{texto}</blockquote>"
    )
    send_email(emails, f"Te mencionaron en «{curso}»", _shell("Nueva mención 💬", cuerpo, "Ver solicitud", url))


def notify_nueva_solicitud(solicitud_id: str, curso: str, solicitante: str, area: str) -> None:
    """Avisa al equipo Learning (usuarios de Firebase Auth con dominio de Learning)."""
    try:
        from firebase_admin import auth as fb_auth
        destinatarios = []
        for u in fb_auth.list_users().iterate_all():
            if u.email and u.email.split("@")[-1] in LEARNING_DOMAINS:
                destinatarios.append(u.email)
    except Exception as e:
        logger.error("No se pudo listar usuarios para notificar nueva solicitud: %s", e)
        destinatarios = []
    if not destinatarios:
        return
    url = f"{_app_url()}/dashboard/solicitudes/{solicitud_id}"
    cuerpo = (
        f"<p>Se cargó una nueva solicitud de curso:</p>"
        f"<p><strong>{curso}</strong><br>Solicitante: {solicitante}<br>Área: {area}</p>"
    )
    send_email(destinatarios, f"Nueva solicitud: «{curso}»", _shell("Nueva solicitud 📥", cuerpo, "Revisar", url))


def notify_asignacion(email: str, solicitud_id: str, curso: str) -> None:
    url = f"{_app_url()}/dashboard/solicitudes/{solicitud_id}"
    cuerpo = f"<p>Te asignaron la solicitud <strong>{curso}</strong>.</p>"
    send_email(email, f"Te asignaron «{curso}»", _shell("Solicitud asignada 📌", cuerpo, "Ver solicitud", url))


def notify_cambio_estado(email: str, solicitud_id: str, curso: str, estado: str) -> None:
    url = f"{_app_url()}/solicitante/solicitud/{solicitud_id}"
    cuerpo = f"<p>Tu solicitud <strong>{curso}</strong> cambió de estado a: <strong>{estado}</strong>.</p>"
    send_email(email, f"«{curso}»: {estado}", _shell("Actualización de tu solicitud 🔔", cuerpo, "Ver detalle", url))
