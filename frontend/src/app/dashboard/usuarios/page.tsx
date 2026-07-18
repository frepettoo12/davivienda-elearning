"use client";

/**
 * Solicitantes de la empresa (alta por el equipo Learning).
 *
 * Da de alta por email a personas que pueden pedir cursos (típicamente externos
 * o de dominios no registrados: consultores, gmail). Al loguearse con Google,
 * quedan reconocidas como solicitantes de esta empresa —con su marca y datos—
 * sin depender del dominio. Dar de baja revoca el acceso.
 */

import { useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import {
  eliminarSolicitante,
  invitarSolicitante,
  listarSolicitantes,
  type SolicitanteInvitado,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function UsuariosPage() {
  const { company } = useCompany();
  const [lista, setLista] = useState<SolicitanteInvitado[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listarSolicitantes();
      setLista(r.solicitantes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAlta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await invitarSolicitante(email.trim().toLowerCase(), nombre.trim() || undefined);
      setOk(`${email} dado de alta como solicitante de ${company.nombre}.`);
      setEmail("");
      setNombre("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleBaja = async (em: string) => {
    if (!confirm(`¿Dar de baja a ${em}? Perderá el acceso como solicitante.`)) return;
    setError(null);
    try {
      await eliminarSolicitante(em);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Solicitantes</h1>
        <p className="text-gray-500">
          Personas habilitadas a pedir cursos en {company.nombre}. Al loguearse con Google
          quedan reconocidas como solicitantes de la empresa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dar de alta un solicitante</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAlta} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre.apellido@gmail.com"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="mb-1 block text-sm font-medium text-gray-700">Nombre (opcional)</label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" />
            </div>
            <Button type="submit" disabled={saving || !email.trim()} className="bg-brand hover:bg-brand/90">
              {saving ? "Dando de alta…" : "+ Dar de alta"}
            </Button>
          </form>
          {ok && <p className="mt-3 text-sm text-green-600">✓ {ok}</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <p className="mt-3 text-xs text-gray-400">
            No hace falta invitar a quienes tienen un email del dominio de la empresa: entran
            solos por su dominio corporativo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Solicitantes dados de alta {lista.length > 0 && <span className="text-gray-400">({lista.length})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-400">Cargando…</p>
          ) : lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Todavía no diste de alta ningún solicitante externo.
            </p>
          ) : (
            <ul className="divide-y">
              {lista.map((s) => (
                <li key={s.email} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900">{s.nombre}</p>
                    <p className="text-sm text-gray-500">{s.email}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleBaja(s.email)}>
                    Dar de baja
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
