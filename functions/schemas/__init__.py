# Schemas
from .malla import SolicitudCreate, MallaResponse, MallaIterar
from .recurso import AudioRequest, VideoRequest, JobStatus
from .solicitud import (
    SolicitudStatus,
    Prioridad,
    CourseType,
    Solicitante,
    CursoInfo,
    ComentarioAutor,
    ComentarioCreate,
    Comentario,
    SolicitudCreateRequest,
    SolicitudUpdateRequest,
    SolicitudResponse,
    SolicitudListItem,
    SolicitudListResponse,
)

__all__ = [
    # Malla
    "SolicitudCreate",
    "MallaResponse",
    "MallaIterar",
    # Recurso
    "AudioRequest",
    "VideoRequest",
    "JobStatus",
    # Solicitud Dashboard
    "SolicitudStatus",
    "Prioridad",
    "CourseType",
    "Solicitante",
    "CursoInfo",
    "ComentarioAutor",
    "ComentarioCreate",
    "Comentario",
    "SolicitudCreateRequest",
    "SolicitudUpdateRequest",
    "SolicitudResponse",
    "SolicitudListItem",
    "SolicitudListResponse",
]
