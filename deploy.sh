#!/usr/bin/env bash
# =====================================================================
# Pult Uz — DEPLOY skripti (server-authoritative versiya)
# Ishga tushirish:  bash deploy.sh
# Talab: Node 18+, Firebase CLI (npm i -g firebase-tools), loyihaga kirish.
# =====================================================================
set -euo pipefail

PROJECT="han-lazer"   # kerak bo'lsa o'zgartiring
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

echo "==> Firebase CLI tekshiruvi"
if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI yo'q. O'rnating:  npm i -g firebase-tools"; exit 1
fi

echo "==> Login holati (kerak bo'lsa brauzer ochiladi)"
firebase login

echo "==> Loyiha: $PROJECT"
firebase use "$PROJECT"

echo "==> (Tavsiya) Firestore backup"
read -r -p "Backup olamizmi? (gcloud kerak) [y/N] " ans
if [[ "${ans:-N}" =~ ^[Yy]$ ]]; then
  gcloud firestore export "gs://${PROJECT}.appspot.com/backups/$(date +%F-%H%M)" --project "$PROJECT"
fi

echo "==> Functions build"
( cd functions && npm install && npm run build )

echo "==> Web build"
( cd web && npm install && npm run build )

echo "==> DEPLOY (functions + firestore rules + hosting + storage)"
firebase deploy --project "$PROJECT"

echo ""
echo "✅ Deploy tugadi."
echo "Keyingi (ixtiyoriy) qadam — eski Timestamp yozuvlarni raqamga o'tkazish:"
echo "  1) Service account kalit: Firebase Console -> Project settings -> Service accounts -> Generate key -> sa.json"
echo "  2) DRY-RUN:  cd functions && GOOGLE_APPLICATION_CREDENTIALS=../sa.json GCLOUD_PROJECT=$PROJECT node scripts/migrateTimestamps.js"
echo "  3) APPLY:    GOOGLE_APPLICATION_CREDENTIALS=../sa.json GCLOUD_PROJECT=$PROJECT APPLY=1 node scripts/migrateTimestamps.js"
