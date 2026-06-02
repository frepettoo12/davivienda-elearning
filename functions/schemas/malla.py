"""
Schemas para solicitudes y mallas.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class SolicitudCreate(BaseModel):
    """Solicitud para crear un nuevo curso."""
    nombre: str = Field(..., description="Nombre del curso")
    course_type: str = Field(
        default="compliance",
        description="Arquetipo del curso: compliance|onboarding|proceso_sistema|habilidades_blandas|producto_ventas"
    )
    audiencia: str = Field(..., description="Audiencia objetivo")
    nivel: str = Field(default="Básico", description="Nivel: Básico, Intermedio, Avanzado")
    duracion_min: int = Field(default=15, description="Duración máxima en minutos")
    objetivo: str = Field(..., description="Objetivo del curso")
    temas: str = Field(..., description="Temas a cubrir")
    requiere_eval: bool = Field(default=True, description="Si requiere quiz final")
    documentacion: Optional[str] = Field(default="", description="Documentación de referencia")


class RecursoMalla(BaseModel):
    """Un recurso dentro de la malla."""
    id: int
    etapa: str
    bloque: str
    objetivo: str
    tipo_recurso: str
    recurso: str
    descripcion: str
    duracion_min: int


class MallaResponse(BaseModel):
    """Respuesta con la malla generada."""
    id: str = Field(..., description="ID del documento en Firestore")
    solicitud: SolicitudCreate
    version: int = Field(default=1)
    malla: List[RecursoMalla]
    duracion_total: int = Field(description="Duración total en minutos")


class MallaIterar(BaseModel):
    """Request para iterar una malla con feedback."""
    feedback: str = Field(..., description="Cambios solicitados")


class GuionResponse(BaseModel):
    """Respuesta con un guion generado."""
    id: int
    tipo: str
    bloque: str
    contenido: Dict[str, Any]
