"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/solicitante", label: "Nueva Solicitud", icon: "plus" },
  { href: "/solicitante/mis-solicitudes", label: "Mis Solicitudes", icon: "list" },
];

const icons: Record<string, React.ReactNode> = {
  plus: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  list: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
};

export default function SolicitanteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && role !== "solicitante") {
      router.push("/");
    }
  }, [loading, role, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (role !== "solicitante") {
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Image
              src="/davivienda-logo.png"
              alt="Davivienda"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
            <div>
              <h1 className="font-semibold text-gray-900">E-Learning</h1>
              <p className="text-xs text-gray-500">Davivienda</p>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  {icons[item.icon]}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Button variant="ghost" onClick={handleSignOut} className="text-gray-600">
            Salir
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-6xl p-6">
        {children}
      </main>
    </div>
  );
}
