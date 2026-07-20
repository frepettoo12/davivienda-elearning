/**
 * Marca por empresa (multi-tenant).
 *
 * `Brand` es la porción de la config de la empresa que necesita el frontend para
 * pintar UI y generar el output (HTML de recursos, paneles de video, SCORM).
 * El default ES Davivienda: cualquier flujo que no reciba brand explícito se
 * comporta exactamente igual que antes del multi-tenant.
 */

export interface Brand {
  companyId: string;
  nombre: string; // "Davivienda"
  nombreDisplay: string; // "Davivienda E-Learning" (headers, títulos de documento)
  logoUrl?: string | null;
  colorPrimario: string; // "#DA291C"
  colorSecundario: string; // "#FFD700"
  fuenteTitulos: string; // "Montserrat"
  fuenteTexto: string; // "Open Sans"
  lmsNombre?: string; // "Territorium"
  areas?: string[]; // taxonomía de áreas del solicitante
}

export const DEFAULT_BRAND: Brand = {
  companyId: "davivienda",
  nombre: "Davivienda",
  nombreDisplay: "Davivienda E-Learning",
  logoUrl: "/davivienda-logo.png",
  colorPrimario: "#DA291C",
  colorSecundario: "#FFD700",
  fuenteTitulos: "Montserrat",
  fuenteTexto: "Open Sans",
  lmsNombre: "Territorium",
};

// Whitelist de Google Fonts elegibles por empresa: evita inyección vía nombre de
// fuente y garantiza que la fuente existe en Google Fonts.
export const ALLOWED_FONTS = [
  "Montserrat",
  "Open Sans",
  "Roboto",
  "Lato",
  "Poppins",
  "Inter",
  "Nunito",
  "Source Sans 3",
  "Raleway",
  "Work Sans",
];

export function safeFont(font: string | undefined, fallback: string): string {
  return font && ALLOWED_FONTS.includes(font) ? font : fallback;
}

// <link> de Google Fonts para los HTML standalone generados (recursos, paneles).
export function googleFontsLink(brand: Brand): string {
  const t = safeFont(brand.fuenteTitulos, "Montserrat");
  const b = safeFont(brand.fuenteTexto, "Open Sans");
  const fam = (f: string) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700;800`;
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fam(t)}&${fam(b)}&display=swap">`;
}

// Respuesta de GET /mi_empresa (backend) → Brand del frontend.
export interface MiEmpresa {
  company_id: string;
  nombre: string;
  rol: "learning" | "solicitante";
  // Superadmin de plataforma: puede actuar como cualquier empresa.
  is_superadmin?: boolean;
  companies?: Array<{ id: string; nombre: string; color_primario?: string }>;
  dominios?: string[];
  learning_domains?: string[];
  branding?: {
    nombre_display?: string;
    color_primario?: string;
    color_acento?: string;
    logo_url?: string | null;
    fuente_titulos?: string;
    fuente_texto?: string;
  };
  defaults?: { voice_id?: string; avatar_id?: string; passing_score?: number };
  areas?: string[];
  lms_nombre?: string;
  // Campos de la sección Configuración
  industria?: string;
  descripcion_prompt?: string;
  email?: { from_name?: string };
  app_url?: string;
  // Integración LMS (token enmascarado: solo se sabe si está configurado)
  lms_integration?: {
    tipo?: string;
    base_url?: string;
    categoria_id?: number;
    token_configurado?: boolean;
  } | null;
  // Facturación de IA (agente): la API key nunca se devuelve (solo si está o no).
  ai_billing?: {
    mode?: "max_local" | "byok" | "platform";
    api_key_configurada?: boolean;
    budget_usd?: number | null;
    spent_usd?: number;
    period?: string | null;
  };
}

export function brandFromMiEmpresa(e: MiEmpresa): Brand {
  const b = e.branding || {};
  return {
    companyId: e.company_id,
    nombre: e.nombre || DEFAULT_BRAND.nombre,
    nombreDisplay: b.nombre_display || `${e.nombre} E-Learning`,
    // Davivienda sin logo cargado usa el asset local histórico; el resto de las
    // empresas sin logo muestran la inicial (tile) en los layouts.
    logoUrl:
      b.logo_url ?? (e.company_id === "davivienda" ? "/davivienda-logo.png" : null),
    colorPrimario: b.color_primario || DEFAULT_BRAND.colorPrimario,
    colorSecundario: b.color_acento || DEFAULT_BRAND.colorSecundario,
    fuenteTitulos: safeFont(b.fuente_titulos, DEFAULT_BRAND.fuenteTitulos),
    fuenteTexto: safeFont(b.fuente_texto, DEFAULT_BRAND.fuenteTexto),
    lmsNombre: e.lms_nombre,
    areas: e.areas,
  };
}
