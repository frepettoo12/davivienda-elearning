"""
Seed de la colección `companies` (multi-tenant).

Crea/actualiza companies/davivienda con los valores que hasta ahora estaban
hardcodeados en el código (branding, dominios, prompts, defaults de voz/avatar).
También migra el shell SCORM global (config/scorm.shell_html) al doc de la company.

Idempotente: usa set(merge=True). Correr local con ADC:
    python3 scripts/seed_companies.py [--project davivienda-elearning] [--dry-run]

Para dar de alta otra empresa, copiar el bloque COMPANIES y ajustar valores
(o pasar un JSON con --file, ver abajo).
"""
import argparse
import json
import sys

import firebase_admin
from firebase_admin import credentials, firestore

COMPANIES = {
    "davivienda": {
        "nombre": "Davivienda",
        "activo": True,
        # Cualquier dominio acá = miembro de la empresa (resuelve el tenant al loguear).
        "dominios": ["davivienda.com", "alkemy.org"],
        # Subset con rol "learning" (staff del dashboard). El resto de dominios
        # de la empresa (si los hubiera) serían solicitantes.
        "learning_domains": ["davivienda.com", "alkemy.org"],
        # Contexto para prompts GPT (reemplaza "Davivienda (banco colombiano)").
        "industria": "banca colombiana",
        "descripcion_prompt": "banco colombiano líder en servicios financieros",
        "branding": {
            "nombre_display": "Davivienda E-Learning",
            "color_primario": "#DA291C",
            "color_acento": "#FFD700",
            "logo_url": None,
            "fuente_titulos": "Montserrat",
            "fuente_texto": "Open Sans",
        },
        "email": {
            "from_name": "Davivienda E-Learning",
        },
        # Base del frontend para links en emails (None = usa APP_URL global).
        "app_url": None,
        "areas": [
            "Banca Personal", "Banca Empresarial", "Banca Corporativa",
            "Operaciones", "Tecnología", "Riesgos", "Cumplimiento",
            "Talento Humano", "Mercadeo", "Jurídica", "Auditoría", "Otra",
        ],
        "lms_nombre": "Territorium",
        "defaults": {
            "voice_id": "JddqVF50ZSIR7SRbJE6u",  # valeria
            "avatar_id": "Hada_LivelyGestures_Front_public",  # hada
            "passing_score": 70,
        },
        "scorm": {
            "shell_html": "",  # se migra desde config/scorm si existe
            "manifest_identifier": "davivienda_scorm",
        },
    },
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="davivienda-elearning")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--file", help="JSON extra con {company_id: {...}} para sumar/pisar")
    args = parser.parse_args()

    companies = dict(COMPANIES)
    if args.file:
        with open(args.file) as f:
            companies.update(json.load(f))

    if not firebase_admin._apps:
        firebase_admin.initialize_app(
            credentials.ApplicationDefault(), {"projectId": args.project}
        )
    db = firestore.client()

    # Migrar shell SCORM global existente al doc de davivienda (solo si no lo tiene).
    legacy_shell = ""
    cfg = db.collection("config").document("scorm").get()
    if cfg.exists:
        legacy_shell = (cfg.to_dict() or {}).get("shell_html", "") or ""
    if legacy_shell and not companies["davivienda"]["scorm"]["shell_html"]:
        existing = db.collection("companies").document("davivienda").get()
        already = ""
        if existing.exists:
            already = ((existing.to_dict() or {}).get("scorm") or {}).get("shell_html", "") or ""
        if not already:
            companies["davivienda"]["scorm"]["shell_html"] = legacy_shell
            print(f"→ Migrando config/scorm.shell_html ({len(legacy_shell)} chars) a companies/davivienda")

    for cid, data in companies.items():
        if args.dry_run:
            print(f"[dry-run] companies/{cid}:")
            print(json.dumps({**data, "scorm": {**data["scorm"], "shell_html": f"<{len(data['scorm']['shell_html'])} chars>"}}, indent=2, ensure_ascii=False))
            continue
        data["updated_at"] = firestore.SERVER_TIMESTAMP
        db.collection("companies").document(cid).set(data, merge=True)
        print(f"✓ companies/{cid} seeded ({data['nombre']})")

    if args.dry_run:
        print("(dry-run: no se escribió nada)")


if __name__ == "__main__":
    sys.exit(main())
