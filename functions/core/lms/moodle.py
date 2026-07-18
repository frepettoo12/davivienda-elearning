"""
Conector Moodle (web services REST).

Qué automatiza con la API core de Moodle (sin plugins):
1. Probar la conexión y permisos del token (core_webservice_get_site_info).
2. Crear el curso (core_course_create_courses).
3. Subir el SCORM.zip al área de borradores del usuario del token
   (webservice/upload.php) — queda disponible en el file picker.

Lo que la API core NO permite: crear la actividad SCORM dentro del curso.
El resultado de publicar incluye el link directo al curso y el paso manual
restante (Agregar actividad → Paquete SCORM → Archivos recientes), que es
1 minuto de trabajo del admin.

Requisitos en el Moodle del cliente (una sola vez):
- Administración del sitio → Funciones avanzadas → habilitar servicios web.
- Habilitar el protocolo REST.
- Crear un token para un usuario con permisos de crear cursos y usar
  core_course_create_courses / core_webservice_get_site_info.
"""
from __future__ import annotations

import re

import requests

_TIMEOUT = 60


class MoodleError(Exception):
    pass


def _safe_base(base_url: str) -> str:
    """Valida la URL del LMS contra SSRF (no IPs internas). Lanza MoodleError."""
    from core.security import assert_safe_url, UnsafeURLError
    try:
        assert_safe_url(base_url)
    except UnsafeURLError as e:
        raise MoodleError(f"URL del LMS no permitida: {e}")
    return base_url.rstrip("/")


def _rest(base_url: str, token: str, fn: str, params: dict | None = None) -> dict | list:
    """Llama a un web service REST de Moodle y normaliza los errores."""
    url = f"{_safe_base(base_url)}/webservice/rest/server.php"
    data = {
        "wstoken": token,
        "wsfunction": fn,
        "moodlewsrestformat": "json",
        **(params or {}),
    }
    try:
        resp = requests.post(url, data=data, timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise MoodleError(f"No se pudo conectar a {base_url}: {e}")
    if resp.status_code != 200:
        raise MoodleError(f"Moodle devolvió HTTP {resp.status_code}")
    try:
        payload = resp.json()
    except ValueError:
        raise MoodleError("Respuesta no-JSON de Moodle (¿URL base correcta? ¿REST habilitado?)")
    if isinstance(payload, dict) and payload.get("exception"):
        raise MoodleError(f"{payload.get('errorcode')}: {payload.get('message')}")
    return payload


def probar_conexion(base_url: str, token: str) -> dict:
    """Valida token + permisos. Devuelve info del sitio y qué podremos hacer."""
    info = _rest(base_url, token, "core_webservice_get_site_info")
    fns = {f.get("name") for f in info.get("functions", [])}
    return {
        "ok": True,
        "sitio": info.get("sitename"),
        "version": info.get("release"),
        "usuario": info.get("username"),
        "puede_crear_cursos": "core_course_create_courses" in fns,
        "puede_subir_archivos": bool(info.get("usercanmanageownfiles", True)),
    }


def _slug_shortname(nombre: str, malla_id: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "-", nombre.lower()).strip("-")[:30]
    if not base:  # nombre no-ASCII (CJK/emoji) → base vacío colisionaría
        import hashlib
        base = "curso-" + hashlib.sha1(nombre.encode("utf-8")).hexdigest()[:8]
    return f"{base}-{malla_id[:6]}"


def publicar(base_url: str, token: str, curso_nombre: str, malla_id: str,
             scorm_zip: bytes, categoria_id: int = 1) -> dict:
    """Crea el curso en Moodle y sube el SCORM.zip al draft del usuario.

    Devuelve {curso_id, curso_url, archivo_subido, paso_manual}.
    Si el curso ya existe (shortname repetido), lo reutiliza.
    """
    shortname = _slug_shortname(curso_nombre, malla_id)

    # ¿Ya lo publicamos antes? Reutilizar el curso (idempotencia).
    existentes = _rest(base_url, token, "core_course_get_courses_by_field",
                       {"field": "shortname", "value": shortname})
    cursos = existentes.get("courses", []) if isinstance(existentes, dict) else []
    if cursos:
        curso_id = cursos[0]["id"]
        creado = False
    else:
        creados = _rest(base_url, token, "core_course_create_courses", {
            "courses[0][fullname]": curso_nombre,
            "courses[0][shortname]": shortname,
            "courses[0][categoryid]": categoria_id,
            "courses[0][summary]": "Curso generado por AI Learning Studio",
            "courses[0][summaryformat]": 1,
        })
        curso_id = creados[0]["id"]
        creado = True

    # Subir el zip al área de borradores del usuario del token.
    upload_url = f"{_safe_base(base_url)}/webservice/upload.php"
    try:
        resp = requests.post(
            upload_url,
            data={"token": token},
            files={"file_1": (f"{shortname}.zip", scorm_zip, "application/zip")},
            timeout=180,
        )
        up = resp.json()
    except (requests.RequestException, ValueError) as e:
        raise MoodleError(f"El curso se creó pero falló la subida del zip: {e}")
    # upload.php reporta errores como {'exception':...} o como {'error':...}.
    if isinstance(up, dict) and (up.get("exception") or up.get("error")):
        raise MoodleError(f"El curso se creó pero falló la subida: {up.get('message') or up.get('error')}")
    if not (isinstance(up, list) and up):
        raise MoodleError("El curso se creó pero la subida del zip no devolvió el archivo esperado")

    archivo = up[0] if isinstance(up, list) and up else {}
    curso_url = f"{base_url.rstrip('/')}/course/view.php?id={curso_id}"
    return {
        "ok": True,
        "curso_id": curso_id,
        "curso_creado": creado,
        "curso_url": curso_url,
        "archivo_subido": archivo.get("filename"),
        "paso_manual": (
            "En el curso: Activar edición → Añadir actividad o recurso → Paquete SCORM → "
            "en el selector de archivos elegí 'Archivos recientes' y seleccioná el zip subido."
        ),
    }
