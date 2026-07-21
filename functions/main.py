"""
Cloud Functions - Entry Point

Endpoints disponibles:
- POST /mallas - Crear malla
- GET /mallas/{id} - Obtener malla
- PUT /mallas/{id} - Iterar malla
- POST /mallas/{id}/guiones - Generar guiones
- POST /audio - Generar audio
- POST /video - Generar video
- GET /jobs/{id} - Estado de un job

Solicitudes Dashboard:
- POST /solicitudes - Crear solicitud
- GET /solicitudes - Listar solicitudes (filtros: status, area, asignado_a)
- GET /solicitudes/{id} - Obtener solicitud con comentarios
- PUT /solicitudes/{id} - Actualizar solicitud (status, asignado_a, prioridad)
- POST /solicitudes/{id}/comentarios - Agregar comentario
- GET /mis-solicitudes - Listar solicitudes por email del solicitante
"""
import json
import uuid
from datetime import datetime
from typing import Any

import firebase_admin
from firebase_admin import firestore, storage
from firebase_functions import https_fn, options, scheduler_fn
from firebase_functions.params import SecretParam
from google.cloud.firestore import SERVER_TIMESTAMP, DELETE_FIELD

# Secrets
OPENAI_API_KEY = SecretParam("OPENAI_API_KEY")
ELEVENLABS_API_KEY = SecretParam("ELEVENLABS_API_KEY")
HEYGEN_API_KEY = SecretParam("HEYGEN_API_KEY")
SENDGRID_API_KEY = SecretParam("SENDGRID_API_KEY")

from core.services.malla_service import generar_malla, iterar_malla
from core.services.guion_service import generar_guiones_batch
from core.generators.audio import generar_audio
from core.generators.video import crear_video_heygen, verificar_video_heygen
from core.generators.scorm import empaquetar_scorm, DEFAULT_SHELL, default_shell_for
from core import notifications
from core.auth import require_auth
from core.tenancy import (
    DEFAULT_COMPANY_ID,
    RequestContext,
    assign_user_company,
    get_company,
    owner_company_id,
)
from schemas import (
    SolicitudCreate, MallaIterar, AudioRequest, VideoRequest,
    SolicitudCreateRequest, SolicitudUpdateRequest, ComentarioCreate,
    SolicitudStatus, Prioridad
)

# Inicializar Firebase (lazy)
_app = None
_db = None
_bucket = None


def _ensure_app():
    """Inicialización thread-safe de la app default (concurrencia 80 en gen2:
    dos requests fríos simultáneos → el 2º initialize_app() tira ValueError)."""
    global _app
    if _app is None:
        try:
            _app = firebase_admin.get_app() if firebase_admin._apps else firebase_admin.initialize_app()
        except ValueError:
            _app = firebase_admin.get_app()
    return _app


def get_db():
    global _db
    _ensure_app()
    if _db is None:
        _db = firestore.client()
    return _db


def get_bucket():
    global _bucket
    _ensure_app()
    if _bucket is None:
        _bucket = storage.bucket("davivienda-elearning-assets")
    return _bucket

# Configuración CORS
cors_options = options.CorsOptions(
    cors_origins=["*"],
    cors_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)

# Opciones comunes para funciones (incluir secrets)
fn_options = options.HttpsOptions(
    cors=cors_options,
    secrets=[OPENAI_API_KEY, ELEVENLABS_API_KEY, HEYGEN_API_KEY],
)


def _response(data: Any, status: int = 200) -> https_fn.Response:
    """Helper para crear respuestas JSON."""
    return https_fn.Response(
        json.dumps(data, default=str, ensure_ascii=False),
        status=status,
        headers={"Content-Type": "application/json"}
    )


def _error(message: str, status: int = 400) -> https_fn.Response:
    """Helper para crear respuestas de error."""
    return _response({"error": message}, status)


def _tenant_mismatch(doc_data: dict | None, ctx: RequestContext) -> bool:
    """True si el doc pertenece a otra empresa (se responde 404, no 403, para
    no filtrar existencia). Docs legacy sin company_id = davivienda."""
    return owner_company_id(doc_data) != ctx.company_id


def _storage_prefix(ctx: RequestContext) -> str:
    """Prefijo de Storage por tenant. Davivienda mantiene las rutas legacy
    (audio/, video/, scorm/) para no romper URLs ya persistidas."""
    if ctx.company_id in (None, DEFAULT_COMPANY_ID):
        return ""
    return f"companies/{ctx.company_id}/"


