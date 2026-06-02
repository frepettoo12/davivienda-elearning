"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { listarSolicitudes, obtenerMalla, SolicitudListItem, MallaItem, Guion } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function ScormPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mallaId = searchParams.get("malla");

  const [loading, setLoading] = useState(true);
  const [enProcesoList, setEnProcesoList] = useState<SolicitudListItem[]>([]);
  const [mallaItems, setMallaItems] = useState<MallaItem[]>([]);
  const [guiones, setGuiones] = useState<Guion[]>([]);
  const [packaging, setPackaging] = useState(false);
  const [packaged, setPackaged] = useState(false);

  useEffect(() => {
    if (mallaId) {
      loadMalla();
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

  const loadMalla = async () => {
    if (!mallaId) return;
    setLoading(true);
    try {
      const malla = await obtenerMalla(mallaId);
      setMallaItems(malla.malla || []);
      setGuiones(malla.guiones || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePackage = async () => {
    setPackaging(true);
    // Simular empaquetado (TODO: implementar endpoint real)
    await new Promise(resolve => setTimeout(resolve, 3000));
    setPackaging(false);
    setPackaged(true);
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
          <h1 className="text-2xl font-bold text-gray-900">SCORM</h1>
          <p className="text-gray-500">Empaqueta el curso en formato SCORM 1.2</p>
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
                  onClick={() => router.push(`/dashboard/scorm?malla=${sol.malla_id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{sol.curso_nombre}</h3>
                      <Badge className="bg-yellow-100 text-yellow-700">Sin empaquetar</Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{sol.area}</p>
                    <Button size="sm" className="w-full">Empaquetar SCORM</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-gray-500 mb-4">Primero genera el contenido del curso</p>
              <Button onClick={() => router.push("/dashboard/contenido")}>Ir a Contenido</Button>
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
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/scorm")}>
            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Cursos
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Empaquetado SCORM</h1>
            <p className="text-gray-500">{mallaItems.length} recursos | {guiones.length} guiones</p>
          </div>
          {packaged && (
            <Button onClick={() => router.push(`/dashboard/lms?malla=${mallaId}`)}>
              Continuar a LMS
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Package info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Paquete SCORM 1.2
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Recursos</span>
                <p className="font-medium">{mallaItems.length}</p>
              </div>
              <div>
                <span className="text-gray-500">Guiones</span>
                <p className="font-medium">{guiones.length}</p>
              </div>
              <div>
                <span className="text-gray-500">Formato</span>
                <p className="font-medium">SCORM 1.2</p>
              </div>
              <div>
                <span className="text-gray-500">Compatible con</span>
                <p className="font-medium">Territorium LMS</p>
              </div>
            </div>

            {packaged ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-4 bg-green-50 rounded-lg text-green-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Paquete SCORM generado exitosamente
                </div>
                <Button variant="outline" className="w-full">
                  <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Descargar SCORM.zip
                </Button>
              </div>
            ) : packaging ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg text-blue-700">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  Generando paquete SCORM...
                </div>
                <Progress value={66} className="h-2" />
              </div>
            ) : (
              <Button onClick={handlePackage} className="w-full bg-red-600 hover:bg-red-700">
                <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                Generar Paquete SCORM
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Content preview */}
        <Card>
          <CardHeader>
            <CardTitle>Contenido del paquete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-auto">
              {mallaItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {item.tipo_recurso === "Video avatar" && "🎬"}
                      {item.tipo_recurso === "Video" && "📹"}
                      {item.tipo_recurso === "Quiz" && "❓"}
                      {item.tipo_recurso === "Infografía" && "📊"}
                      {item.tipo_recurso === "Interactivo" && "🖱️"}
                      {item.tipo_recurso === "Comparador" && "⚖️"}
                      {item.tipo_recurso === "Flashcards" && "🃏"}
                      {item.tipo_recurso === "Caso práctico" && "💼"}
                    </span>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{item.recurso}</p>
                      <p className="text-xs text-gray-500">{item.tipo_recurso}</p>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-700 text-xs">Listo</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
