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
}

export function brandFromMiEmpresa(e: MiEmpresa): Brand {
  const b = e.branding || {};
  return {
    companyId: e.company_id,
    nombre: e.nombre || DEFAULT_BRAND.nombre,
    nombreDisplay: b.nombre_display || `${e.nombre} E-Learning`,
    logoUrl: b.logo_url ?? null,
    colorPrimario: b.color_primario || DEFAULT_BRAND.colorPrimario,
    colorSecundario: b.color_acento || DEFAULT_BRAND.colorSecundario,
    fuenteTitulos: safeFont(b.fuente_titulos, DEFAULT_BRAND.fuenteTitulos),
    fuenteTexto: safeFont(b.fuente_texto, DEFAULT_BRAND.fuenteTexto),
    lmsNombre: e.lms_nombre,
    areas: e.areas,
  };
}
