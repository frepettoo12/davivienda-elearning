"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listarSolicitudes, SolicitudListItem, STATUS_CONFIG, PRIORIDAD_CONFIG } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Skeleton component for loading state
function TableSkeleton() {
  return (
    <div className="animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b p-4">
          <div className="h-4 w-48 rounded bg-gray-200" />
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-6 w-20 rounded-full bg-gray-200" />
          <div className="h-6 w-16 rounded-full bg-gray-200" />
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="ml-auto h-8 w-20 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

export default function SolicitudesPage() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<SolicitudListItem[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [areaFilter, setAreaFilter] = useState<string>("todos");
  const [prioridadFilter, setPrioridadFilter] = useState<string>("todos");

  const loadSolicitudes = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    setError(null);

    try {
      const params: Record<string, string> = {};
      if (statusFilter !== "todos") params.status = statusFilter;
      if (areaFilter !== "todos") params.area = areaFilter;

      const result = await listarSolicitudes(params);
      setSolicitudes(result.solicitudes);
    } catch (err) {
      setError("Error al cargar solicitudes");
      console.error(err);
    } finally {
      setIsInitialLoad(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, areaFilter]);

  // Initial load
  useEffect(() => {
    loadSolicitudes();
  }, [loadSolicitudes]);

  const uniqueAreas = [...new Set(solicitudes.map(s => s.area))];

  // Client-side filtering for prioridad (to avoid Firestore index requirements)
  const filteredSolicitudes = solicitudes.filter(s => {
    if (prioridadFilter !== "todos" && s.prioridad !== prioridadFilter) {
      return false;
    }
    return true;
  });

  const stats = {
    pendientes: solicitudes.filter(s => s.status === "pendiente").length,
    enRevision: solicitudes.filter(s => s.status === "en_revision").length,
    enProceso: solicitudes.filter(s => s.status === "en_proceso").length,
    completados: solicitudes.filter(s => s.status === "completado").length,
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes</h1>
          <p className="text-gray-500">Gestiona las solicitudes de cursos e-learning</p>
        </div>
        {isRefreshing && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
            Actualizando...
          </div>
        )}
      </div>

      {/* Stats - show immediately with 0s if loading */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-yellow-600">{stats.pendientes}</span>
              {stats.pendientes > 0 && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">Nuevas</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">En Revisión</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-blue-600">{stats.enRevision}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">En Producción</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-indigo-600">{stats.enProceso}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Completados</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-green-600">{stats.completados}</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-700">Filtros</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Estado</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "todos")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="en_revision">En revisión</SelectItem>
                <SelectItem value="devuelto">Devuelto</SelectItem>
                <SelectItem value="aprobado">Aprobado</SelectItem>
                <SelectItem value="rechazado">Rechazado</SelectItem>
                <SelectItem value="en_proceso">En proceso</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Área</label>
            <Select value={areaFilter} onValueChange={(v) => setAreaFilter(v || "todos")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Área" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas las áreas</SelectItem>
                {uniqueAreas.map(area => (
                  <SelectItem key={area} value={area}>{area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Prioridad</label>
            <Select value={prioridadFilter} onValueChange={(v) => setPrioridadFilter(v || "todos")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas las prioridades</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
          variant="outline"
          onClick={() => loadSolicitudes(true)}
          className="ml-auto"
          disabled={isRefreshing}
        >
          <svg className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isInitialLoad ? (
            <TableSkeleton />
          ) : error ? (
            <div className="py-12 text-center text-red-600">{error}</div>
          ) : filteredSolicitudes.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              No hay solicitudes que mostrar
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Curso</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSolicitudes.map((solicitud) => (
                  <TableRow
                    key={solicitud.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => router.push(`/dashboard/solicitudes/${solicitud.id}`)}
                  >
                    <TableCell className="font-medium">{solicitud.curso_nombre}</TableCell>
                    <TableCell>{solicitud.area}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_CONFIG[solicitud.status]?.color || "bg-gray-100"}>
                        {STATUS_CONFIG[solicitud.status]?.emoji} {STATUS_CONFIG[solicitud.status]?.label || solicitud.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={PRIORIDAD_CONFIG[solicitud.prioridad]?.color}>
                        {PRIORIDAD_CONFIG[solicitud.prioridad]?.label || solicitud.prioridad}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {formatDate(solicitud.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/solicitudes/${solicitud.id}`);
                        }}
                      >
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
