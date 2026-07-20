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
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

// Seguro por default: si AUTH_ENFORCE no está seteado, en producción se exige
// token (opt-out explícito con AUTH_ENFORCE=false); en local sigue permisivo.
const ENFORCE = process.env.AUTH_ENFORCE
  ? /^(1|true|yes)$/i.test(process.env.AUTH_ENFORCE)
  : process.env.NODE_ENV === "production";

// El projectId es necesario para verifyIdToken (valida el `aud`) y Firestore.
// ADC no siempre lo detecta en local ("Unable to detect a Project Id") → lo
// seteamos explícito por env, con default al proyecto del backend.
const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  "davivienda-elearning";

let _initTried = false;
function ensureApp() {
  if (getApps().length) return true;
  if (_initTried) return getApps().length > 0;
  _initTried = true;
  try {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
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
  try {
    if (!ensureApp()) return _superadmins.emails;
    const snap = await getFirestore().collection("config").doc("platform").get();
    const emails = snap.exists
      ? new Set((snap.data().superadmin_emails || []).map((e) => String(e).trim().toLowerCase()))
      : new Set();
    _superadmins = { emails, exp: Date.now() + TTL };
    return emails;
  } catch (e) {
    // Falla transitoria: último valor conocido, sin cachear el error.
    console.error("Error leyendo superadmins:", e?.message || e);
    return _superadmins.emails;
  }
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

// ── Facturación de IA (BYOK / plataforma con budget) ──────────────────────
// Key de la plataforma (modo "platform"): separada de ANTHROPIC_API_KEY para no
// forzar API mode en dev (donde queremos la sesión Max si no hay billing).
const PLATFORM_KEY = process.env.PLATFORM_ANTHROPIC_API_KEY || "";

function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Decide qué API key usar y si se puede correr (budget). Aplica reset mensual
// implícito: si el período guardado cambió, el gasto vigente cuenta como 0.
export function resolveBilling(company) {
  const b = (company && company.ai_billing) || {};
  const mode = b.mode || "max_local";
  const period = currentPeriod();
  const spent = b.period === period ? Number(b.spent_usd) || 0 : 0;
  const budget = Number(b.budget_usd) || 0;

  if (mode === "byok") {
    const key = b.anthropic_api_key || "";
    return { mode, apiKey: key, budget, spent, ok: !!key,
      message: key ? "" : "Falta la API key de Anthropic (BYOK). Cargala en Configuración → IA." };
  }
  if (mode === "platform") {
    if (!PLATFORM_KEY)
      return { mode, apiKey: "", budget, spent, ok: false, message: "La plataforma aún no tiene API key configurada." };
    if (budget > 0 && spent >= budget)
      return { mode, apiKey: "", budget, spent, ok: false,
        message: `Presupuesto de IA agotado: US$${spent.toFixed(2)} de US$${budget.toFixed(2)} este mes.` };
    return { mode, apiKey: PLATFORM_KEY, budget, spent, ok: true, message: "" };
  }
  // max_local (dev): sin key → sesión Max del CLI logueado.
  return { mode: "max_local", apiKey: "", budget, spent, ok: true, message: "" };
}

// Acumula el gasto del run en companies/{id}.ai_billing (transacción con reset
// mensual). Se llama tras cada corrida que consumió tokens.
export async function addAiSpend(companyId, amount) {
  if (!ensureApp() || !companyId || !(amount > 0)) return;
  const period = currentPeriod();
  try {
    const ref = getFirestore().collection("companies").doc(companyId);
    await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const b = (snap.exists && snap.data().ai_billing) || {};
      const base = b.period === period ? Number(b.spent_usd) || 0 : 0;
      tx.set(ref, { ai_billing: {
        spent_usd: Math.round((base + amount) * 1e6) / 1e6,
        period, last_run_at: new Date().toISOString(),
      } }, { merge: true });
    });
    idCache.delete(companyId); // el próximo budget check re-lee el gasto fresco
  } catch (e) { console.error("addAiSpend:", e?.message || e); }
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
