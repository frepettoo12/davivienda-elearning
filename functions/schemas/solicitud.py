"""
Schemas para solicitudes del Dashboard.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class SolicitudStatus(str, Enum):
    """Estados posibles de una solicitud."""
    PENDIENTE = "pendiente"
    EN_REVISION = "en_revision"
    DEVUELTO = "devuelto"
    APROBADO = "aprobado"
    RECHAZADO = "rechazado"
    EN_PROCESO = "en_proceso"
    COMPLETADO = "completado"


class Prioridad(str, Enum):
    """Niveles de prioridad."""
    ALTA = "alta"
    MEDIA = "media"
    BAJA = "baja"


class CourseType(str, Enum):
    """Arquetipos de curso para orientar diseño instruccional y malla."""
    COMPLIANCE = "compliance"
    ONBOARDING = "onboarding"
    PROCESO_SISTEMA = "proceso_sistema"
    HABILIDADES_BLANDAS = "habilidades_blandas"
    PRODUCTO_VENTAS = "producto_ventas"


class Solicitante(BaseModel):
    """Información del solicitante."""
    email: str = Field(..., description="Email del solicitante")
    nombre: str = Field(default="", description="Nombre del solicitante")
    area: str = Field(default="", description="Área del solicitante")


class CursoInfo(BaseModel):
    """Información del curso solicitado."""
    nombre: str = Field(..., description="Nombre del curso")
    course_type: CourseType = Field(
        default=CourseType.COMPLIANCE,
        description="Arquetipo del curso (impacta malla, guion y evaluación)"
    )
    audiencia: str = Field(..., description="Audiencia objetivo")
    nivel: str = Field(default="Básico", description="Nivel: Básico, Intermedio, Avanzado")
    duracion_min: int = Field(default=15, description="Duración máxima en minutos")
    objetivo: str = Field(..., description="Objetivo del curso")
    temas: str = Field(..., description="Temas a cubrir")
    requiere_eval: bool = Field(default=True, description="Si requiere quiz final")
    documentacion: Optional[str] = Field(default="", description="Documentación de referencia")


class ComentarioAutor(BaseModel):
    """Autor de un comentario."""
    email: str
    nombre: str = ""
    rol: str = ""  # "solicitante" o "learning"


class ComentarioCreate(BaseModel):
    """Request para crear un comentario."""
    texto: str = Field(..., min_length=1, description="Texto del comentario")


class Comentario(BaseModel):
    """Un comentario en una solicitud."""
    id: str
    autor: ComentarioAutor
    texto: str
    created_at: datetime


class SolicitudCreateRequest(BaseModel):
    """Request para crear una nueva solicitud."""
    solicitante: Solicitante
    curso: CursoInfo
    prioridad: Prioridad = Field(default=Prioridad.MEDIA)


class SolicitudUpdateRequest(BaseModel):
    """Request para actualizar una solicitud."""
    status: Optional[SolicitudStatus] = None
    asignado_a: Optional[str] = None
    prioridad: Optional[Prioridad] = None
    malla_id: Optional[str] = None


class SolicitudResponse(BaseModel):
    """Respuesta con datos de una solicitud."""
    id: str
    solicitante: Solicitante
    curso: CursoInfo
    status: SolicitudStatus = SolicitudStatus.PENDIENTE
    asignado_a: Optional[str] = None
    prioridad: Prioridad = Prioridad.MEDIA
    malla_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    comentarios: List[Comentario] = []


class SolicitudListItem(BaseModel):
    """Item resumido para listados."""
    id: str
    curso_nombre: str
    area: str
    status: SolicitudStatus
    prioridad: Prioridad
    asignado_a: Optional[str] = None
    created_at: Optional[datetime] = None
    ultimo_comentario: Optional[str] = None


class SolicitudListResponse(BaseModel):
    """Respuesta con lista de solicitudes."""
    solicitudes: List[SolicitudListItem]
    total: int
