"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { listarSolicitudes, obtenerMalla, SolicitudListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LmsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mallaId = searchParams.get("malla");

  const [loading, setLoading] = useState(true);
  const [enProcesoList, setEnProcesoList] = useState<SolicitudListItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [cursoNombre, setCursoNombre] = useState("");

  useEffect(() => {
    if (mallaId) {
      setLoading(false);
      obtenerMalla(mallaId)
        .then((m) => { if (m.solicitud?.curso?.nombre) setCursoNombre(m.solicitud.curso.nombre); })
        .catch(() => {});
    } else {
      loadEnProceso();
    }
  }, [mallaId]);

  const loadEnProceso = async () => {
    setLoading(true);
    try {
      const result = await listarSolicitudes({ status: "en_proceso" });
      setEnProcesoList(result.solicitudes.filter(s => s.malla_id));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    // Simular subida (TODO: implementar integración real con Territorium)
    await new Promise(resolve => setTimeout(resolve, 2000));
    setUploading(false);
    setUploaded(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  if (!mallaId) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">LMS</h1>
          <p className="text-gray-500">Sube el curso a Territorium LMS</p>
        </div>

        {enProcesoList.length > 0 ? (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              Trabajos en Progreso
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {enProcesoList.map((sol) => (
                <Card
                  key={sol.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => router.push(`/dashboard/lms?malla=${sol.malla_id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{sol.curso_nombre}</h3>
                      <Badge className="bg-yellow-100 text-yellow-700">Sin publicar</Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{sol.area}</p>
                    <Button size="sm" className="w-full">Subir a LMS</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-500 mb-4">Primero empaqueta el curso en formato SCORM</p>
              <Button onClick={() => router.push("/dashboard/scorm")}>Ir a SCORM</Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/lms")}>
            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Cursos
          </Button>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 truncate">{cursoNombre || "Subir a LMS"}</h1>
        <p className="text-sm text-gray-500">Subir a LMS · Territorium - Davivienda</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Territorium LMS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                  T
                </div>
                <div>
                  <p className="font-medium">Territorium</p>
                  <p className="text-sm text-gray-500">LMS Corporativo Davivienda</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Formato</span>
                  <p className="font-medium">SCORM 1.2</p>
                </div>
                <div>
                  <span className="text-gray-500">Categoría</span>
                  <p className="font-medium">Capacitación</p>
                </div>
              </div>
            </div>

            {uploaded ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-4 bg-green-50 rounded-lg text-green-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Curso subido exitosamente a Territorium
                </div>
                <Button variant="outline" className="w-full">
                  <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Abrir en Territorium
                </Button>
              </div>
            ) : uploading ? (
              <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg text-blue-700">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                Subiendo curso a Territorium...
              </div>
            ) : (
              <Button onClick={handleUpload} className="w-full bg-red-600 hover:bg-red-700">
                <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Subir a Territorium
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Status card */}
        <Card>
          <CardHeader>
            <CardTitle>Estado del proceso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <StepStatus step="Solicitud" status="completed" />
              <StepStatus step="Malla curricular" status="completed" />
              <StepStatus step="Diseño de guiones" status="completed" />
              <StepStatus step="Generación de contenido" status="completed" />
              <StepStatus step="Empaquetado SCORM" status="completed" />
              <StepStatus step="Subida a LMS" status={uploaded ? "completed" : uploading ? "current" : "pending"} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StepStatus({ step, status }: { step: string; status: "completed" | "current" | "pending" }) {
  return (
    <div className="flex items-center gap-3">
      {status === "completed" ? (
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : status === "current" ? (
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-gray-300" />
        </div>
      )}
      <span className={status === "pending" ? "text-gray-400" : "text-gray-900"}>{step}</span>
    </div>
  );
}
