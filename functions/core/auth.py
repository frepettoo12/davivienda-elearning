"""
Autenticación de endpoints (Firebase ID token) + derivación de tenant.

Modo de rollout controlado por la env var AUTH_ENFORCE:
- "false" (default): si el request no trae token válido, se loguea un warning y
  se sigue con un contexto Davivienda (comportamiento pre-multi-tenant). Permite
  deployar el backend antes de que el 100% del frontend mande el token.
- "true": sin token válido → 401; sin empresa asignada → 403; rol insuficiente → 403.

Uso (el decorador va DEBAJO de @https_fn.on_request):

    @https_fn.on_request(cors=cors_options)
    @require_auth(roles={"learning"})
    def mi_endpoint(req: https_fn.Request, ctx: RequestContext) -> https_fn.Response:
        ...
"""
from __future__ import annotations

import json
import logging
import os
from functools import wraps

from firebase_functions import https_fn

from core.tenancy import (
    DEFAULT_COMPANY_ID,
    RequestContext,
    get_company,
    get_superadmin_emails,
    resolve_company_by_domain,
    resolve_user_company,
)

logger = logging.getLogger(__name__)


class AuthError(Exception):
    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.message = message
        self.status = status


def _enforced() -> bool:
    return os.environ.get("AUTH_ENFORCE", "false").strip().lower() in ("1", "true", "yes")


def _json_error(message: str, status: int) -> https_fn.Response:
    return https_fn.Response(
        json.dumps({"error": message}, ensure_ascii=False),
        status=status,
        headers={"Content-Type": "application/json"},
    )


def get_request_context(req: https_fn.Request, allow_unassigned: bool = False) -> RequestContext:
    """Verifica el ID token y resuelve la empresa del usuario.

    allow_unassigned: no falla si el usuario autenticado no tiene empresa
    (solicitantes gmail antes de su primera solicitud) — devuelve ctx con
    company_id=None y rol "solicitante".
    """
    header = req.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise AuthError("Missing Authorization header", 401)

    # Asegurar que la app default esté inicializada ANTES de verify_id_token:
    # en instancias frías, verify es la primera llamada a firebase_admin y sin
    # app tira ValueError (que se veía como "token inválido" → 401 espurio).
    import core.tenancy as _tenancy
    _tenancy._db()

    from firebase_admin import auth as fb_auth
    try:
        decoded = fb_auth.verify_id_token(header.removeprefix("Bearer ").strip())
    except Exception as e:
        logger.warning("verify_id_token falló: %s", e)
        raise AuthError("Invalid or expired token", 401)

    email = (decoded.get("email") or "").lower()
    uid = decoded.get("uid") or decoded.get("sub") or ""
    if not email:
        raise AuthError("Token sin email", 401)
    domain = email.split("@")[-1]

    company_id, company = resolve_company_by_domain(domain)
    if not company_id:
        # Dominio no registrado: mapeo explícito persistido (users/{uid}).
        company_id, company = resolve_user_company(uid)

    # Superadmin (config/platform.superadmin_emails): acceso cross-tenant.
    # Puede "actuar como" cualquier empresa vía header X-Company-Id (lo manda el
    # selector del frontend); sin header usa su empresa propia o davivienda.
    if email in get_superadmin_emails():
        acting = (req.headers.get("X-Company-Id") or "").strip().lower()
        if acting:
            acting_company = get_company(acting)
            if acting_company:
                company_id, company = acting, acting_company
        if not company_id or not company:
            company_id, company = DEFAULT_COMPANY_ID, get_company(DEFAULT_COMPANY_ID)
        return RequestContext(
            uid=uid, email=email, company_id=company_id, company=company,
            rol="learning", is_superadmin=True,
        )

    if not company_id or not company:
        if allow_unassigned:
            return RequestContext(uid=uid, email=email, company_id=None, company=None, rol="solicitante")
        raise AuthError("Usuario sin empresa asignada", 403)

    if not company.get("activo", True):
        raise AuthError("Empresa inactiva", 403)

    rol = "learning" if domain in (company.get("learning_domains") or []) else "solicitante"
    return RequestContext(uid=uid, email=email, company_id=company_id, company=company, rol=rol)


def _fallback_context() -> RequestContext:
    """Contexto Davivienda para el modo suave (requests legacy sin token)."""
    return RequestContext(
        uid="",
        email="",
        company_id=DEFAULT_COMPANY_ID,
        company=get_company(DEFAULT_COMPANY_ID) or {},
        rol="learning",
    )


def require_auth(roles: set[str] | None = None, allow_unassigned: bool = False):
    """Decorador de auth para endpoints. Inyecta RequestContext como 2º argumento."""

    def deco(fn):
        @wraps(fn)
        def wrapper(req: https_fn.Request) -> https_fn.Response:
            # El framework maneja el preflight CORS; esto es defensivo.
            if req.method == "OPTIONS":
                return https_fn.Response("", status=204)

            try:
                ctx = get_request_context(req, allow_unassigned=allow_unassigned)
            except AuthError as e:
                if _enforced():
                    return _json_error(e.message, e.status)
                logger.warning(
                    "AUTH soft-mode: %s (%s %s) — usando contexto %s",
                    e.message, req.method, req.path, DEFAULT_COMPANY_ID,
                )
                ctx = _fallback_context()

            # El chequeo de ROL corta SIEMPRE (aunque el modo suave sea permisivo
            # con la ausencia de token): un solicitante autenticado nunca debe
            # ejecutar endpoints de learning. El fallback context es learning,
            # así que esto solo bloquea a usuarios reales con rol insuficiente.
            if roles and ctx.rol not in roles:
                return _json_error("Forbidden", 403)

            return fn(req, ctx)

        return wrapper

    return deco