def _strip_markdown_json(raw_text: str) -> str:
    """Limpia bloques markdown ```json ... ``` y deja solo JSON."""
    text = (raw_text or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


# ============== MALLAS ==============

@https_fn.on_request(
    cors=cors_options,
    secrets=[OPENAI_API_KEY]
)
@require_auth(roles={"learning"})
def crear_malla(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /mallas - Crear una nueva malla curricular."""
    if req.method != "POST":
        return _error("Method not allowed", 405)

    try:
        data = req.get_json()
        solicitud = SolicitudCreate(**data)
    except Exception as e:
        return _error(f"Invalid request: {e}")

    # Template validado por el humano (opcional): manda sobre el arquetipo legacy.
    from core import templates as templates_svc
    template_doc = None
    template_id = (data.get("template_id") or "").strip() if isinstance(data, dict) else ""
    if template_id:
        template_doc = templates_svc.get_template(get_db(), template_id, ctx.company_id)
        if not template_doc:
            return _error("Template not found", 404)

    # Cursos externos: Learning los habilita en esta fase (permitir_externos);
    # las recomendaciones del solicitante vienen del intake de la solicitud.
    permitir_externos = bool(data.get("permitir_externos"))
    cursos_externos = data.get("cursos_externos")
    if not isinstance(cursos_externos, list):
        cursos_externos = None

    # Generar malla con GPT-4
    malla, error = generar_malla(
        nombre=solicitud.nombre,
        course_type=solicitud.course_type,
        audiencia=solicitud.audiencia,
        nivel=solicitud.nivel,
        duracion_min=solicitud.duracion_min,
        objetivo=solicitud.objetivo,
        temas=solicitud.temas,
        requiere_eval=solicitud.requiere_eval,
        documentacion=solicitud.documentacion or "",
        empresa=ctx.company,
        template=templates_svc.template_for_prompt(template_doc) if template_doc else None,
        perfil=data.get("perfil_salida") if isinstance(data.get("perfil_salida"), dict) else None,
        permitir_externos=permitir_externos,
        cursos_externos=cursos_externos,
    )

    if error:
        return _error(f"Error generando malla: {error}", 500)

    # Calcular duración total
    duracion_total = sum(r.get("duracion_min", 0) for r in malla)

    # Guardar en Firestore
    doc_ref = get_db().collection("mallas").document()
    doc_data = {
        "company_id": ctx.company_id,
        "solicitud": solicitud.model_dump(),
        # Snapshot del template usado (para iterar con el mismo criterio).
        "template": (
            {"id": template_doc["id"], **templates_svc.template_for_prompt(template_doc)}
            if template_doc else None
        ),
        "version": 1,
        "malla": malla,
        "duracion_total": duracion_total,
        "historial": [{
            "version": 1,
            "feedback": "Generación inicial",
            "timestamp": datetime.utcnow().isoformat()
        }],
        "created_at": SERVER_TIMESTAMP,
        "updated_at": SERVER_TIMESTAMP,
    }
    doc_ref.set(doc_data)

    return _response({
        "id": doc_ref.id,
        "version": 1,
        "malla": malla,
        "duracion_total": duracion_total,
    }, 201)


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def obtener_malla(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET /mallas/{id} - Obtener una malla por ID."""
    if req.method != "GET":
        return _error("Method not allowed", 405)

    # Extraer ID (query param o path)
    malla_id = req.args.get("id")
    if not malla_id:
        path_parts = req.path.strip("/").split("/")
        if len(path_parts) >= 2:
            malla_id = path_parts[-1]

    if not malla_id:
        return _error("Missing malla ID")

    doc = get_db().collection("mallas").document(malla_id).get()

    if not doc.exists:
        return _error("Malla not found", 404)

    data = doc.to_dict()
    if _tenant_mismatch(data, ctx):
        return _error("Malla not found", 404)
    data["id"] = doc.id
    # Relación inversa malla→solicitud (para el stepper del proceso): una query
    # puntual por igualdad, sin depender del listado paginado.
    try:
        inv = list(get_db().collection("solicitudes").where("malla_id", "==", doc.id).limit(1).stream())
        if inv:
            data["solicitud_id"] = inv[0].id
    except Exception:
        pass
    return _response(data)


@https_fn.on_request(cors=cors_options, secrets=[OPENAI_API_KEY])
@require_auth(roles={"learning"})
def iterar_malla_endpoint(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """PUT /mallas/{id} - Iterar malla con feedback."""
    if req.method not in ["PUT", "POST"]:
        return _error("Method not allowed", 405)

    # Extraer ID (query param o path)
    malla_id = req.args.get("id")
    if not malla_id:
        path_parts = req.path.strip("/").split("/")
        if len(path_parts) >= 2:
            malla_id = path_parts[-1]

    if not malla_id:
        return _error("Missing malla ID")

    try:
        data = req.get_json()
        iterar_req = MallaIterar(**data)
    except Exception as e:
        return _error(f"Invalid request: {e}")

    # Obtener malla actual
    doc_ref = get_db().collection("mallas").document(malla_id)
    doc = doc_ref.get()

    if not doc.exists:
        return _error("Malla not found", 404)

    doc_data = doc.to_dict()
    if _tenant_mismatch(doc_data, ctx):
        return _error("Malla not found", 404)
    malla_actual = doc_data.get("malla", [])

    # Regenerar con feedback (con el mismo template con el que se generó, si hubo)
    nueva_malla, error = iterar_malla(
        malla_actual,
        iterar_req.feedback,
        course_type=doc_data.get("solicitud", {}).get("course_type", "compliance"),
        empresa=ctx.company,
        template=doc_data.get("template") or None,
    )

    if error:
        return _error(f"Error iterando malla: {error}", 500)

    # Actualizar versión
    nueva_version = doc_data.get("version", 1) + 1
    duracion_total = sum(r.get("duracion_min", 0) for r in nueva_malla)

    historial = doc_data.get("historial", [])
    historial.append({
        "version": nueva_version,
        "feedback": iterar_req.feedback,
        "timestamp": datetime.utcnow().isoformat()
    })

    doc_ref.update({
        "malla": nueva_malla,
        "version": nueva_version,
        "duracion_total": duracion_total,
        "historial": historial,
        "updated_at": SERVER_TIMESTAMP,
    })

    return _response({
        "id": malla_id,
        "version": nueva_version,
        "malla": nueva_malla,
        "duracion_total": duracion_total,
    })


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def guardar_guion(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """PUT /guion - Persistir el contenido de un guión (HTML editado por el agente,
    URLs de audio/video, etc.) dentro del array `guiones` de la malla.
    Body: { malla_id, guion_id, contenido: {...campos a mergear} }"""
    if req.method not in ["PUT", "POST"]:
        return _error("Method not allowed", 405)

    try:
        data = req.get_json()
        malla_id = data.get("malla_id")
        guion_id = data.get("guion_id")
        contenido = data.get("contenido") or {}
    except Exception as e:
        return _error(f"Invalid request: {e}")

    if not malla_id or guion_id is None:
        return _error("Faltan 'malla_id' / 'guion_id'")

    doc_ref = get_db().collection("mallas").document(malla_id)
    doc = doc_ref.get()
    if not doc.exists:
        return _error("Malla not found", 404)

    md = doc.to_dict()
    if _tenant_mismatch(md, ctx):
        return _error("Malla not found", 404)
    guiones = md.get("guiones", [])
    found = False
    for g in guiones:
        if g.get("id") == guion_id:
            g["contenido"] = {**(g.get("contenido") or {}), **contenido}
            found = True
            break
    if not found:
        return _error("Guion not found", 404)

    doc_ref.update({"guiones": guiones, "updated_at": SERVER_TIMESTAMP})
    return _response({"ok": True, "malla_id": malla_id, "guion_id": guion_id})


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def guardar_malla(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """PUT /mallas/{id} - Guardar la malla editada manualmente (sobreescribe el array)."""
    if req.method not in ["PUT", "POST"]:
        return _error("Method not allowed", 405)

    malla_id = req.args.get("id")
    if not malla_id:
        path_parts = req.path.strip("/").split("/")
        if len(path_parts) >= 2:
            malla_id = path_parts[-1]
    if not malla_id:
        return _error("Missing malla ID")

    try:
        data = req.get_json()
        nueva_malla = data.get("malla")
    except Exception as e:
        return _error(f"Invalid request: {e}")

    if not isinstance(nueva_malla, list):
        return _error("Falta 'malla' (lista de recursos)")

    doc_ref = get_db().collection("mallas").document(malla_id)
    doc = doc_ref.get()
    if not doc.exists:
        return _error("Malla not found", 404)
    if _tenant_mismatch(doc.to_dict(), ctx):
        return _error("Malla not found", 404)

    # Reindexar ids secuenciales y normalizar duracion_min a entero.
    for i, item in enumerate(nueva_malla):
        item["id"] = i + 1
        try:
            item["duracion_min"] = int(item.get("duracion_min", 0) or 0)
        except (ValueError, TypeError):
            item["duracion_min"] = 0

    duracion_total = sum(r.get("duracion_min", 0) for r in nueva_malla)
    doc_ref.update({
        "malla": nueva_malla,
        "duracion_total": duracion_total,
        "updated_at": SERVER_TIMESTAMP,
    })

    return _response({
        "id": malla_id,
        "malla": nueva_malla,
        "duracion_total": duracion_total,
        "message": "Malla guardada",
    })


@https_fn.on_request(
    cors=cors_options,
    secrets=[OPENAI_API_KEY],
    timeout_sec=540,
    memory=options.MemoryOption.GB_1,
)
@require_auth(roles={"learning"})
def generar_guiones_endpoint(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /mallas/{id}/guiones - Generar guiones para toda la malla."""
    if req.method != "POST":
        return _error("Method not allowed", 405)

    # Extraer ID (query param o path)
    malla_id = req.args.get("id")
    if not malla_id:
        path_parts = req.path.strip("/").split("/")
        if len(path_parts) >= 2:
            malla_id = path_parts[-2] if path_parts[-1] == "guiones" else path_parts[-1]

    if not malla_id:
        return _error("Missing malla ID")

    # Obtener malla
    doc = get_db().collection("mallas").document(malla_id).get()
    if not doc.exists:
        return _error("Malla not found", 404)

    doc_data = doc.to_dict()
    if _tenant_mismatch(doc_data, ctx):
        return _error("Malla not found", 404)
    malla = doc_data.get("malla", [])
    solicitud = doc_data.get("solicitud", {})

    # Generar guiones
    contexto = {
        "nombre": solicitud.get("nombre", ""),
        "course_type": solicitud.get("course_type", "compliance"),
        "audiencia": solicitud.get("audiencia", ""),
        "objetivo": solicitud.get("objetivo", ""),
    }

    guiones, errores = generar_guiones_batch(malla, contexto, empresa=ctx.company)

    # Guardar guiones
    get_db().collection("mallas").document(malla_id).update({
        "guiones": guiones,
        "updated_at": SERVER_TIMESTAMP,
    })

    return _response({
        "malla_id": malla_id,
        "guiones": guiones,
        "errores": errores if errores else None,
    })


# ============== ITERAR GUION ==============

@https_fn.on_request(cors=cors_options, secrets=[OPENAI_API_KEY])
@require_auth(roles={"learning"})
def iterar_guion_endpoint(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /guiones/iterar - Iterar un guión específico con feedback de IA."""
    if req.method != "POST":
        return _error("Method not allowed", 405)

    try:
        data = req.get_json() or {}
        malla_id = data.get("malla_id")
        guion_id = data.get("guion_id")
        feedback = data.get("feedback")
        tipo_recurso = data.get("tipo_recurso")
        contenido_actual = data.get("contenido_actual", {})
        modo = str(data.get("modo", "iterar") or "iterar").strip().lower()
    except Exception as e:
        return _error(f"Invalid request: {e}")

    if not feedback:
        return _error("Missing required field: feedback")

    # Llamar a OpenAI
    from openai import OpenAI
    from core.config import get_openai_key

    api_key = get_openai_key()
    if not api_key:
        return _error("Missing OPENAI_API_KEY", 500)

    client = OpenAI(api_key=api_key)

    # Modo de análisis: NO modifica contenido, solo interpreta intención.
    if modo == "analizar_intencion":
        analysis_prompt = f"""Analiza la intención del usuario para iterar contenido e-learning.

CONTEXTO:
- tipo_recurso: {tipo_recurso}
- contenido_actual (resumen JSON):
{json.dumps(contenido_actual, indent=2, ensure_ascii=False)[:5000]}

MENSAJE DEL USUARIO:
"{feedback}"

Responde SOLO JSON con esta estructura:
{{
  "accion": "agregar_slide|cambiar_formato|editar_contenido|editar_estilo|aclarar",
  "confianza": 0.0,
  "resumen_entendido": "qué entendiste en una frase",
  "propuesta": {{
    "tipo_slide": "detalle_profundo|caso_aplicado|checklist_accion|quiz_rapido|mitos_realidad|null",
    "tema": "tema principal o null",
    "formato_visual": "cards_grid|tabs_horizontal|roadmap_timeline|checklist_steps|matrix_2x2|null",
    "mantener_existente": true
  }},
  "pregunta_confirmacion": "pregunta corta para validar"
}}

Reglas:
- Si el usuario pide "agregar", "segunda slide", "sumar" => accion="agregar_slide".
- Si pide rediseño visual/formato => accion="cambiar_formato".
- Si pide color/fondo/paleta/branding visual => accion="editar_estilo" (NO cambiar_formato).
- Si pide cambio de texto puntual => accion="editar_contenido".
- Si es ambiguo => accion="aclarar" y confianza baja.
- No inventes datos; usa null si no está claro.
- El campo "mantener_existente" debe ser true cuando el mensaje sugiere sumar/añadir.
"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "Responde SOLO JSON válido. Sin markdown."},
                    {"role": "user", "content": analysis_prompt}
                ],
                temperature=0.1,
            )
            respuesta = _strip_markdown_json(response.choices[0].message.content)
            resultado = json.loads(respuesta)

            if not isinstance(resultado, dict):
                return _error("Intent analysis returned non-object JSON", 500)

            accion = str(resultado.get("accion", "editar_contenido")).strip().lower()
            if accion not in {"agregar_slide", "cambiar_formato", "editar_contenido", "editar_estilo", "aclarar"}:
                accion = "editar_contenido"

            try:
                confianza = float(resultado.get("confianza", 0.0))
            except Exception:
                confianza = 0.0
            confianza = max(0.0, min(1.0, confianza))

            propuesta = resultado.get("propuesta", {})
            if not isinstance(propuesta, dict):
                propuesta = {}

            return _response({
                "ok": True,
                "modo": "analizar_intencion",
                "accion": accion,
                "confianza": confianza,
                "resumen_entendido": str(resultado.get("resumen_entendido", "")).strip(),
                "propuesta": {
                    "tipo_slide": propuesta.get("tipo_slide"),
                    "tema": propuesta.get("tema"),
                    "formato_visual": propuesta.get("formato_visual"),
                    "mantener_existente": bool(propuesta.get("mantener_existente", False)),
                },
                "pregunta_confirmacion": str(resultado.get("pregunta_confirmacion", "")).strip(),
            })
        except json.JSONDecodeError as e:
            return _error(f"Error parsing AI intent response: {e}", 500)
        except Exception as e:
            return _error(f"Error calling OpenAI for intent analysis: {e}", 500)

    if not malla_id or guion_id is None:
        return _error("Missing required fields: malla_id, guion_id")

    # Obtener malla
    doc_ref = get_db().collection("mallas").document(malla_id)
    doc = doc_ref.get()

    if not doc.exists:
        return _error("Malla not found", 404)

    doc_data = doc.to_dict()
    if _tenant_mismatch(doc_data, ctx):
        return _error("Malla not found", 404)
    guiones = doc_data.get("guiones", [])

    # Encontrar el guión a iterar
    guion_index = None
    for i, g in enumerate(guiones):
        if g.get("id") == guion_id:
            guion_index = i
            break

    if guion_index is None:
        return _error("Guion not found", 404)

    # Check if content is already component-based
    is_component_mode = isinstance(contenido_actual.get("componentes"), list)

    # Estructura base según tipo de recurso
    ESTRUCTURAS_TIPO = {
        "Flashcards": {"titulo": "string", "items": [{"frente": "string", "reverso": "string"}]},
        "Quiz": {"titulo": "string", "preguntas": [{"pregunta": "string", "opciones": ["a","b","c","d"], "correcta": 0}]},
        "Infografía": {"titulo": "string", "secciones": [{"icono": "emoji", "titulo": "string", "descripcion": "string"}]},
        "Comparador": {"titulo": "string", "columnas": ["Col1", "Col2"], "filas": [{"aspecto": "string", "valores": ["v1", "v2"]}]},
        "Interactivo": {"titulo": "string", "elementos": [{"etiqueta": "string", "contenido_oculto": "string"}]},
        "Caso práctico": {"escenario": "string", "preguntas": [{"pregunta": "string", "opciones": ["a","b","c"], "correcta": 0, "feedback": "string"}]},
        "Manual": {"titulo": "string", "introduccion": "string", "secciones": [{"titulo": "string", "contenido": "string"}]},
        "Video externo": {"titulo": "string", "url": "https://...", "descripcion": "string"},
    }

    estructura_esperada = ESTRUCTURAS_TIPO.get(tipo_recurso, {})

    # Prompt claro y directo
    prompt = f"""Eres un editor de contenido e-learning. Tu trabajo es MODIFICAR TEXTO, nada más.

CONTENIDO ACTUAL:
{json.dumps(contenido_actual, indent=2, ensure_ascii=False)}

ESTRUCTURA ESPERADA para {tipo_recurso}:
{json.dumps(estructura_esperada, indent=2)}

PEDIDO DEL USUARIO: "{feedback}"

=== LO QUE PUEDES HACER ===
✓ Cambiar cualquier texto (títulos, descripciones, preguntas, respuestas)
✓ Agregar nuevos items/tarjetas/preguntas siguiendo la estructura
✓ Eliminar items existentes
✓ Cambiar emojis/iconos
✓ Reordenar elementos

=== LO QUE NO PUEDES HACER ===
✗ Agregar imágenes, logos o URLs de imágenes
✗ Cambiar posiciones (arriba, abajo, derecha, izquierda)
✗ Modificar colores o estilos
✗ Agregar campos que no existen en la estructura

=== RESPUESTA ===
Si PUEDES hacer el cambio:
{{"ok": true, "contenido": {{...el JSON actualizado...}}}}

Si NO PUEDES hacer el cambio:
{{"ok": false, "mensaje": "No puedo [explicación]. Pero sí puedo [alternativa]."}}

Responde SOLO con el JSON, sin texto adicional."""

    try:
        system_msg = "Responde SOLO con JSON válido. Sin markdown, sin explicaciones, sin ```."

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )

        respuesta = _strip_markdown_json(response.choices[0].message.content)

        resultado = json.loads(respuesta)

        # Nuevo formato: {"ok": true/false, "contenido": {...} o "mensaje": "..."}
        if isinstance(resultado, dict) and "ok" in resultado:
            if not resultado["ok"]:
                # La IA dice que no puede hacer el cambio
                return _response({
                    "guion_id": guion_id,
                    "contenido": contenido_actual,  # Devolver el original sin cambios
                    "no_puede": True,
                    "mensaje": resultado.get("mensaje", "No puedo hacer ese cambio.")
                })
            nuevo_contenido = resultado.get("contenido", resultado)
        else:
            # Formato antiguo: el JSON es directamente el contenido
            nuevo_contenido = resultado

    except json.JSONDecodeError as e:
        return _error(f"Error parsing AI response: {e}. Response was: {respuesta[:200]}", 500)
    except Exception as e:
        return _error(f"Error calling OpenAI: {e}", 500)

    # Actualizar el guión en la base de datos
    guiones[guion_index]["contenido"] = nuevo_contenido
    doc_ref.update({
        "guiones": guiones,
        "updated_at": SERVER_TIMESTAMP,
    })

    return _response({
        "guion_id": guion_id,
        "contenido": nuevo_contenido,
        "cambios": f"Contenido actualizado según: {feedback[:100]}..."
    })


# ============== AUDIO ==============

@https_fn.on_request(cors=cors_options, secrets=[ELEVENLABS_API_KEY])
@require_auth(roles={"learning"})
def generar_audio_endpoint(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /audio - Generar audio con ElevenLabs."""
    if req.method != "POST":
        return _error("Method not allowed", 405)

    try:
        data = req.get_json()
        audio_req = AudioRequest(**data)
    except Exception as e:
        return _error(f"Invalid request: {e}")

    # Voz: la del request si vino explícita; si no, la default de la empresa.
    voice_id = audio_req.voice_id
    if "voice_id" not in (data or {}):
        voice_id = ((ctx.company or {}).get("defaults") or {}).get("voice_id") or voice_id

    # Generar audio
    audio_bytes, error = generar_audio(
        texto=audio_req.texto,
        voice_id=voice_id,
        stability=audio_req.stability,
        similarity_boost=audio_req.similarity_boost,
        style=audio_req.style,
    )

    if error:
        return _error(f"Error generando audio: {error}", 500)

    # Subir a Cloud Storage
    job_id = str(uuid.uuid4())
    blob_path = f"{_storage_prefix(ctx)}audio/{job_id}.mp3"
    blob = get_bucket().blob(blob_path)
    blob.upload_from_string(audio_bytes, content_type="audio/mpeg")
    blob.make_public()

    # Guardar job
    get_db().collection("jobs").document(job_id).set({
        "company_id": ctx.company_id,
        "type": "audio",
        "status": "completed",
        "result_url": blob.public_url,
        "created_at": SERVER_TIMESTAMP,
        "updated_at": SERVER_TIMESTAMP,
    })

    return _response({
        "job_id": job_id,
        "status": "completed",
        "audio_url": blob.public_url,
    })


# ============== VIDEO ==============

@https_fn.on_request(cors=cors_options, secrets=[HEYGEN_API_KEY])
@require_auth(roles={"learning"})
def generar_video_endpoint(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /video - Iniciar generación de video con HeyGen."""
    if req.method != "POST":
        return _error("Method not allowed", 405)

    try:
        data = req.get_json()
        video_req = VideoRequest(**data)
    except Exception as e:
        return _error(f"Invalid request: {e}")

    # Avatar: el del request si vino explícito; si no, el default de la empresa.
    avatar_id = video_req.avatar_id
    if "avatar_id" not in (data or {}):
        avatar_id = ((ctx.company or {}).get("defaults") or {}).get("avatar_id") or avatar_id

    # Iniciar generación en HeyGen
    heygen_video_id, error = crear_video_heygen(
        audio_url=video_req.audio_url,
        avatar_id=avatar_id,
        dimension=video_req.dimension,
    )

    if error:
        return _error(f"Error iniciando video: {error}", 500)

    # Crear job para tracking
    job_id = str(uuid.uuid4())
    get_db().collection("jobs").document(job_id).set({
        "company_id": ctx.company_id,
        "type": "video",
        "status": "processing",
        "heygen_video_id": heygen_video_id,
        "created_at": SERVER_TIMESTAMP,
        "updated_at": SERVER_TIMESTAMP,
    })

    return _response({
        "job_id": job_id,
        "status": "processing",
        "message": "Video en proceso. Consulta GET /jobs/{job_id} para el estado.",
    }, 202)


@https_fn.on_request(cors=cors_options, secrets=[HEYGEN_API_KEY])
@require_auth(roles={"learning"})
def obtener_job(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET /jobs/{id} - Obtener estado de un job."""
    if req.method != "GET":
        return _error("Method not allowed", 405)

    # Extraer ID (query param o path)
    job_id = req.args.get("id")
    if not job_id:
        path_parts = req.path.strip("/").split("/")
        if len(path_parts) >= 2:
            job_id = path_parts[-1]

    if not job_id:
        return _error("Missing job ID")

    doc = get_db().collection("jobs").document(job_id).get()

    if not doc.exists:
        return _error("Job not found", 404)

    job_data = doc.to_dict()
    if _tenant_mismatch(job_data, ctx):
        return _error("Job not found", 404)

    # Si es video en proceso, verificar estado en HeyGen
    if job_data.get("type") == "video" and job_data.get("status") == "processing":
        heygen_id = job_data.get("heygen_video_id")
        if heygen_id:
            result = verificar_video_heygen(heygen_id)

            if result["status"] == "completed":
                # Descargar y subir a Storage
                import requests
                video_url = result.get("video_url")
                if video_url:
                    response = requests.get(video_url)
                    if response.status_code == 200:
                        blob_path = f"{_storage_prefix(ctx)}video/{job_id}.mp4"
                        blob = get_bucket().blob(blob_path)
                        blob.upload_from_string(response.content, content_type="video/mp4")
                        blob.make_public()

                        get_db().collection("jobs").document(job_id).update({
                            "status": "completed",
                            "result_url": blob.public_url,
                            "updated_at": SERVER_TIMESTAMP,
                        })

                        job_data["status"] = "completed"
                        job_data["result_url"] = blob.public_url

            elif result["status"] == "failed":
                get_db().collection("jobs").document(job_id).update({
                    "status": "failed",
                    "error": result.get("error"),
                    "updated_at": SERVER_TIMESTAMP,
                })
                job_data["status"] = "failed"
                job_data["error"] = result.get("error")

    job_data["job_id"] = job_id
    return _response(job_data)


# ============== SOLICITUDES ==============

@https_fn.on_request(cors=cors_options, secrets=[SENDGRID_API_KEY])
@require_auth(allow_unassigned=True)
def crear_solicitud(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /solicitudes - Crear una nueva solicitud de curso."""
    if req.method != "POST":
        return _error("Method not allowed", 405)

    try:
        data = req.get_json()
        solicitud_req = SolicitudCreateRequest(**data)
    except Exception as e:
        return _error(f"Invalid request: {e}")

    # Resolver empresa: la del usuario, o (externos sin empresa aún) la del body.
    company_id = ctx.company_id
    company = ctx.company
    if not company_id:
        company_id = (data.get("company_id") or DEFAULT_COMPANY_ID).strip()
        company = get_company(company_id)
        if not company or not company.get("activo", True):
            return _error("Empresa inválida", 400)
        # Persistir el mapeo para requests futuros (mis-solicitudes, comentarios).
        if ctx.uid:
            assign_user_company(ctx.uid, ctx.email, company_id)

    curso_dict = solicitud_req.curso.model_dump()

    # Intake asistido (preguntas de clarificación + documentos): se guarda tal
    # cual, y su contenido se COMPILA en curso.documentacion para que la
    # generación de malla/perfil lo consuma sin cambios.
    intake = data.get("intake") if isinstance(data.get("intake"), dict) else None
    if intake:
        partes = []
        for c in intake.get("clarificaciones") or []:
            if c.get("pregunta") and c.get("respuesta"):
                partes.append(f"P: {c['pregunta']}\nR: {c['respuesta']}")
        contexto_qa = ("CONTEXTO DE CLARIFICACIÓN:\n" + "\n\n".join(partes)) if partes else ""
        docs_txt = []
        for d in intake.get("documentos") or []:
            titulo = (d.get("titulo") or "").strip()
            contenido = (d.get("contenido") or "").strip()
            if titulo and contenido:
                docs_txt.append(f"### {titulo}\n{contenido}")
            elif titulo and d.get("adjunto_url"):
                docs_txt.append(f"### {titulo}\n(archivo adjunto: {d.get('adjunto_nombre') or d['adjunto_url']})")
        docs_seccion = ("DOCUMENTOS DE REFERENCIA:\n\n" + "\n\n".join(docs_txt)) if docs_txt else ""
        compilado = "\n\n".join(p for p in [contexto_qa, docs_seccion] if p)
        if compilado:
            base = (curso_dict.get("documentacion") or "").strip()
            curso_dict["documentacion"] = (base + "\n\n" + compilado).strip() if base else compilado

    # Crear documento en Firestore
    doc_ref = get_db().collection("solicitudes").document()
    doc_data = {
        "company_id": company_id,
        "solicitante": solicitud_req.solicitante.model_dump(),
        "curso": curso_dict,
        "intake": intake,
        "status": SolicitudStatus.PENDIENTE.value,
        "asignado_a": None,
        "prioridad": solicitud_req.prioridad.value,
        "malla_id": None,
        "created_at": SERVER_TIMESTAMP,
        "updated_at": SERVER_TIMESTAMP,
    }
    doc_ref.set(doc_data)

    # Notificar al equipo Learning (best-effort)
    notifications.notify_nueva_solicitud(
        doc_ref.id,
        solicitud_req.curso.nombre,
        solicitud_req.solicitante.nombre,
        solicitud_req.solicitante.area,
        company=company,
    )

    return _response({
        "id": doc_ref.id,
        "status": SolicitudStatus.PENDIENTE.value,
        "message": "Solicitud creada exitosamente",
    }, 201)


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def listar_solicitudes(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET /solicitudes - Listar solicitudes con filtros opcionales."""
    if req.method != "GET":
        return _error("Method not allowed", 405)

    # Filtros desde query params
    status_filter = req.args.get("status")
    area_filter = req.args.get("area")
    asignado_filter = req.args.get("asignado_a")

    # Filtrar por empresa PRIMERO (si no, con >200 solicitudes recientes de otro
    # tenant, esta empresa vería su lista vacía). Se ordena en memoria para no
    # depender de un índice compuesto (patrón del repo).
    query = get_db().collection("solicitudes").where("company_id", "==", ctx.company_id)

    docs = list(query.stream())
    docs.sort(
        key=lambda d: (d.to_dict().get("created_at").timestamp()
                       if d.to_dict().get("created_at") else 0.0),
        reverse=True,
    )

    solicitudes = []
    limit = int(req.args.get("limit", 50))

    for doc in docs:
        data = doc.to_dict()

        # Filtros en memoria para evitar problemas de índices compuestos
        if _tenant_mismatch(data, ctx):
            continue
        if status_filter and data.get("status") != status_filter:
            continue
        if asignado_filter and data.get("asignado_a") != asignado_filter:
            continue
        if area_filter:
            solicitante_area = data.get("solicitante", {}).get("area", "")
            if area_filter.lower() not in solicitante_area.lower():
                continue

        # Obtener último comentario (subcolección)
        comentarios_ref = get_db().collection("solicitudes").document(doc.id).collection("comentarios")
        ultimo_comentario = None
        ultimo_comentario_docs = comentarios_ref.order_by("created_at", direction=firestore.Query.DESCENDING).limit(1).stream()
        for c in ultimo_comentario_docs:
            ultimo_comentario = c.to_dict().get("texto", "")[:100]

        solicitudes.append({
            "id": doc.id,
            "curso_nombre": data.get("curso", {}).get("nombre", "Sin nombre"),
            "area": data.get("solicitante", {}).get("area", ""),
            "solicitante_nombre": data.get("solicitante", {}).get("nombre", ""),
            "solicitante_email": data.get("solicitante", {}).get("email", ""),
            "status": data.get("status", "pendiente"),
            "prioridad": data.get("prioridad", "media"),
            "asignado_a": data.get("asignado_a"),
            "malla_id": data.get("malla_id"),
            "created_at": data.get("created_at"),
            "ultimo_comentario": ultimo_comentario,
            # Estado del perfil (para filtros/badges del proceso, sin traer todo el doc).
            "perfil_status": (data.get("perfil_salida") or {}).get("status"),
        })

        # Aplicar límite después de filtrar
        if len(solicitudes) >= limit:
            break

    return _response({
        "solicitudes": solicitudes,
        "total": len(solicitudes),
    })


@https_fn.on_request(cors=cors_options)
@require_auth(allow_unassigned=True)
def obtener_solicitud(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET /solicitudes/{id} - Obtener una solicitud con sus comentarios."""
    if req.method != "GET":
        return _error("Method not allowed", 405)

    # Extraer ID
    solicitud_id = req.args.get("id")
    if not solicitud_id:
        path_parts = req.path.strip("/").split("/")
        if len(path_parts) >= 2:
            solicitud_id = path_parts[-1]

    if not solicitud_id:
        return _error("Missing solicitud ID")

    doc = get_db().collection("solicitudes").document(solicitud_id).get()

    if not doc.exists:
        return _error("Solicitud not found", 404)

    data = doc.to_dict()
    # Ownership primero: el dueño (email del solicitante) siempre puede ver la
    # suya, aunque no tenga empresa mapeada (gmail). Learning ve las de su tenant.
    es_dueno = bool(ctx.email) and (data.get("solicitante", {}).get("email") or "").lower() == ctx.email
    if not es_dueno and _tenant_mismatch(data, ctx):
        return _error("Solicitud not found", 404)
    if ctx.rol == "solicitante" and not es_dueno:
        return _error("Solicitud not found", 404)
    data["id"] = doc.id

    # Obtener comentarios
    comentarios_ref = get_db().collection("solicitudes").document(solicitud_id).collection("comentarios")
    comentarios_docs = comentarios_ref.order_by("created_at").stream()

    comentarios = []
    for c in comentarios_docs:
        c_data = c.to_dict()
        c_data["id"] = c.id
        comentarios.append(c_data)

    data["comentarios"] = comentarios

    return _response(data)


@https_fn.on_request(cors=cors_options, secrets=[SENDGRID_API_KEY])
@require_auth(roles={"learning"})
def actualizar_solicitud(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """PUT /solicitudes/{id} - Actualizar estado, asignación o prioridad."""
    if req.method not in ["PUT", "POST"]:
        return _error("Method not allowed", 405)

    # Extraer ID
    solicitud_id = req.args.get("id")
    if not solicitud_id:
        path_parts = req.path.strip("/").split("/")
        if len(path_parts) >= 2:
            solicitud_id = path_parts[-1]

    if not solicitud_id:
        return _error("Missing solicitud ID")

    try:
        data = req.get_json()
        update_req = SolicitudUpdateRequest(**data)
    except Exception as e:
        return _error(f"Invalid request: {e}")

    # Verificar que existe
    doc_ref = get_db().collection("solicitudes").document(solicitud_id)
    doc = doc_ref.get()

    if not doc.exists:
        return _error("Solicitud not found", 404)

    prev = doc.to_dict() or {}
    if _tenant_mismatch(prev, ctx):
        return _error("Solicitud not found", 404)
    curso_nombre = prev.get("curso", {}).get("nombre", "tu curso")
    solicitante_email = prev.get("solicitante", {}).get("email", "")

    # Construir actualización
    update_data = {"updated_at": SERVER_TIMESTAMP}

    if update_req.status is not None:
        update_data["status"] = update_req.status.value
    if update_req.asignado_a is not None:
        update_data["asignado_a"] = update_req.asignado_a
    if update_req.prioridad is not None:
        update_data["prioridad"] = update_req.prioridad.value
    if update_req.malla_id is not None:
        update_data["malla_id"] = update_req.malla_id

    doc_ref.update(update_data)

    # Notificaciones (best-effort)
    if update_req.status is not None and update_req.status.value != prev.get("status") and solicitante_email:
        notifications.notify_cambio_estado(solicitante_email, solicitud_id, curso_nombre, update_req.status.value, company=ctx.company)
    if update_req.asignado_a and update_req.asignado_a != prev.get("asignado_a"):
        notifications.notify_asignacion(update_req.asignado_a, solicitud_id, curso_nombre, company=ctx.company)

    return _response({
        "id": solicitud_id,
        "updated": list(update_data.keys()),
        "message": "Solicitud actualizada",
    })


@https_fn.on_request(cors=cors_options, secrets=[SENDGRID_API_KEY])
@require_auth(allow_unassigned=True)
def agregar_comentario(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /solicitudes/{id}/comentarios - Agregar un comentario a una solicitud."""
    if req.method != "POST":
        return _error("Method not allowed", 405)

    # Extraer ID de solicitud
    solicitud_id = req.args.get("id")
    if not solicitud_id:
        path_parts = req.path.strip("/").split("/")
        # Buscar el ID antes de "comentarios"
        for i, part in enumerate(path_parts):
            if part == "comentarios" and i > 0:
                solicitud_id = path_parts[i - 1]
                break
        if not solicitud_id and len(path_parts) >= 2:
            solicitud_id = path_parts[-2] if path_parts[-1] == "comentarios" else path_parts[-1]

    if not solicitud_id:
        return _error("Missing solicitud ID")

    try:
        data = req.get_json()
        comentario_req = ComentarioCreate(**data)
        autor_data = data.get("autor", {})
    except Exception as e:
        return _error(f"Invalid request: {e}")

    # Verificar que la solicitud existe
    doc = get_db().collection("solicitudes").document(solicitud_id).get()
    if not doc.exists:
        return _error("Solicitud not found", 404)
    _sol_data = doc.to_dict() or {}
    _es_dueno = bool(ctx.email) and (_sol_data.get("solicitante", {}).get("email") or "").lower() == ctx.email
    if not _es_dueno and _tenant_mismatch(_sol_data, ctx):
        return _error("Solicitud not found", 404)
    if ctx.rol == "solicitante" and not _es_dueno:
        return _error("Solicitud not found", 404)

    # Crear comentario en subcolección
    comentario_ref = get_db().collection("solicitudes").document(solicitud_id).collection("comentarios").document()
    comentario_data = {
        "autor": autor_data,
        "texto": comentario_req.texto,
        "created_at": SERVER_TIMESTAMP,
    }
    comentario_ref.set(comentario_data)

    # Actualizar timestamp de la solicitud
    get_db().collection("solicitudes").document(solicitud_id).update({
        "updated_at": SERVER_TIMESTAMP,
    })

    # Notificar a los mencionados (@) — best-effort
    menciones = data.get("menciones") or []
    if isinstance(menciones, list) and menciones:
        sol = doc.to_dict() or {}
        autor_nombre = autor_data.get("nombre") or autor_data.get("email") or "Alguien"
        curso_nombre = sol.get("curso", {}).get("nombre", "una solicitud")
        notifications.notify_mencion(
            [str(m) for m in menciones if m],
            autor_nombre, solicitud_id, curso_nombre, comentario_req.texto,
            company=ctx.company,
        )

    return _response({
        "id": comentario_ref.id,
        "solicitud_id": solicitud_id,
        "message": "Comentario agregado",
    }, 201)


@https_fn.on_request(cors=cors_options)
@require_auth(allow_unassigned=True)
def mis_solicitudes(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET /mis-solicitudes - Listar solicitudes del solicitante autenticado."""
    if req.method != "GET":
        return _error("Method not allowed", 405)

    # El email sale del token; el query param queda solo como fallback del
    # modo suave (requests legacy sin token).
    email = ctx.email or req.args.get("email")
    if not email:
        return _error("Missing email parameter")

    # Query por email del solicitante. Solo filtro por igualdad (índice de campo
    # automático); el orden por created_at se hace en memoria para no depender de
    # un índice compuesto (mismo criterio que listar_solicitudes).
    query = get_db().collection("solicitudes").where("solicitante.email", "==", email)

    docs = list(query.stream())
    docs.sort(
        key=lambda d: (d.to_dict().get("created_at").timestamp()
                       if d.to_dict().get("created_at") else 0.0),
        reverse=True,
    )

    solicitudes = []
    for doc in docs:
        data = doc.to_dict()

        # Obtener último comentario
        comentarios_ref = get_db().collection("solicitudes").document(doc.id).collection("comentarios")
        ultimo_comentario = None
        ultimo_comentario_rol = None
        ultimo_comentario_docs = comentarios_ref.order_by("created_at", direction=firestore.Query.DESCENDING).limit(1).stream()
        for c in ultimo_comentario_docs:
            c_data = c.to_dict()
            ultimo_comentario = c_data.get("texto", "")[:100]
            ultimo_comentario_rol = c_data.get("autor", {}).get("rol", "")

        solicitudes.append({
            "id": doc.id,
            "curso_nombre": data.get("curso", {}).get("nombre", "Sin nombre"),
            "status": data.get("status", "pendiente"),
            "prioridad": data.get("prioridad", "media"),
            "created_at": data.get("created_at"),
            "updated_at": data.get("updated_at"),
            "ultimo_comentario": ultimo_comentario,
            "ultimo_comentario_rol": ultimo_comentario_rol,
            # Para el badge "Perfil para validar" en Mis Solicitudes.
            "perfil_status": (data.get("perfil_salida") or {}).get("status"),
        })

    return _response({
        "solicitudes": solicitudes,
        "total": len(solicitudes),
        "email": email,
    })


# ============== USUARIOS ==============

@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def listar_usuarios(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET /usuarios - Lista usuarios de Firebase Auth de la empresa del caller
    (para autocompletar @menciones)."""
    if req.method != "GET":
        return _error("Method not allowed", 405)

    get_db()  # asegura firebase_admin.initialize_app()

    # Solo usuarios con dominio de la empresa (no exponer usuarios de otros tenants).
    dominios = {d.lower() for d in ((ctx.company or {}).get("dominios") or [])}
    # Fail-closed: sin dominios configurados NO devolvemos todos los usuarios de
    # Firebase Auth (sería una fuga cross-tenant). Solo el propio usuario.
    if not dominios:
        me = {"uid": ctx.uid, "email": ctx.email, "nombre": (ctx.email or "").split("@")[0], "photo_url": None} if ctx.email else None
        return _response({"usuarios": [me] if me else [], "total": 1 if me else 0})

    from firebase_admin import auth as fb_auth
    usuarios = []
    try:
        for u in fb_auth.list_users().iterate_all():
            if not u.email:
                continue
            if u.email.split("@")[-1].lower() not in dominios:
                continue
            usuarios.append({
                "uid": u.uid,
                "email": u.email,
                "nombre": u.display_name or u.email.split("@")[0],
                "photo_url": u.photo_url,
            })
    except Exception as e:
        return _error(f"Error listando usuarios: {e}", 500)

    return _response({"usuarios": usuarios, "total": len(usuarios)})


# ============== SOLICITANTES (alta por el equipo Learning) ==============

_EMAIL_RE = None


def _valid_email(e: str) -> bool:
    global _EMAIL_RE
    if _EMAIL_RE is None:
        import re as _re
        _EMAIL_RE = _re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    return bool(_EMAIL_RE.match(e or ""))


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def listar_solicitantes(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET /solicitantes - Solicitantes dados de alta (invitados) por la empresa."""
    if req.method != "GET":
        return _error("Method not allowed", 405)
    items = []
    try:
        for snap in get_db().collection("invitaciones").where("company_id", "==", ctx.company_id).stream():
            d = snap.to_dict() or {}
            items.append({
                "email": snap.id,
                "nombre": d.get("nombre") or snap.id.split("@")[0],
                "activo": d.get("activo", True),
                "invitado_por": d.get("invitado_por"),
                "created_at": d.get("created_at"),
            })
    except Exception as e:
        return _error(f"Error listando solicitantes: {e}", 500)
    items.sort(key=lambda x: (x.get("nombre") or "").lower())
    return _response({"solicitantes": items, "total": len(items)})


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def invitar_solicitante(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /solicitantes - Da de alta un solicitante por email.
    Body: { email, nombre? }"""
    if req.method != "POST":
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
        email = str(data.get("email") or "").strip().lower()
        nombre = str(data.get("nombre") or "").strip()
    except Exception as e:
        return _error(f"Invalid request: {e}")
    if not _valid_email(email):
        return _error("Email inválido")

    # Si el dominio ya pertenece a una empresa, esa persona ya es miembro por
    # dominio (no hace falta invitarla, o pertenece a OTRA empresa).
    from core.tenancy import resolve_company_by_domain
    dom_cid, _ = resolve_company_by_domain(email.split("@")[-1])
    if dom_cid and dom_cid != ctx.company_id:
        return _error(f"Ese dominio pertenece a la empresa '{dom_cid}' — no se puede invitar acá", 409)
    if dom_cid == ctx.company_id:
        return _error("Ese email ya pertenece a tu empresa por su dominio (no hace falta invitarlo)", 409)

    # ¿Ya invitado en OTRA empresa?
    ref = get_db().collection("invitaciones").document(email)
    existing = ref.get()
    if existing.exists and (existing.to_dict() or {}).get("company_id") != ctx.company_id:
        return _error("Ese email ya fue dado de alta en otra empresa", 409)

    ref.set({
        "company_id": ctx.company_id,
        "nombre": nombre or None,
        "rol": "solicitante",
        "activo": True,
        "invitado_por": ctx.email or None,
        "created_at": SERVER_TIMESTAMP,
        "updated_at": SERVER_TIMESTAMP,
    }, merge=True)
    return _response({"ok": True, "email": email}, 201)


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def eliminar_solicitante(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /solicitantes/eliminar - Da de baja un solicitante (revoca acceso).
    Body: { email }"""
    if req.method not in ["POST", "DELETE"]:
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
        email = str(data.get("email") or "").strip().lower()
    except Exception as e:
        return _error(f"Invalid request: {e}")
    if not email:
        return _error("Falta 'email'")

    ref = get_db().collection("invitaciones").document(email)
    snap = ref.get()
    if not snap.exists or (snap.to_dict() or {}).get("company_id") != ctx.company_id:
        return _error("Solicitante no encontrado", 404)
    ref.delete()
    # Limpiar el mapeo persistido users/{uid} para revocar acceso ya activo.
    try:
        for u in get_db().collection("users").where("email", "==", email).stream():
            if (u.to_dict() or {}).get("company_id") == ctx.company_id:
                u.reference.delete()
    except Exception:
        pass
    return _response({"ok": True, "email": email})


# ============== SCORM SHELL (plantilla del paquete) ==============

@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def scorm_shell(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET → {default, global}. PUT {scope:'global'|'course', shell_html, malla_id?} → guarda.
    Permite editar la plantilla (envoltorio) del paquete SCORM. El scope "global"
    es por empresa (companies/{id}.scorm.shell_html); config/scorm queda como
    fallback legacy de solo lectura para davivienda."""
    if req.method == "GET":
        company_shell = ((ctx.company or {}).get("scorm") or {}).get("shell_html", "") or ""
        if not company_shell and ctx.company_id == DEFAULT_COMPANY_ID:
            doc = get_db().collection("config").document("scorm").get()
            company_shell = (doc.to_dict() or {}).get("shell_html", "") if doc.exists else ""
        return _response({"default": default_shell_for(ctx.company), "global": company_shell})

    if req.method in ["PUT", "POST"]:
        try:
            data = req.get_json()
            scope = data.get("scope")
            shell_html = data.get("shell_html") or ""
        except Exception as e:
            return _error(f"Invalid request: {e}")

        if scope == "global":
            get_db().collection("companies").document(ctx.company_id).set(
                {"scorm": {"shell_html": shell_html}, "updated_at": SERVER_TIMESTAMP},
                merge=True,
            )
            # Compat: davivienda también actualiza el doc legacy que otras
            # instancias todavía puedan leer.
            if ctx.company_id == DEFAULT_COMPANY_ID:
                get_db().collection("config").document("scorm").set(
                    {"shell_html": shell_html, "updated_at": SERVER_TIMESTAMP}, merge=True
                )
            return _response({"ok": True, "scope": "global"})
        if scope == "course":
            malla_id = data.get("malla_id")
            if not malla_id:
                return _error("Falta 'malla_id'")
            ref = get_db().collection("mallas").document(malla_id)
            snap = ref.get()
            if not snap.exists:
                return _error("Malla not found", 404)
            if _tenant_mismatch(snap.to_dict(), ctx):
                return _error("Malla not found", 404)
            ref.update({"scorm_shell_html": shell_html, "updated_at": SERVER_TIMESTAMP})
            return _response({"ok": True, "scope": "course", "malla_id": malla_id})
        return _error("scope inválido (global|course)")

    return _error("Method not allowed", 405)


# ============== SCORM ==============

@https_fn.on_request(
    cors=cors_options,
    memory=options.MemoryOption.GB_1,
    timeout_sec=540,
)
@require_auth(roles={"learning"})
def empaquetar_scorm_endpoint(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /scorm - Empaqueta el curso en un SCORM 1.2 (single-SCO) y lo sube a Storage.

    Body: { malla_id, curso_nombre, passing_score, recursos: [{id, orden, titulo,
            bloque, tipo, html?, video_url?, assets?}] }
    Devuelve: { ok, download_url, size, recursos }
    """
    if req.method != "POST":
        return _error("Method not allowed", 405)

    try:
        payload = req.get_json()
    except Exception as e:
        return _error(f"Invalid request: {e}")

    if not payload or not payload.get("recursos"):
        return _error("Falta 'recursos'")

    # Resolución de shell por tenant: payload (lo manda el frontend) →
    # malla.scorm_shell_html → company.scorm.shell_html → (davivienda: legacy
    # config/scorm) → default brandeado. Nunca heredar el shell de otra empresa.
    if not payload.get("shell_html"):
        shell = ""
        malla_id_payload = payload.get("malla_id")
        if malla_id_payload:
            snap = get_db().collection("mallas").document(malla_id_payload).get()
            if snap.exists:
                md = snap.to_dict() or {}
                if _tenant_mismatch(md, ctx):
                    return _error("Malla not found", 404)
                shell = md.get("scorm_shell_html", "") or ""
        if not shell:
            shell = ((ctx.company or {}).get("scorm") or {}).get("shell_html", "") or ""
        if not shell and ctx.company_id == DEFAULT_COMPANY_ID:
            doc = get_db().collection("config").document("scorm").get()
            shell = (doc.to_dict() or {}).get("shell_html", "") if doc.exists else ""
        payload["shell_html"] = shell or default_shell_for(ctx.company)

    try:
        zip_bytes = empaquetar_scorm(payload, company=ctx.company)
    except Exception as e:
        return _error(f"Error empaquetando SCORM: {e}", 500)

    malla_id = payload.get("malla_id") or "curso"
    blob_path = f"{_storage_prefix(ctx)}scorm/{malla_id}/SCORM.zip"
    blob = get_bucket().blob(blob_path)
    blob.upload_from_string(zip_bytes, content_type="application/zip")
    blob.make_public()

    # Persistir la URL del paquete en la malla: la página LMS la usa para
    # ofrecer la descarga sin re-empaquetar. Best-effort.
    if payload.get("malla_id"):
        try:
            ref = get_db().collection("mallas").document(payload["malla_id"])
            snap = ref.get()
            if snap.exists and not _tenant_mismatch(snap.to_dict(), ctx):
                ref.update({
                    "scorm_url": blob.public_url,
                    "scorm_size": len(zip_bytes),
                    "scorm_updated_at": SERVER_TIMESTAMP,
                    "updated_at": SERVER_TIMESTAMP,
                })
        except Exception:
            pass

    return _response({
        "ok": True,
        "download_url": blob.public_url,
        "size": len(zip_bytes),
        "recursos": len(payload.get("recursos", [])),
    })


# ============== PERFIL DE SALIDA (paso previo a la malla) ==============

@https_fn.on_request(cors=cors_options, secrets=[OPENAI_API_KEY])
@require_auth(roles={"learning"})
def generar_perfil_endpoint(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /perfil/generar - Genera (o itera con feedback) el perfil de salida
    de una solicitud. Body: { solicitud_id, feedback? }"""
    if req.method != "POST":
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
        solicitud_id = str(data.get("solicitud_id") or "").strip()
        feedback = str(data.get("feedback") or "").strip() or None
    except Exception as e:
        return _error(f"Invalid request: {e}")
    if not solicitud_id:
        return _error("Falta 'solicitud_id'")

    ref = get_db().collection("solicitudes").document(solicitud_id)
    snap = ref.get()
    if not snap.exists:
        return _error("Solicitud not found", 404)
    sol = snap.to_dict() or {}
    if _tenant_mismatch(sol, ctx):
        return _error("Solicitud not found", 404)

    # No regenerar un perfil ya aprobado o cuya malla ya se generó (perdería la
    # aprobación en silencio). El usuario debe hacerlo explícito si quiere.
    prev = sol.get("perfil_salida") or {}
    if prev.get("status") == "aprobado" and not data.get("forzar"):
        return _error("El perfil ya fue aprobado. Regenerarlo descarta la aprobación (mandá forzar=true).", 409)
    if sol.get("malla_id") and not data.get("forzar"):
        return _error("La malla ya fue generada a partir de este perfil (mandá forzar=true para rehacerlo).", 409)

    from core.services.perfil_service import generar_perfil
    actual = prev.get("contenido") if feedback else None
    perfil, error = generar_perfil(
        sol.get("curso") or {}, empresa=ctx.company,
        perfil_actual=actual, feedback=feedback,
    )
    if error:
        return _error(f"Error generando perfil: {error}", 500)

    perfil_doc = {
        "contenido": perfil,
        "status": "borrador",
        "version": int(prev.get("version") or 0) + 1,
        "validacion_feedback": prev.get("validacion_feedback"),
        "updated_at": datetime.utcnow().isoformat(),
    }
    ref.update({"perfil_salida": perfil_doc, "updated_at": SERVER_TIMESTAMP})
    return _response({"solicitud_id": solicitud_id, "perfil_salida": perfil_doc})


@https_fn.on_request(cors=cors_options, secrets=[SENDGRID_API_KEY])
@require_auth(roles={"learning"})
def guardar_perfil(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """PUT /perfil - Guarda ediciones manuales del perfil y/o lo envía a
    validación del área. Body: { solicitud_id, contenido?, accion?: "enviar_validacion" }"""
    if req.method not in ["PUT", "POST"]:
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
        solicitud_id = str(data.get("solicitud_id") or "").strip()
        contenido = data.get("contenido")
        accion = str(data.get("accion") or "").strip()
    except Exception as e:
        return _error(f"Invalid request: {e}")
    if not solicitud_id:
        return _error("Falta 'solicitud_id'")

    ref = get_db().collection("solicitudes").document(solicitud_id)
    snap = ref.get()
    if not snap.exists:
        return _error("Solicitud not found", 404)
    sol = snap.to_dict() or {}
    if _tenant_mismatch(sol, ctx):
        return _error("Solicitud not found", 404)

    perfil = sol.get("perfil_salida") or {}
    if contenido is not None:
        if not isinstance(contenido, dict) or not contenido.get("temario"):
            return _error("'contenido' inválido (falta temario)")
        perfil["contenido"] = contenido
    if not perfil.get("contenido"):
        return _error("La solicitud no tiene perfil generado", 400)

    if accion == "enviar_validacion":
        perfil["status"] = "en_validacion"
        perfil["enviado_at"] = datetime.utcnow().isoformat()
    elif "status" not in perfil:
        perfil["status"] = "borrador"
    perfil["updated_at"] = datetime.utcnow().isoformat()

    ref.update({"perfil_salida": perfil, "updated_at": SERVER_TIMESTAMP})

    if accion == "enviar_validacion":
        email = (sol.get("solicitante") or {}).get("email")
        curso = (sol.get("curso") or {}).get("nombre", "tu curso")
        if email:
            notifications.notify_perfil_en_validacion(email, solicitud_id, curso, company=ctx.company)

    return _response({"ok": True, "perfil_salida": perfil})


@https_fn.on_request(cors=cors_options, secrets=[SENDGRID_API_KEY])
@require_auth(allow_unassigned=True)
def validar_perfil(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /perfil/validar - El área solicitante aprueba o pide cambios.
    Body: { solicitud_id, decision: "aprobar"|"cambios", feedback? }"""
    if req.method != "POST":
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
        solicitud_id = str(data.get("solicitud_id") or "").strip()
        decision = str(data.get("decision") or "").strip().lower()
        feedback = str(data.get("feedback") or "").strip() or None
        # Versión que el validador está viendo (para no aprobar una vieja).
        expected_version = data.get("version")
    except Exception as e:
        return _error(f"Invalid request: {e}")
    if not solicitud_id or decision not in ("aprobar", "cambios"):
        return _error("Faltan 'solicitud_id' / 'decision' (aprobar|cambios)")
    if decision == "cambios" and not feedback:
        return _error("Contanos qué cambios necesita el perfil (feedback)")

    ref = get_db().collection("solicitudes").document(solicitud_id)
    snap = ref.get()
    if not snap.exists:
        return _error("Solicitud not found", 404)
    sol = snap.to_dict() or {}
    # Ownership primero (mismo criterio que obtener_solicitud): el dueño valida
    # aunque no tenga empresa mapeada; Learning valida las de su tenant.
    es_dueno = bool(ctx.email) and (sol.get("solicitante", {}).get("email") or "").lower() == ctx.email
    if not es_dueno and _tenant_mismatch(sol, ctx):
        return _error("Solicitud not found", 404)
    if ctx.rol == "solicitante" and not es_dueno:
        return _error("Solicitud not found", 404)

    if not (sol.get("perfil_salida") or {}).get("contenido"):
        return _error("La solicitud no tiene perfil para validar", 400)

    # Escritura transaccional con chequeo de versión: si Learning regeneró
    # (version++) entre que el validador cargó la pantalla y decidió, se rechaza
    # para no aprobar/pisar una versión que ya no existe.
    db = get_db()
    transaction = db.transaction()

    @firestore.transactional
    def _apply(tx):
        cur = ref.get(transaction=tx).to_dict() or {}
        perfil = cur.get("perfil_salida") or {}
        if not perfil.get("contenido"):
            raise ValueError("no-perfil")
        if perfil.get("status") not in ("en_validacion", "con_cambios", "aprobado"):
            raise ValueError("estado-no-validable")
        if expected_version is not None and int(perfil.get("version") or 0) != int(expected_version):
            raise ValueError("version-cambio")
        perfil["status"] = "aprobado" if decision == "aprobar" else "con_cambios"
        perfil["validacion_feedback"] = feedback
        perfil["validado_por"] = ctx.email or None
        perfil["validado_at"] = datetime.utcnow().isoformat()
        tx.update(ref, {"perfil_salida": perfil, "updated_at": SERVER_TIMESTAMP})

    try:
        _apply(transaction)
    except ValueError as ve:
        if str(ve) == "version-cambio":
            return _error("El perfil cambió mientras lo revisabas. Recargá para ver la versión nueva.", 409)
        if str(ve) == "estado-no-validable":
            return _error("El perfil no está en un estado validable", 409)
        return _error("La solicitud no tiene perfil para validar", 400)

    perfil = (ref.get().to_dict() or {}).get("perfil_salida") or {}

    curso = (sol.get("curso") or {}).get("nombre", "el curso")
    # Notificar al equipo de la empresa DUEÑA de la solicitud (el validador
    # gmail puede no tener empresa mapeada).
    empresa_solicitud = get_company(owner_company_id(sol))
    notifications.notify_perfil_resultado(
        solicitud_id, curso, decision == "aprobar", feedback,
        asignado=sol.get("asignado_a"), company=empresa_solicitud,
    )
    return _response({"ok": True, "status": perfil["status"]})


# ============== INTAKE ASISTIDO (lado solicitante) ==============

def _curso_para_prompt(curso: dict) -> str:
    return (
        f"- Curso: {curso.get('nombre','')}\n"
        f"- Tipo/arquetipo: {curso.get('course_type', curso.get('tipo_curso',''))}\n"
        f"- Audiencia: {curso.get('audiencia','')}\n"
        f"- Nivel: {curso.get('nivel','')}\n"
        f"- Duración: {curso.get('duracion_min','')} min\n"
        f"- Objetivo: {curso.get('objetivo','')}\n"
        f"- Temas: {str(curso.get('temas',''))[:1500]}"
    )


@https_fn.on_request(cors=cors_options, secrets=[OPENAI_API_KEY])
@require_auth(allow_unassigned=True)
def intake_preguntas(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /intake/preguntas - La IA lee el borrador del curso y devuelve 2-4
    preguntas de clarificación para que el solicitante las responda antes de enviar.
    Body: { curso }. Devuelve: { preguntas: [{id, pregunta, ayuda}] }"""
    if req.method != "POST":
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
        curso = data.get("curso") or {}
    except Exception as e:
        return _error(f"Invalid request: {e}")
    if not curso.get("nombre"):
        return _error("Falta 'curso'")

    from openai import OpenAI
    from core.config import get_openai_key
    api_key = get_openai_key()
    if not api_key:
        return _error("Missing OPENAI_API_KEY", 500)

    prompt = f"""Sos un diseñador instruccional entrevistando a quien PIDE un curso (no es experto
en formación). El curso SIEMPRE es e-learning autogestionado y asincrónico (módulos digitales que
el participante hace solo, a su ritmo) — NO preguntes por modalidad presencial/remoto/híbrido, ni
horarios, ni logística de dictado: eso ya está definido.

Hacé entre 2 y 4 PREGUNTAS DE CLARIFICACIÓN concretas y fáciles de responder, que te falten para
diseñar bien el CONTENIDO del curso. Enfocate en: alcance y profundidad, público exacto y su nivel
de partida, qué debe saber HACER al terminar, ejemplos/casos reales de la empresa a incluir,
sistemas o procesos internos involucrados, y qué NO debe cubrir. Deben ser específicas al tipo y
objetivo, no genéricas. Ejemplos válidos: para un onboarding, "¿aplica a un rol puntual o es
transversal a toda la empresa?", "¿qué herramientas internas debe conocer el ingresante?"; para
compliance, "¿qué normativa/versión aplica y qué pasa si se incumple?".

SOLICITUD (borrador):
{_curso_para_prompt(curso)}

Respondé SOLO JSON:
{{"preguntas": [{{"id": "q1", "pregunta": "texto claro y directo", "ayuda": "una pista corta de qué esperás, o null"}}]}}"""

    try:
        client = OpenAI(api_key=api_key, timeout=30.0)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Responde SOLO JSON válido, sin markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )
        resultado = json.loads(_strip_markdown_json(response.choices[0].message.content))
    except Exception as e:
        return _error(f"Error generando preguntas: {e}", 500)

    preguntas = []
    for i, q in enumerate((resultado.get("preguntas") or [])[:4]):
        texto = str(q.get("pregunta") or "").strip()
        if not texto:
            continue
        preguntas.append({
            "id": str(q.get("id") or f"q{i+1}"),
            "pregunta": texto,
            "ayuda": (str(q.get("ayuda")).strip() if q.get("ayuda") else None),
        })
    if not preguntas:
        return _error("La IA no devolvió preguntas válidas", 500)
    return _response({"preguntas": preguntas})


@https_fn.on_request(cors=cors_options, secrets=[OPENAI_API_KEY])
@require_auth(allow_unassigned=True)
def intake_documentos(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /intake/documentos - La IA recomienda 2-10 documentos/textos a adjuntar
    como referencia, según el curso y las respuestas de clarificación.
    Body: { curso, clarificaciones: [{pregunta, respuesta}] }
    Devuelve: { documentos: [{titulo, motivo}] }"""
    if req.method != "POST":
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
        curso = data.get("curso") or {}
        clarificaciones = data.get("clarificaciones") or []
    except Exception as e:
        return _error(f"Invalid request: {e}")
    if not curso.get("nombre"):
        return _error("Falta 'curso'")

    from openai import OpenAI
    from core.config import get_openai_key
    api_key = get_openai_key()
    if not api_key:
        return _error("Missing OPENAI_API_KEY", 500)

    qa = "\n".join(
        f"- {c.get('pregunta','')} → {c.get('respuesta','')}"
        for c in clarificaciones if c.get('pregunta')
    ) or "(sin respuestas de clarificación)"

    prompt = f"""Sos un diseñador instruccional de cursos e-learning autogestionados. Recomendá entre
2 y 10 DOCUMENTOS o TEXTOS internos que quien pide este curso debería adjuntar como referencia para
que el CONTENIDO del curso sea preciso y alineado a la realidad de la empresa (políticas, manuales,
procesos, ejemplos reales). Para cada uno, dá un título claro del documento y una frase de por qué
clarifica el curso. Ejemplos para un onboarding: "Misión y valores", "Política de vacaciones y
licencias", "Organigrama del área", "Beneficios y prestaciones".

SOLICITUD (borrador):
{_curso_para_prompt(curso)}

RESPUESTAS DE CLARIFICACIÓN:
{qa}

Respondé SOLO JSON:
{{"documentos": [{{"titulo": "Nombre del documento", "motivo": "por qué clarifica el curso, una frase"}}]}}"""

    try:
        client = OpenAI(api_key=api_key, timeout=30.0)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Responde SOLO JSON válido, sin markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
        )
        resultado = json.loads(_strip_markdown_json(response.choices[0].message.content))
    except Exception as e:
        return _error(f"Error recomendando documentos: {e}", 500)

    documentos = []
    for d in (resultado.get("documentos") or [])[:10]:
        titulo = str(d.get("titulo") or "").strip()
        if not titulo:
            continue
        documentos.append({"titulo": titulo, "motivo": str(d.get("motivo") or "").strip()})
    if not documentos:
        return _error("La IA no devolvió documentos válidos", 500)
    return _response({"documentos": documentos})


_DOC_MIMES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "text/plain": "txt",
}
_DOC_MAGIC = {
    "application/pdf": b"%PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK\x03\x04",
    "application/msword": b"\xd0\xcf\x11\xe0",
}


@https_fn.on_request(cors=cors_options)
@require_auth(allow_unassigned=True)
def subir_documento(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /intake/documento - Sube un archivo de referencia (PDF/DOCX/TXT) a
    Storage y devuelve su URL pública. Body: { data_url, nombre? }"""
    if req.method != "POST":
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
        data_url = str(data.get("data_url") or "")
        nombre = str(data.get("nombre") or "documento").strip()
    except Exception as e:
        return _error(f"Invalid request: {e}")

    import base64
    import re as _re
    m = _re.match(r"^data:([-\w.+/]+);base64,(.+)$", data_url, _re.S)
    if not m or m.group(1) not in _DOC_MIMES:
        return _error("Formato inválido: subí un PDF, DOCX, DOC o TXT")
    mime = m.group(1)
    try:
        raw = base64.b64decode(m.group(2))
    except Exception:
        return _error("Base64 inválido")
    if len(raw) > 5 * 1024 * 1024:
        return _error("El archivo no puede superar 5 MB")
    magic = _DOC_MAGIC.get(mime)
    if magic and not raw.startswith(magic):
        return _error("El archivo no coincide con el formato declarado")

    ext = _DOC_MIMES[mime]
    company_seg = ctx.company_id or DEFAULT_COMPANY_ID
    safe_name = _re.sub(r"[^a-zA-Z0-9_.-]", "_", nombre)[:60] or "documento"
    blob_path = f"companies/{company_seg}/intake/{uuid.uuid4().hex[:10]}_{safe_name}.{ext}"
    blob = get_bucket().blob(blob_path)
    blob.upload_from_string(raw, content_type=mime)
    blob.make_public()
    return _response({"ok": True, "url": blob.public_url, "nombre": nombre})


# ============== TEMPLATES DE MALLA ==============

@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def listar_templates(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET /templates - Templates de diseño instruccional visibles para la
    empresa activa (globales + propios)."""
    if req.method != "GET":
        return _error("Method not allowed", 405)
    from core import templates as templates_svc
    items = templates_svc.list_templates(get_db(), ctx.company_id)
    return _response({"templates": items, "total": len(items)})


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def guardar_template(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """PUT /templates - Crea o edita un template.

    Body: { id?, nombre, descripcion, focus, estructura[4], resource_mix,
            gamification, activo? }
    Los templates globales (company_id null) solo los edita un superadmin; los
    de la empresa, su equipo Learning. Un template nuevo nace de la empresa
    activa (o global si lo crea un superadmin con scope="global")."""
    if req.method not in ["PUT", "POST"]:
        return _error("Method not allowed", 405)

    try:
        data = req.get_json() or {}
    except Exception as e:
        return _error(f"Invalid request: {e}")

    nombre = str(data.get("nombre") or "").strip()
    if not nombre:
        return _error("Falta 'nombre'")
    estructura = [str(s).strip() for s in (data.get("estructura") or []) if str(s).strip()]
    if not estructura:
        return _error("Falta 'estructura' (lista de pasos)")

    doc = {
        "nombre": nombre,
        "descripcion": str(data.get("descripcion") or "").strip(),
        "focus": str(data.get("focus") or "").strip(),
        "estructura": estructura[:6],
        "resource_mix": str(data.get("resource_mix") or "").strip(),
        "gamification": str(data.get("gamification") or "").strip(),
        "activo": bool(data.get("activo", True)),
        "updated_at": SERVER_TIMESTAMP,
    }

    template_id = (data.get("id") or "").strip()
    db = get_db()
    if template_id:
        snap = db.collection("templates").document(template_id).get()
        if not snap.exists:
            return _error("Template not found", 404)
        owner = (snap.to_dict() or {}).get("company_id")
        if owner is None and not ctx.is_superadmin:
            return _error("Solo un superadmin puede editar templates globales", 403)
        if owner is not None and owner != ctx.company_id:
            return _error("Template not found", 404)
        db.collection("templates").document(template_id).set(doc, merge=True)
        return _response({"ok": True, "id": template_id})

    # Alta: de la empresa activa, o global si lo pide un superadmin.
    doc["company_id"] = None if (data.get("scope") == "global" and ctx.is_superadmin) else ctx.company_id
    doc["created_at"] = SERVER_TIMESTAMP
    ref = db.collection("templates").document()
    ref.set(doc)
    return _response({"ok": True, "id": ref.id}, 201)


@https_fn.on_request(cors=cors_options, secrets=[OPENAI_API_KEY])
@require_auth(roles={"learning"})
def sugerir_template(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /templates/sugerir - La IA lee la solicitud y sugiere qué template
    usar para la malla. El humano valida (o elige otro) antes de generar.

    Body: { curso: {nombre, audiencia, nivel, objetivo, temas, duracion_min, requiere_eval} }
    Devuelve: { template_id, nombre, razon, confianza, alternativa_id? }"""
    if req.method != "POST":
        return _error("Method not allowed", 405)

    try:
        data = req.get_json() or {}
        curso = data.get("curso") or {}
    except Exception as e:
        return _error(f"Invalid request: {e}")
    if not curso.get("nombre"):
        return _error("Falta 'curso'")

    from core import templates as templates_svc
    items = templates_svc.list_templates(get_db(), ctx.company_id)
    if not items:
        return _error("No hay templates disponibles", 500)

    from openai import OpenAI
    from core.config import get_openai_key
    api_key = get_openai_key()
    if not api_key:
        return _error("Missing OPENAI_API_KEY", 500)

    catalogo = "\n".join(
        f'- id: {t["id"]} | {t["nombre"]}: {t.get("descripcion") or t.get("focus", "")}'
        for t in items
    )
    prompt = f"""Sos un diseñador instruccional. Elegí el template de curso más adecuado para esta solicitud.

SOLICITUD:
- Curso: {curso.get('nombre')}
- Audiencia: {curso.get('audiencia', '')}
- Nivel: {curso.get('nivel', '')}
- Objetivo: {curso.get('objetivo', '')}
- Temas: {str(curso.get('temas', ''))[:1500]}
- Duración: {curso.get('duracion_min', '')} min
- Requiere evaluación: {curso.get('requiere_eval', True)}

TEMPLATES DISPONIBLES:
{catalogo}

Respondé SOLO JSON:
{{"template_id": "id elegido", "razon": "una frase clara para un humano de por qué este template", "confianza": 0.0, "alternativa_id": "segundo mejor id o null"}}"""

    try:
        client = OpenAI(api_key=api_key, timeout=30.0)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Responde SOLO JSON válido, sin markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        resultado = json.loads(_strip_markdown_json(response.choices[0].message.content))
    except Exception as e:
        return _error(f"Error sugiriendo template: {e}", 500)

    ids = {t["id"]: t for t in items}
    tid = str(resultado.get("template_id") or "")
    if tid not in ids:
        tid = items[0]["id"]
    alt = str(resultado.get("alternativa_id") or "")
    return _response({
        "template_id": tid,
        "nombre": ids[tid]["nombre"],
        "razon": str(resultado.get("razon") or "").strip(),
        "confianza": max(0.0, min(1.0, float(resultado.get("confianza") or 0))),
        "alternativa_id": alt if alt in ids and alt != tid else None,
    })


# ============== MI EMPRESA (multi-tenant) ==============

@https_fn.on_request(cors=cors_options)
@require_auth(allow_unassigned=True)
def mi_empresa(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """GET /mi_empresa - Config de la empresa del usuario autenticado.

    El frontend la usa para theming (colores, logo, nombre) y para derivar el rol.
    Usuarios sin empresa asignada (gmail antes de su 1ª solicitud) reciben
    company_id null y rol solicitante."""
    if req.method != "GET":
        return _error("Method not allowed", 405)

    if not ctx.company_id or not ctx.company:
        return _response({
            "company_id": None,
            "nombre": None,
            "rol": "solicitante",
        })

    c = ctx.company
    payload = {
        "company_id": ctx.company_id,
        "nombre": c.get("nombre"),
        "rol": ctx.rol,
        "dominios": c.get("dominios") or [],
        "learning_domains": c.get("learning_domains") or [],
        "branding": c.get("branding") or {},
        "defaults": c.get("defaults") or {},
        "areas": c.get("areas"),
        "lms_nombre": c.get("lms_nombre"),
    }
    # Campos extra para la sección Configuración.
    payload["industria"] = c.get("industria")
    payload["descripcion_prompt"] = c.get("descripcion_prompt")
    payload["email"] = c.get("email") or {}
    payload["app_url"] = c.get("app_url")
    # Integración LMS con el token enmascarado (nunca sale del backend).
    li = c.get("lms_integration") or None
    payload["lms_integration"] = (
        {"tipo": li.get("tipo"), "base_url": li.get("base_url"),
         "categoria_id": li.get("categoria_id"), "token_configurado": bool(li.get("token"))}
        if li else None
    )
    # Facturación de IA: modo + budget/gasto; la API key nunca sale (solo si está o no).
    ab = c.get("ai_billing") or {}
    payload["ai_billing"] = {
        "mode": ab.get("mode") or "max_local",
        # La key vive en Secret Manager; en Firestore solo el flag byok_key_set.
        "api_key_configurada": bool(ab.get("byok_key_set")),
        "budget_usd": ab.get("budget_usd"),
        "spent_usd": ab.get("spent_usd") or 0,
        "period": ab.get("period"),
    }
    if ctx.is_superadmin:
        from core.tenancy import list_companies
        payload["is_superadmin"] = True
        payload["companies"] = list_companies()
    return _response(payload)


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def actualizar_empresa(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """PUT /empresa - Guarda la configuración de la empresa activa (sección
    Configuración del dashboard). El equipo Learning edita branding/contenido;
    dominios de acceso y activo son solo de superadmin."""
    if req.method not in ["PUT", "POST"]:
        return _error("Method not allowed", 405)

    try:
        data = req.get_json() or {}
    except Exception as e:
        return _error(f"Invalid request: {e}")

    import re as _re

    def _hex(v, fallback):
        v = str(v or "").strip()
        return v if _re.fullmatch(r"#[0-9a-fA-F]{6}", v) else fallback

    def _clean_list(v):
        if not isinstance(v, list):
            return None
        out = [str(s).strip() for s in v if s and str(s).strip()]
        return out or None

    update: dict = {"updated_at": SERVER_TIMESTAMP}

    nombre = str(data.get("nombre") or "").strip()
    if nombre:
        update["nombre"] = nombre

    b = data.get("branding") or {}
    if b:
        branding = {}
        if b.get("nombre_display"):
            branding["nombre_display"] = str(b["nombre_display"]).strip()
        if "color_primario" in b:
            branding["color_primario"] = _hex(b.get("color_primario"), "#DA291C")
        if "color_acento" in b:
            branding["color_acento"] = _hex(b.get("color_acento"), "#FFD700")
        if "logo_url" in b:
            logo = str(b.get("logo_url") or "").strip()
            if logo and not logo.startswith(("https://", "http://", "data:")):
                return _error("logo_url debe ser una URL http(s) o data:")
            branding["logo_url"] = logo or None
        for f in ("fuente_titulos", "fuente_texto"):
            if b.get(f):
                branding[f] = str(b[f]).strip()
        if branding:
            update["branding"] = branding

    for field in ("industria", "descripcion_prompt", "lms_nombre"):
        if field in data:
            update[field] = str(data.get(field) or "").strip() or None

    if "areas" in data:
        update["areas"] = _clean_list(data.get("areas"))

    d = data.get("defaults") or {}
    if d:
        defaults = {}
        for f in ("voice_id", "avatar_id"):
            if d.get(f):
                defaults[f] = str(d[f]).strip()
        if "passing_score" in d:
            try:
                defaults["passing_score"] = max(0, min(100, int(d["passing_score"])))
            except (ValueError, TypeError):
                pass
        if defaults:
            update["defaults"] = defaults

    if (data.get("email") or {}).get("from_name"):
        update["email"] = {"from_name": str(data["email"]["from_name"]).strip()}

    # Integración LMS (push directo): tipo + URL + token de web services.
    # El token nunca se devuelve en los GET (se enmascara en mi_empresa).
    if "lms_integration" in data:
        li = data.get("lms_integration") or {}
        if not li:
            update["lms_integration"] = None
        else:
            tipo = str(li.get("tipo") or "moodle").strip().lower()
            base_url = str(li.get("base_url") or "").strip().rstrip("/")
            if not base_url.startswith(("https://", "http://")):
                return _error("base_url del LMS debe ser una URL http(s)")
            integration = {"tipo": tipo, "base_url": base_url}
            if li.get("token"):
                integration["token"] = str(li["token"]).strip()
            else:
                # Sin token nuevo: conservar el guardado (permite editar solo la URL).
                prev = ((ctx.company or {}).get("lms_integration") or {}).get("token")
                if prev:
                    integration["token"] = prev
            if li.get("categoria_id") is not None:
                try:
                    integration["categoria_id"] = int(li["categoria_id"])
                except (ValueError, TypeError):
                    pass
            update["lms_integration"] = integration

    if "app_url" in data:
        update["app_url"] = str(data.get("app_url") or "").strip() or None

    # Facturación de IA. mode + API key (BYOK) los edita el learning admin; el
    # budget y el reset del gasto son SOLO superadmin (es lo que se gasta de la
    # bolsa de la plataforma). set(merge=True) hace deep-merge → no pisa spent_usd.
    # NOTA: la key se guarda en Firestore (enmascarada en las lecturas), igual que
    # el token LMS; una v2 debería usar Secret Manager.
    if "ai_billing" in data:
        ab_in = data.get("ai_billing") or {}
        ab_update = {}
        mode = str(ab_in.get("mode") or "").strip().lower()
        if mode in ("max_local", "byok", "platform"):
            ab_update["mode"] = mode
        # API key BYOK: NUNCA en Firestore → va a Secret Manager. En la base solo
        # queda el flag byok_key_set. Si falla SM (API no habilitada / sin permiso),
        # devolvemos error claro en vez de guardar la key en texto.
        if "anthropic_api_key" in ab_in:
            key = str(ab_in.get("anthropic_api_key") or "").strip()
            try:
                from core.secrets import set_byok_key, clear_byok_key
                if key:
                    set_byok_key(ctx.company_id, key)
                    ab_update["byok_key_set"] = True
                else:
                    clear_byok_key(ctx.company_id)
                    ab_update["byok_key_set"] = False
            except Exception as e:
                return _error(f"No se pudo guardar la API key en Secret Manager: {e}", 500)
            # Limpieza defensiva de una key legacy que pudiera haber quedado en texto.
            ab_update["anthropic_api_key"] = DELETE_FIELD
        if "budget_usd" in ab_in or ab_in.get("reset_spent"):
            if not ctx.is_superadmin:
                return _error("Solo un superadmin puede fijar el budget o resetear el gasto", 403)
            if "budget_usd" in ab_in:
                try:
                    ab_update["budget_usd"] = max(0.0, float(ab_in.get("budget_usd") or 0))
                except (ValueError, TypeError):
                    pass
            if ab_in.get("reset_spent"):
                ab_update["spent_usd"] = 0
        if ab_update:
            update["ai_billing"] = ab_update

    # Campos de acceso: solo superadmin (un learning no puede sumar dominios
    # ajenos ni desactivar su empresa por accidente).
    if any(k in data for k in ("dominios", "learning_domains", "activo")):
        if not ctx.is_superadmin:
            return _error("Solo un superadmin puede modificar dominios de acceso", 403)
        if "dominios" in data:
            doms = _clean_list(data.get("dominios"))
            if not doms:
                return _error("La empresa necesita al menos un dominio")
            doms = [s.lower() for s in doms]
            # Unicidad: ningún dominio puede pertenecer ya a OTRA empresa
            # (si no, resolve_company_by_domain enrutaría logins al azar).
            for other in get_db().collection("companies").stream():
                if other.id == ctx.company_id:
                    continue
                ajenos = {d.lower() for d in (other.to_dict() or {}).get("dominios") or []}
                choque = ajenos & set(doms)
                if choque:
                    return _error(
                        f"El dominio {', '.join(sorted(choque))} ya pertenece a la empresa '{other.id}'", 409
                    )
            update["dominios"] = doms
        if "learning_domains" in data:
            update["learning_domains"] = [s.lower() for s in (_clean_list(data.get("learning_domains")) or [])]
        if "activo" in data:
            update["activo"] = bool(data.get("activo"))

    get_db().collection("companies").document(ctx.company_id).set(update, merge=True)
    return _response({"ok": True, "company_id": ctx.company_id, "updated": [k for k in update if k != "updated_at"]})


# ============== INTEGRACIÓN LMS (push directo) ==============

@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def lms_probar(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /lms/probar - Prueba la conexión con el LMS. Usa las credenciales
    del body (al configurar) o las guardadas de la empresa."""
    if req.method != "POST":
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
    except Exception:
        data = {}

    saved = (ctx.company or {}).get("lms_integration") or {}
    base_url = str(data.get("base_url") or saved.get("base_url") or "").strip()
    token = str(data.get("token") or saved.get("token") or "").strip()
    if not base_url or not token:
        return _error("Faltan base_url/token (configurá la integración primero)")

    from core.lms import moodle
    try:
        return _response(moodle.probar_conexion(base_url, token))
    except moodle.MoodleError as e:
        return _error(str(e), 502)


@https_fn.on_request(cors=cors_options, timeout_sec=300, memory=options.MemoryOption.GB_1)
@require_auth(roles={"learning"})
def lms_publicar(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /lms/publicar - Publica el SCORM de una malla directo en el LMS de
    la empresa (v1: Moodle — crea el curso y sube el zip).
    Body: { malla_id }"""
    if req.method != "POST":
        return _error("Method not allowed", 405)
    try:
        data = req.get_json() or {}
        malla_id = str(data.get("malla_id") or "").strip()
    except Exception as e:
        return _error(f"Invalid request: {e}")
    if not malla_id:
        return _error("Falta 'malla_id'")

    li = (ctx.company or {}).get("lms_integration") or {}
    if not li.get("base_url") or not li.get("token"):
        return _error("La empresa no tiene integración LMS configurada", 400)
    if (li.get("tipo") or "moodle") != "moodle":
        return _error(f"Integración '{li.get('tipo')}' aún no soportada (v1: moodle)", 400)

    snap = get_db().collection("mallas").document(malla_id).get()
    if not snap.exists:
        return _error("Malla not found", 404)
    md = snap.to_dict() or {}
    if _tenant_mismatch(md, ctx):
        return _error("Malla not found", 404)
    scorm_url = md.get("scorm_url")
    if not scorm_url:
        return _error("La malla no tiene paquete SCORM generado — empaquetá primero", 400)

    from core.security import safe_get, UnsafeURLError
    try:
        zip_bytes = safe_get(scorm_url, timeout=120, max_bytes=200 * 1024 * 1024)
    except UnsafeURLError as e:
        return _error(f"URL del SCORM no permitida: {e}", 400)
    except Exception as e:
        return _error(f"No se pudo descargar el SCORM: {e}", 500)

    curso_nombre = (md.get("solicitud") or {}).get("curso", {}).get("nombre") \
        or (md.get("solicitud") or {}).get("nombre") or "Curso"

    from core.lms import moodle
    try:
        result = moodle.publicar(
            li["base_url"], li["token"], curso_nombre, malla_id,
            zip_bytes, categoria_id=int(li.get("categoria_id") or 1),
        )
    except moodle.MoodleError as e:
        return _error(str(e), 502)

    # Registrar la publicación en la malla (best-effort).
    try:
        get_db().collection("mallas").document(malla_id).update({
            "lms_publicado": {
                "tipo": "moodle",
                "curso_id": result["curso_id"],
                "curso_url": result["curso_url"],
                "at": SERVER_TIMESTAMP,
            },
            "updated_at": SERVER_TIMESTAMP,
        })
    except Exception:
        pass

    return _response(result)


# ============== LOGO DE EMPRESA ==============

# SVG excluido a propósito: puede contener <script> → XSS almacenado al
# renderizar el logo inline. Solo formatos raster.
_LOGO_MIMES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}

# Magic bytes por formato (validar que el binario coincida con el MIME declarado).
_LOGO_MAGIC = {
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/jpeg": b"\xff\xd8\xff",
    "image/webp": b"RIFF",  # "RIFF"...."WEBP"
}


@https_fn.on_request(cors=cors_options)
@require_auth(roles={"learning"})
def subir_logo(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
    """POST /logo - Sube el logo de la empresa activa (dataURL base64) a Storage,
    lo hace público y lo persiste en companies/{id}.branding.logo_url."""
    if req.method != "POST":
        return _error("Method not allowed", 405)

    try:
        data = req.get_json() or {}
        data_url = str(data.get("data_url") or "")
    except Exception as e:
        return _error(f"Invalid request: {e}")

    import base64
    import re as _re

    m = _re.match(r"^data:(image/[a-zA-Z+.-]+);base64,(.+)$", data_url, _re.S)
    if not m or m.group(1) not in _LOGO_MIMES:
        return _error("Formato inválido: subí un PNG, JPG o WEBP (SVG no permitido)")
    mime = m.group(1)
    try:
        raw = base64.b64decode(m.group(2))
    except Exception:
        return _error("Base64 inválido")
    if len(raw) > 2 * 1024 * 1024:
        return _error("El logo no puede superar 2 MB")
    # El binario debe empezar con los magic bytes del formato declarado (evita
    # subir HTML/JS con content-type de imagen).
    if not raw.startswith(_LOGO_MAGIC[mime]):
        return _error("El archivo no es una imagen válida del formato declarado")

    ext = _LOGO_MIMES[mime]
    blob_path = f"{_storage_prefix(ctx)}branding/logo_{uuid.uuid4().hex[:8]}.{ext}"
    blob = get_bucket().blob(blob_path)
    blob.upload_from_string(raw, content_type=mime)
    blob.make_public()

    get_db().collection("companies").document(ctx.company_id).set(
        {"branding": {"logo_url": blob.public_url}, "updated_at": SERVER_TIMESTAMP},
        merge=True,
    )
    return _response({"ok": True, "logo_url": blob.public_url})


# ============== SYNC EMPRESAS (Google Sheet → Firestore) ==============

@scheduler_fn.on_schedule(schedule="*/15 * * * *", timeout_sec=120)
def sync_companies_sheet(event: scheduler_fn.ScheduledEvent) -> None:
    """Cada 15 min: lee el Google Sheet de empresas y upsertea companies/{id}.
    Nuevas filas en el sheet = empresas dadas de alta automáticamente."""
    import os
    from core.companies_sync import sync_companies_from_sheet

    sheet_id = os.environ.get("COMPANIES_SHEET_ID", "").strip()
    if not sheet_id:
        print("COMPANIES_SHEET_ID no configurado — sync omitido")
        return
    try:
        resumen = sync_companies_from_sheet(get_db(), sheet_id)
        print(f"sync_companies_sheet: {resumen}")
    except Exception as e:
        # No relanzar: evitar reintentos agresivos del scheduler por un sheet mal compartido.
        print(f"sync_companies_sheet ERROR: {e}")


# ============== HEALTH ==============

@https_fn.on_request(cors=cors_options)
def health(req: https_fn.Request) -> https_fn.Response:
    """GET /health - Health check."""
    return _response({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
    })
