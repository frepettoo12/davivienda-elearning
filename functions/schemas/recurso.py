"""
Schemas para generación de recursos (audio, video).
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class JobStatus(str, Enum):
    """Estados posibles de un job."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AudioRequest(BaseModel):
    """Request para generar audio."""
    texto: str = Field(..., description="Texto a convertir en audio")
    voice_id: str = Field(default="valeria", description="ID o nombre de la voz")
    stability: float = Field(default=0.6, ge=0, le=1)
    similarity_boost: float = Field(default=0.8, ge=0, le=1)
    style: float = Field(default=0.4, ge=0, le=1)


class AudioResponse(BaseModel):
    """Respuesta de generación de audio."""
    job_id: str
    status: JobStatus
    audio_url: Optional[str] = None
    error: Optional[str] = None


class VideoRequest(BaseModel):
    """Request para generar video con avatar."""
    audio_url: str = Field(..., description="URL pública del audio")
    avatar_id: str = Field(default="hada", description="ID o nombre del avatar")
    dimension: Dict[str, int] = Field(
        default={"width": 1920, "height": 1080},
        description="Dimensiones del video"
    )


class VideoResponse(BaseModel):
    """Respuesta de generación de video."""
    job_id: str
    status: JobStatus
    video_url: Optional[str] = None
    error: Optional[str] = None


class JobResponse(BaseModel):
    """Estado de un job."""
    job_id: str
    type: str  # "audio", "video", "scorm"
    status: JobStatus
    result_url: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str
