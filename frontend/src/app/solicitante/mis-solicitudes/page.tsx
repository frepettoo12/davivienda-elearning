"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { misSolicitudes, SolicitudListItem, STATUS_CONFIG, PRIORIDAD_CONFIG } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MisSolicitudesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = user?.email || "";

  const search = useCallback(async (mail: string) => {
    if (!mail.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const result = await misSolicitudes(mail);
      setSolicitudes(result.solicitudes);
    } catch (err) {
      setError("Error al buscar solicitudes");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga automática con el email de la cuenta de Google autenticada.
  useEffect(() => {
    if (email) void search(email);
  }, [email, search]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mis Solicitudes</h1>
        <p className="text-gray-500">Consulta el estado de tus solicitudes</p>
      </div>

      {/* Cuenta + actualizar */}
      <Card className="mb-6">
        <CardContent className="flex items-center gap-3 py-4">
          <div className="flex-1">
            <p className="text-xs text-gray-500">Mostrando solicitudes de</p>
            <p className="text-sm font-medium text-gray-900">{email || "—"}</p>
          </div>
          <Button variant="outline" onClick={() => search(email)} disabled={loading || !email}>
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                Actualizando...
              </span>
            ) : (
              "↻ Actualizar"
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {searched && !loading && (
        <>
          {solicitudes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="mb-4 flex justify-center">
                  <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-500">No tienes solicitudes registradas con este email</p>
                <Button
                  className="mt-4"
                  onClick={() => router.push("/solicitante")}
                >
                  Crear nueva solicitud
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {solicitudes.map((solicitud) => (
                <Card key={solicitud.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900">{solicitud.curso_nombre}</h3>
                          <Badge className={STATUS_CONFIG[solicitud.status]?.color}>
                            {STATUS_CONFIG[solicitud.status]?.emoji} {STATUS_CONFIG[solicitud.status]?.label}
                          </Badge>
                          <Badge variant="outline" className={PRIORIDAD_CONFIG[solicitud.prioridad]?.color}>
                            {PRIORIDAD_CONFIG[solicitud.prioridad]?.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 mb-2">
                          Área: {solicitud.area} | Creado: {formatDate(solicitud.created_at)}
                        </p>
                        {solicitud.ultimo_comentario && (
                          <div className="mt-3 rounded-lg bg-blue-50 p-3">
                            <p className="text-sm font-medium text-blue-800 mb-1">Último comentario:</p>
                            <p className="text-sm text-blue-700">{solicitud.ultimo_comentario}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        {solicitud.status === "devuelto" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-orange-500 text-orange-600 hover:bg-orange-50"
                            onClick={() => router.push(`/solicitante/solicitud/${solicitud.id}`)}
                          >
                            Responder
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/solicitante/solicitud/${solicitud.id}`)}
                        >
                          Ver detalle
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12 text-gray-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
            Cargando tus solicitudes...
          </CardContent>
        </Card>
      )}

      {!searched && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mb-4 flex justify-center">
              <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-gray-500">Iniciá sesión para ver tus solicitudes</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
