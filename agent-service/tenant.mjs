/**
 * Multi-tenant para el agent-service: verificación de Firebase ID token y
 * resolución de la empresa (companies/{id} en Firestore) por dominio del email.
 *
 * Modo de rollout con AUTH_ENFORCE (mismo criterio que las Cloud Functions):
 * - "false" (default): sin token válido → warning + contexto Davivienda
 *   (comportamiento pre-multi-tenant; local sigue funcionando sin login).
 * - "true": sin token → 401; empresa no habilitada → 403.
 *
 * El token puede venir como header `Authorization: Bearer ...` o como query
 * param `?auth=...` (iframes de preview, que no pueden mandar headers).
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const DEFAULT_COMPANY_ID = "davivienda";

// Brand fallback si Firestore no está disponible o la colección no fue seedeada.
export const DEFAULT_COMPANY = {
  id: DEFAULT_COMPANY_ID,
  nombre: "Davivienda",
  activo: true,
  dominios: ["davivienda.com", "alkemy.org"],
  learning_domains: ["davivienda.com", "alkemy.org"],
  branding: {
    nombre_display: "Davivienda E-Learning",
    color_primario: "#DA291C",
    color_acento: "#FFD700",
    logo_url: null,
    fuente_titulos: "Montserrat",
    fuente_texto: "Open Sans",
  },
};

const ENFORCE = /^(1|true|yes)$/i.test(process.env.AUTH_ENFORCE || "");

let _initTried = false;
function ensureApp() {
  if (getApps().length) return true;
  if (_initTried) return getApps().length > 0;
  _initTried = true;
  try {
    initializeApp({ credential: applicationDefault() });
    return true;
  } catch (e) {
    console.error("firebase-admin no disponible (ADC):", e?.message || e);
    return false;
  }
}

const TTL = 5 * 60 * 1000;
const domainCache = new Map(); // domain -> { company|null, exp }
const idCache = new Map(); // companyId -> { company|null, exp }

export async function companyById(companyId) {
  const hit = idCache.get(companyId);
  if (hit && hit.exp > Date.now()) return hit.company;
  let company = null;
  try {
    if (ensureApp()) {
      const snap = await getFirestore().collection("companies").doc(companyId).get();
      if (snap.exists) company = { id: snap.id, ...snap.data() };
    }
  } catch (e) {
    console.error("Error leyendo company:", e?.message || e);
  }
  if (!company && companyId === DEFAULT_COMPANY_ID) company = DEFAULT_COMPANY;
  idCache.set(companyId, { company, exp: Date.now() + TTL });
  return company;
}

async function companyByDomain(domain) {
  const hit = domainCache.get(domain);
  if (hit && hit.exp > Date.now()) return hit.company;
  let company = null;
  try {
    if (ensureApp()) {
      const snap = await getFirestore()
        .collection("companies")
        .where("dominios", "array-contains", domain)
        .limit(1)
        .get();
      if (!snap.empty) company = { id: snap.docs[0].id, ...snap.docs[0].data() };
    }
  } catch (e) {
    console.error("Error buscando company por dominio:", e?.message || e);
  }
  // Sin seed/Firestore: preservar el mapeo legacy de Davivienda.
  if (!company && DEFAULT_COMPANY.dominios.includes(domain)) company = DEFAULT_COMPANY;
  domainCache.set(domain, { company, exp: Date.now() + TTL });
  return company;
}

let _superadmins = { emails: new Set(), exp: 0 };
async function superadminEmails() {
  if (_superadmins.exp > Date.now()) return _superadmins.emails;
  let emails = new Set();
  try {
    if (ensureApp()) {
      const snap = await getFirestore().collection("config").doc("platform").get();
      if (snap.exists) {
        emails = new Set((snap.data().superadmin_emails || []).map((e) => String(e).trim().toLowerCase()));
      }
    }
  } catch (e) {
    console.error("Error leyendo superadmins:", e?.message || e);
  }
  _superadmins = { emails, exp: Date.now() + TTL };
  return emails;
}

export async function companyFromToken(bearer, actingCompanyId) {
  if (!ensureApp()) return null;
  const decoded = await getAuth().verifyIdToken(bearer);
  const email = (decoded.email || "").toLowerCase();
  if (!email) return null;
  const domain = email.split("@").pop();

  // Superadmin: puede actuar como cualquier empresa (header X-Company-Id o ?company=).
  const isSuperadmin = (await superadminEmails()).has(email);
  if (isSuperadmin) {
    let company = null;
    if (actingCompanyId) company = await companyById(String(actingCompanyId).toLowerCase());
    if (!company) company = (await companyByDomain(domain)) || (await companyById(DEFAULT_COMPANY_ID));
    return company ? { ...company, isSuperadmin: true } : null;
  }

  let company = await companyByDomain(domain);
  if (!company) {
    // Dominio no registrado: mapeo explícito users/{uid}.company_id (lo persiste
    // el backend al crear la primera solicitud del usuario).
    try {
      const udoc = await getFirestore().collection("users").doc(decoded.uid).get();
      const cid = udoc.exists ? udoc.data().company_id : null;
      if (cid) company = await companyById(cid);
    } catch { /* sin mapeo */ }
  }
  if (company && company.activo === false) return null;
  return company;
}

function extractToken(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  if (typeof req.query?.auth === "string" && req.query.auth) return req.query.auth;
  return "";
}

// Middleware Express: setea req.company (doc de la empresa del caller; si es
// superadmin, la empresa "activa" del header X-Company-Id o ?company=).
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  const acting = req.headers["x-company-id"] || req.query?.company || "";
  if (!token) {
    if (ENFORCE) return res.status(401).json({ error: "Falta token" });
    console.warn(`AUTH soft-mode: request sin token (${req.method} ${req.path}) — contexto ${DEFAULT_COMPANY_ID}`);
    req.company = DEFAULT_COMPANY;
    return next();
  }
  companyFromToken(token, acting)
    .then((company) => {
      if (!company) {
        if (ENFORCE) return res.status(403).json({ error: "Empresa no habilitada" });
        req.company = DEFAULT_COMPANY;
        return next();
      }
      req.company = company;
      next();
    })
    .catch((e) => {
      if (ENFORCE) return res.status(401).json({ error: "Token inválido" });
      console.warn("AUTH soft-mode: token inválido —", e?.message || e);
      req.company = DEFAULT_COMPANY;
      next();
    });
}

// Brand plano para el prompt del agente.
export function brandOf(company) {
  const c = company || DEFAULT_COMPANY;
  const b = c.branding || {};
  return {
    nombre: c.nombre || "Davivienda",
    colorPrimario: b.color_primario || "#DA291C",
    colorSecundario: b.color_acento || "#FFD700",
    fuenteTitulos: b.fuente_titulos || "Montserrat",
    fuenteTexto: b.fuente_texto || "Open Sans",
    logoUrl: b.logo_url || null,
  };
}
