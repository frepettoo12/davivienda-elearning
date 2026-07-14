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
from google.cloud.firestore import SERVER_TIMESTAMP

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


def get_db():
    global _app, _db
    if _app is None:
        # core.tenancy puede haber inicializado la app default antes (decorador
        # de auth corre primero) — reutilizarla en vez de re-inicializar.
        _app = firebase_admin.get_app() if firebase_admin._apps else firebase_admin.initialize_app()
    if _db is None:
        _db = firestore.client()
    return _db


def get_bucket():
    global _app, _bucket
    if _app is None:
        _app = firebase_admin.get_app() if firebase_admin._apps else firebase_admin.initialize_app()
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

    # Regenerar con feedback
    nueva_malla, error = iterar_malla(
        malla_actual,
        iterar_req.feedback,
        course_type=doc_data.get("solicitud", {}).get("course_type", "compliance"),
        empresa=ctx.company,
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

    # Crear documento en Firestore
    doc_ref = get_db().collection("solicitudes").document()
    doc_data = {
        "company_id": company_id,
        "solicitante": solicitud_req.solicitante.model_dump(),
        "curso": solicitud_req.curso.model_dump(),
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

    # Query base - traer todos y filtrar en memoria para evitar problemas de índices
    query = get_db().collection("solicitudes").order_by("created_at", direction=firestore.Query.DESCENDING)

    # Límite inicial más alto para filtrar en memoria
    query = query.limit(200)

    # Ejecutar query
    docs = list(query.stream())

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
        })

        # Aplicar límite después de filtrar
        if len(solicitudes) >= limit:
            break

    return _response({
        "solicitudes": solicitudes,
        "total": len(solicitudes),
    })


@https_fn.on_request(cors=cors_options)
@require_auth()
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
    if _tenant_mismatch(data, ctx):
        return _error("Solicitud not found", 404)
    # Un solicitante solo puede ver sus propias solicitudes.
    if ctx.rol == "solicitante" and ctx.email:
        if (data.get("solicitante", {}).get("email") or "").lower() != ctx.email:
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
@require_auth()
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
    if _tenant_mismatch(_sol_data, ctx):
        return _error("Solicitud not found", 404)
    if ctx.rol == "solicitante" and ctx.email:
        if (_sol_data.get("solicitante", {}).get("email") or "").lower() != ctx.email:
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
    dominios = set((ctx.company or {}).get("dominios") or [])

    from firebase_admin import auth as fb_auth
    usuarios = []
    try:
        for u in fb_auth.list_users().iterate_all():
            if not u.email:
                continue
            if dominios and u.email.split("@")[-1].lower() not in dominios:
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

    return _response({
        "ok": True,
        "download_url": blob.public_url,
        "size": len(zip_bytes),
        "recursos": len(payload.get("recursos", [])),
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

    if "app_url" in data:
        update["app_url"] = str(data.get("app_url") or "").strip() or None

    # Campos de acceso: solo superadmin (un learning no puede sumar dominios
    # ajenos ni desactivar su empresa por accidente).
    if any(k in data for k in ("dominios", "learning_domains", "activo")):
        if not ctx.is_superadmin:
            return _error("Solo un superadmin puede modificar dominios de acceso", 403)
        if "dominios" in data:
            doms = _clean_list(data.get("dominios"))
            if not doms:
                return _error("La empresa necesita al menos un dominio")
            update["dominios"] = [s.lower() for s in doms]
        if "learning_domains" in data:
            update["learning_domains"] = [s.lower() for s in (_clean_list(data.get("learning_domains")) or [])]
        if "activo" in data:
            update["activo"] = bool(data.get("activo"))

    get_db().collection("companies").document(ctx.company_id).set(update, merge=True)
    return _response({"ok": True, "company_id": ctx.company_id, "updated": [k for k in update if k != "updated_at"]})


# ============== LOGO DE EMPRESA ==============

_LOGO_MIMES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
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
        return _error("Formato inválido: subí un PNG, JPG, WEBP o SVG")
    try:
        raw = base64.b64decode(m.group(2))
    except Exception:
        return _error("Base64 inválido")
    if len(raw) > 2 * 1024 * 1024:
        return _error("El logo no puede superar 2 MB")

    ext = _LOGO_MIMES[m.group(1)]
    blob_path = f"{_storage_prefix(ctx)}branding/logo_{uuid.uuid4().hex[:8]}.{ext}"
    blob = get_bucket().blob(blob_path)
    blob.upload_from_string(raw, content_type=m.group(1))
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
