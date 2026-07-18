"""
Helpers de seguridad compartidos: guard anti-SSRF y descarga acotada.

Todas las descargas server-side de URLs que provienen (directa o indirectamente)
del usuario deben pasar por acá: bloquea esquemas no http(s), hosts que resuelven
a IPs privadas/link-local/loopback (metadata de GCP, red interna) y corta por
tamaño máximo.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import requests


class UnsafeURLError(Exception):
    pass


# Rangos que nunca deben ser alcanzables desde una descarga server-side.
def _is_blocked_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local  # 169.254.0.0/16 → metadata GCP/AWS
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def assert_safe_url(url: str) -> str:
    """Valida que la URL sea http(s) y su host NO resuelva a una IP interna.
    Devuelve la URL si es segura; lanza UnsafeURLError si no."""
    parsed = urlparse(url or "")
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError(f"Esquema no permitido: {parsed.scheme or '∅'}")
    host = parsed.hostname
    if not host:
        raise UnsafeURLError("URL sin host")
    # Resolver TODAS las IPs del host y bloquear si alguna es interna.
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        raise UnsafeURLError(f"No se pudo resolver el host: {host}")
    for info in infos:
        ip = info[4][0]
        if _is_blocked_ip(ip):
            raise UnsafeURLError(f"Host {host} resuelve a una IP interna ({ip})")
    return url


def safe_get(url: str, *, timeout: int = 30, max_bytes: int = 25 * 1024 * 1024) -> bytes:
    """GET con guard anti-SSRF + corte por tamaño (default 25 MB). Devuelve el
    contenido en bytes; lanza UnsafeURLError o requests exceptions."""
    assert_safe_url(url)
    with requests.get(url, timeout=timeout, stream=True, allow_redirects=True) as r:
        r.raise_for_status()
        # Si el server declara Content-Length, cortar temprano.
        clen = r.headers.get("Content-Length")
        if clen and clen.isdigit() and int(clen) > max_bytes:
            raise UnsafeURLError(f"Recurso demasiado grande ({clen} bytes)")
        chunks = []
        total = 0
        for chunk in r.iter_content(64 * 1024):
            total += len(chunk)
            if total > max_bytes:
                raise UnsafeURLError(f"Recurso excede {max_bytes} bytes")
            chunks.append(chunk)
        return b"".join(chunks)
