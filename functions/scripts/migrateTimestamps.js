/**
 * MIGRATSIYA: createdAt / updatedAt va boshqa Timestamp maydonlarni RAQAM (ms) ga aylantirish.
 * =========================================================================================
 * Nega kerak: ilova vaqtni `Date.now()` (raqam) sifatida saqlaydi va hisobotlar raqam
 * bo'yicha filtrlaydi. Eski yozuvlarda ba'zi maydonlar Firestore `Timestamp` bo'lishi
 * mumkin -> ular sana-oraliq hisobotlarida ko'rinmaydi. Bu skript ularni raqamga keltiradi.
 *
 * XAVFSIZ: faqat Timestamp turidagi top-level maydonlarni o'zgartiradi (ms ga). Hujjatlarni
 * O'CHIRMAYDI, boshqa maydonlarga tegmaydi. Idempotent (raqam bo'lib bo'lganlarini o'tkazib yuboradi).
 *
 * --------- ISHGA TUSHIRISH ---------
 * 1) Service account kalitini oling: Firebase Console -> Project settings -> Service accounts
 *    -> "Generate new private key" -> sa.json
 * 2) Avval QURUQ (dry-run) — hech narsa yozmaydi, faqat hisobot:
 *      cd functions
 *      GOOGLE_APPLICATION_CREDENTIALS=../sa.json GCLOUD_PROJECT=han-biznes-boshqaruv-1a41f \
 *        node scripts/migrateTimestamps.js
 * 3) Natija to'g'ri ko'rinsa, HAQIQIY yozish (APPLY=1):
 *      GOOGLE_APPLICATION_CREDENTIALS=../sa.json GCLOUD_PROJECT=han-biznes-boshqaruv-1a41f \
 *        APPLY=1 node scripts/migrateTimestamps.js
 *
 * Emulyatorda sinash uchun: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 qo'shing.
 */
const admin = require("firebase-admin");

// Har bir shop ostidagi tekshiriladigan kolleksiyalar
const SHOP_COLLECTIONS = [
  "sales", "purchases", "returns",
  "cash_transactions", "stock_movements",
  "supplier_payments", "customer_payments",
  "expenses", "products", "customers", "suppliers", "audit_logs",
];
// Root (do'kondan tashqari) kolleksiyalar
const ROOT_COLLECTIONS = ["users", "owner_requests", "staff_requests"];

function toMillisIfTimestamp(v) {
  // admin.firestore.Timestamp -> .toMillis(); aks holda null (o'zgartirilmaydi)
  if (v && typeof v.toMillis === "function") return v.toMillis();
  return null;
}

/** Bitta hujjat uchun: faqat Timestamp bo'lgan top-level maydonlarni ms ga aylantiradigan patch qaytaradi (yoki null). */
function buildPatch(data) {
  const patch = {};
  let changed = false;
  for (const [k, v] of Object.entries(data || {})) {
    const ms = toMillisIfTimestamp(v);
    if (ms !== null) { patch[k] = ms; changed = true; }
  }
  return changed ? patch : null;
}

/**
 * @param db Firestore instance (admin yoki emulyator)
 * @param opts { dryRun: boolean, log?: (msg)=>void }
 * @returns { scanned, changed, byCollection }
 */
async function migrateTimestamps(db, opts = {}) {
  const dryRun = opts.dryRun !== false; // default: dry-run
  const log = opts.log || (() => {});
  let scanned = 0;
  let changed = 0;
  const byCollection = {};

  async function processCollection(collRef, label) {
    const snap = await collRef.get();
    if (snap.empty) return;
    let batch = db.batch();
    let inBatch = 0;
    let collChanged = 0;
    for (const doc of snap.docs) {
      scanned++;
      const patch = buildPatch(doc.data());
      if (!patch) continue;
      collChanged++;
      changed++;
      if (!dryRun) {
        batch.set(doc.ref, patch, { merge: true });
        inBatch++;
        if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
      }
    }
    if (!dryRun && inBatch > 0) await batch.commit();
    if (collChanged > 0) {
      byCollection[label] = (byCollection[label] || 0) + collChanged;
      log(`  ${label}: ${collChanged} ta hujjat ${dryRun ? "o'zgartiriladi (dry-run)" : "o'zgartirildi"}`);
    }
  }

  // Root kolleksiyalar
  for (const name of ROOT_COLLECTIONS) {
    await processCollection(db.collection(name), name);
  }

  // Har bir shop ostidagi kolleksiyalar
  const shopsSnap = await db.collection("shops").get();
  log(`Shoplar soni: ${shopsSnap.size}`);
  for (const shopDoc of shopsSnap.docs) {
    for (const name of SHOP_COLLECTIONS) {
      await processCollection(
        db.collection(`shops/${shopDoc.id}/${name}`),
        `shops/${shopDoc.id}/${name}`
      );
    }
  }

  return { scanned, changed, byCollection };
}

module.exports = { migrateTimestamps, buildPatch, toMillisIfTimestamp };

// To'g'ridan-to'g'ri ishga tushirilganda (test emas):
if (require.main === module) {
  (async () => {
    const dryRun = process.env.APPLY !== "1";
    const projectId =
      process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined;

    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId,
        credential: admin.credential.applicationDefault(),
      });
    }
    const db = admin.firestore();

    console.log("=================================================");
    console.log(`Migratsiya: createdAt/updatedAt Timestamp -> raqam (ms)`);
    console.log(`Loyiha: ${projectId || "(ADC dan)"}`);
    console.log(`Rejim: ${dryRun ? "DRY-RUN (hech narsa yozilmaydi)" : "APPLY (HAQIQIY yozish)"}`);
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      console.log(`Emulyator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
    }
    console.log("=================================================");

    const res = await migrateTimestamps(db, { dryRun, log: (m) => console.log(m) });

    console.log("-------------------------------------------------");
    console.log(`Tekshirildi: ${res.scanned} hujjat`);
    console.log(`${dryRun ? "O'zgartiriladi" : "O'zgartirildi"}: ${res.changed} hujjat`);
    if (dryRun && res.changed > 0) {
      console.log(`\n➡  Haqiqiy yozish uchun qayta ishga tushiring: APPLY=1 node scripts/migrateTimestamps.js`);
    }
    console.log("Tayyor.");
    process.exit(0);
  })().catch((e) => {
    console.error("Migratsiya xatosi:", e);
    process.exit(1);
  });
}
