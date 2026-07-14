"""
Backfill de `company_id` en docs legacy (multi-tenant).

Todo doc de mallas/solicitudes/jobs sin company_id pertenece a Davivienda
(la plataforma nació single-tenant). Idempotente; batches de 400.

    python3 scripts/backfill_company_id.py --dry-run
    python3 scripts/backfill_company_id.py
"""
import argparse
import sys

import firebase_admin
from firebase_admin import credentials, firestore

COLLECTIONS = ["mallas", "solicitudes", "jobs"]
DEFAULT_COMPANY_ID = "davivienda"
BATCH_SIZE = 400


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="davivienda-elearning")
    parser.add_argument("--company", default=DEFAULT_COMPANY_ID)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not firebase_admin._apps:
        firebase_admin.initialize_app(
            credentials.ApplicationDefault(), {"projectId": args.project}
        )
    db = firestore.client()

    for coll in COLLECTIONS:
        total = 0
        pending = 0
        batch = db.batch()
        in_batch = 0
        for snap in db.collection(coll).stream():
            total += 1
            data = snap.to_dict() or {}
            if data.get("company_id"):
                continue
            pending += 1
            if args.dry_run:
                continue
            batch.update(snap.reference, {"company_id": args.company})
            in_batch += 1
            if in_batch >= BATCH_SIZE:
                batch.commit()
                batch = db.batch()
                in_batch = 0
        if not args.dry_run and in_batch:
            batch.commit()
        verbo = "faltan backfill" if args.dry_run else "backfilleados"
        print(f"{coll}: {total} docs, {pending} {verbo} → company_id={args.company}")

    if args.dry_run:
        print("(dry-run: no se escribió nada)")


if __name__ == "__main__":
    sys.exit(main())
