"use client";

/**
 * Config de la empresa del usuario logueado (multi-tenant).
 *
 * Carga GET /mi_empresa al loguear, cachea en localStorage para paint
 * instantáneo, y aplica el theming en runtime (CSS vars --brand-* + título del
 * documento). Si el endpoint falla o aún no está deployado, mantiene
 * DEFAULT_BRAND (Davivienda) — cero regresión.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ACTING_COMPANY_KEY,
  AGENT_URL,
  currentIdToken,
  obtenerMiEmpresa,
} from "@/lib/api";
import {
  Brand,
  DEFAULT_BRAND,
  MiEmpresa,
  brandFromMiEmpresa,
} from "@/lib/brand";

interface CompanyContextType {
  company: Brand;
  miEmpresa: MiEmpresa | null;
  loading: boolean;
  // Superadmin: cambiar la empresa activa (persiste y recarga la config).
  setActingCompany: (companyId: string) => void;
}

const CompanyContext = createContext<CompanyContextType>({
  company: DEFAULT_BRAND,
  miEmpresa: null,
  loading: false,
  setActingCompany: () => {},
});

const CACHE_KEY = "companyBrand";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany] = useState<Brand>(DEFAULT_BRAND);
  const [miEmpresa, setMiEmpresa] = useState<MiEmpresa | null>(null);
  const [loading, setLoading] = useState(false);
  const setActingCompany = (companyId: string) => {
    try {
      if (companyId) localStorage.setItem(ACTING_COMPANY_KEY, companyId);
      else localStorage.removeItem(ACTING_COMPANY_KEY);
      localStorage.removeItem(CACHE_KEY); // el cache es de la empresa anterior
    } catch {
      /* storage bloqueado */
    }
    // Reload completo: todas las páginas tienen datos de la empresa anterior en
    // estado (listas, mallas); recargar garantiza que todo refetchee con el
    // header X-Company-Id nuevo.
    window.location.reload();
  };

  useEffect(() => {
    if (!user) {
      setCompany(DEFAULT_BRAND);
      setMiEmpresa(null);
      return;
    }

    // Paint instantáneo desde cache; después revalida contra /mi_empresa.
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) setCompany({ ...DEFAULT_BRAND, ...JSON.parse(cached) });
    } catch {
      /* cache corrupta: se ignora */
    }

    let cancelled = false;
    setLoading(true);
    obtenerMiEmpresa()
      .then((e) => {
        if (cancelled) return;
        setMiEmpresa(e);
        if (e.company_id) {
          const brand = brandFromMiEmpresa(e);
          setCompany(brand);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(brand));
          } catch {
            /* storage lleno/bloqueado: no es crítico */
          }
        }
        // company_id null (externo sin empresa) → se queda con DEFAULT_BRAND.
      })
      .catch(() => {
        // Endpoint no deployado / red: Davivienda sigue funcionando con el default.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Theming en runtime: las clases Tailwind bg-brand/text-brand leen estas vars.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", company.colorPrimario);
    root.style.setProperty("--brand-secondary", company.colorSecundario);
    document.title = company.nombreDisplay;
    // Favicon con el logo del tenant (si tiene uno cargado por URL).
    if (company.logoUrl && /^(https?:|data:)/.test(company.logoUrl)) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = company.logoUrl;
    }
  }, [company]);

  return (
    <CompanyContext.Provider value={{ company, miEmpresa, loading, setActingCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}

/**
 * URL del preview de un workspace del agent-service, namespaced por empresa
 * (/ws/{companyId}/{sessionKey}/) y con el ID token por query (?auth=) porque
 * los iframes no pueden mandar headers.
 */
export function useWsPreviewSrc(sessionKey: string, previewKey: number): string {
  const { company } = useCompany();
  const [tok, setTok] = useState("");
  useEffect(() => {
    let cancelled = false;
    currentIdToken().then((t) => {
      if (!cancelled) setTok(t);
    });
    return () => {
      cancelled = true;
    };
  }, [previewKey]);
  return `${AGENT_URL}/ws/${company.companyId}/${sessionKey}/index.html?t=${previewKey}${
    tok ? `&auth=${encodeURIComponent(tok)}` : ""
  }`;
}
