import axios from "axios";
import FormData from "form-data";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { createHash, randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  ensureTelegramDefaultSettings,
  formatMoneyUZS,
  getTelegramSettings,
  linkCustomerTelegram,
  tgSendMessage,
  tgSendDocument,
  getTelegramToken,
  getShopTelegramPrivate,
  getShopTelegramSecret,
  getShopTelegramToken,
} from "./telegram";

const DEFAULT_STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.STORAGE_BUCKET ||
  "han-lazer.firebasestorage.app";

admin.initializeApp({ storageBucket: DEFAULT_STORAGE_BUCKET });

// =========================
// SERVER-AUTHORITATIVE LEDGER (ombor/pul/qarz amallari) — callable funksiyalar
// =========================
export * from "./ledger";

// =========================
// PDF generation
// =========================
function pdfEscape(s: string): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function buildSimplePdf(params: { title: string; lines: string[] }): Buffer {
  const { title, lines } = params;
  // Page setup
  const fontSize = 12;
  const left = 50;
  const top = 800;
  const lineH = 16;

  const contentLines: string[] = [];
  contentLines.push("BT");
  contentLines.push(`/F1 ${fontSize} Tf`);
  contentLines.push(`${left} ${top} Td`);
  contentLines.push(`(${pdfEscape(title)}) Tj`);
  contentLines.push(`0 -${lineH} Td`);
  contentLines.push(`(${pdfEscape(" ")}) Tj`);

  let y = top - lineH * 2;
  for (const ln of lines) {
    if (y < 60) break; // single-page minimal
    contentLines.push(`0 -${lineH} Td`);
    contentLines.push(`(${pdfEscape(ln)}) Tj`);
    y -= lineH;
  }
  contentLines.push("ET");
  const contentStream = contentLines.join("\n") + "\n";

  const objects: string[] = [];
  const offsets: number[] = [];
  const pushObj = (obj: string) => {
    offsets.push(Buffer.byteLength(objects.join(""), "utf8") + Buffer.byteLength(header, "utf8"));
    objects.push(obj);
  };

  const header = "%PDF-1.4\n";

  // 1) Catalog
  pushObj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  // 2) Pages
  pushObj("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  // 3) Page
  pushObj(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
  );
  // 4) Font
  pushObj("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  // 5) Contents
  const contentLen = Buffer.byteLength(contentStream, "utf8");
  pushObj(`5 0 obj\n<< /Length ${contentLen} >>\nstream\n${contentStream}endstream\nendobj\n`);

  // Build xref
  const body = objects.join("");
  const xrefStart = Buffer.byteLength(header + body, "utf8");
  let xref = "xref\n0 6\n";
  xref += "0000000000 65535 f \n";
  for (let i = 0; i < offsets.length; i++) {
    const off = offsets[i];
    xref += String(off).padStart(10, "0") + " 00000 n \n";
  }
  const trailer =
    "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" +
    xrefStart +
    "\n%%EOF\n";
  return Buffer.from(header + body + xref + trailer, "utf8");
}

async function buildPrettyPdf(params: {
  title: string;
  shopName?: string;
  periodLabel?: string;
  sections: Array<
    | { kind: "kv"; heading: string; rows: Array<[string, string]> }
    | { kind: "table"; heading: string; headers: string[]; rows: string[][] }
  >;
}): Promise<Buffer> {
  // Use pdfkit if available; fallback to minimal PDF.
  let PDFDoc: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    PDFDoc = require("pdfkit");
  } catch {
    PDFDoc = null;
  }

  if (!PDFDoc) {
    const flat: string[] = [];
    if (params.shopName) flat.push(`Do'kon: ${params.shopName}`);
    if (params.periodLabel) flat.push(`Davr: ${params.periodLabel}`);
    flat.push(" ");
    for (const s of params.sections) {
      flat.push(s.heading);
      if (s.kind === "kv") {
        for (const [k, v] of s.rows) flat.push(`${k}: ${v}`);
      } else {
        flat.push(s.headers.join(" | "));
        for (const r of s.rows) flat.push(r.join(" | "));
      }
      flat.push(" ");
    }
    return buildSimplePdf({ title: params.title, lines: flat });
  }

  const doc = new PDFDoc({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const logoPath = path.join(__dirname, "assets", "logo.png");
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 40, 30, { width: 70 });
    } catch {
      // ignore logo errors
    }
  }

  doc
    .fontSize(20)
    .text(params.title, 0, 35, { align: "center" })
    .moveDown(0.5);

  if (params.shopName) {
    doc.fontSize(12).text(`Do'kon: ${params.shopName}`, { align: "center" });
  }
  if (params.periodLabel) {
    doc.fontSize(12).text(`Davr: ${params.periodLabel}`, { align: "center" });
  }

  doc.moveDown(1);

  const pageW = doc.page.width;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;

  function drawHeading(text: string) {
    doc.moveDown(0.5);
    doc.fontSize(13).text(text, { underline: true });
    doc.moveDown(0.3);
  }

  function drawKv(rows: Array<[string, string]>) {
    const startX = left;
    const col1 = 220;
    for (const [k, v] of rows) {
      const y = doc.y;
      doc.fontSize(11).text(k, startX, y, { width: col1 });
      doc.fontSize(11).text(v, startX + col1, y, { width: right - (startX + col1) });
      doc.moveDown(0.2);
    }
  }

  function drawTable(headers: string[], rows: string[][]) {
    const tableX = left;
    const tableW = right - left;
    const cols = headers.length;
    const colW = tableW / cols;

    const headerY = doc.y;
    // Header background line
    doc.save();
    doc.rect(tableX, headerY - 2, tableW, 20).fillOpacity(0.06).fill();
    doc.restore();

    doc.fontSize(10);
    for (let i = 0; i < cols; i++) {
      doc.text(headers[i], tableX + i * colW + 4, headerY, { width: colW - 8 });
    }
    doc.moveDown(1.1);
    doc.fillOpacity(1);

    doc.fontSize(10);
    for (const r of rows) {
      const y = doc.y;
      for (let i = 0; i < cols; i++) {
        doc.text(String(r[i] ?? ""), tableX + i * colW + 4, y, { width: colW - 8 });
      }
      doc.moveDown(0.8);
      // light row separator
      doc.save();
      doc.strokeOpacity(0.1);
      doc.moveTo(tableX, doc.y - 2).lineTo(tableX + tableW, doc.y - 2).stroke();
      doc.restore();
    }
  }

  for (const s of params.sections) {
    drawHeading(s.heading);
    if (s.kind === "kv") {
      drawKv(s.rows);
    } else {
      drawTable(s.headers, s.rows);
    }
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  return Buffer.concat(chunks);
}

// Firestore server timestamp helper (backend time)
const nowTs = () => admin.firestore.FieldValue.serverTimestamp();

const db = admin.firestore();
// Super admin: eski loyihadagi UID (moslik uchun) YOKI tasdiqlangan email.
// Email bo'yicha aniqlash — foydalanuvchi shu email bilan login qilishi bilan
// darhol super admin bo'ladi (UID qidirish shart emas). email_verified talab
// qilinadi — aks holda birov o'zganing emailini soxta ro'yxatdan o'tkaza olmaydi.
const SUPER_ADMIN_UID = "M8WKl0BlBnPanTU6Hh60SumTpQu1";
const SUPER_ADMIN_EMAIL = "hasanboyqobulov7@gmail.com";

/** context.auth asosida super admin ekanini aniqlaydi (UID yoki tasdiqlangan email). */
function isSuperAdminCtx(context: functions.https.CallableContext): boolean {
  const uid = context.auth?.uid || "";
  const token: any = context.auth?.token || {};
  const email = String(token.email || "").toLowerCase();
  const verified = token.email_verified === true;
  return uid === SUPER_ADMIN_UID || (email === SUPER_ADMIN_EMAIL && verified);
}

function requireSuperAdmin(uid: string) {
  if (uid !== SUPER_ADMIN_UID) {
    throw new functions.https.HttpsError("permission-denied", "SuperAdmin only");
  }
}
/** context bilan super admin talab qiladi (email yoki UID). */
function requireSuperAdminCtx(context: functions.https.CallableContext) {
  if (!isSuperAdminCtx(context)) {
    throw new functions.https.HttpsError("permission-denied", "SuperAdmin only");
  }
}


function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hashAdminPin(params: { shopId: string; pin: string }): string {
  const pin = String(params.pin ?? "").trim();
  const shopId = String(params.shopId ?? "").trim();
  return sha256Hex(`ali-biznes|${shopId}|${pin}`);
}

/**
 * Callable: verifyAdminPin
 * Input: { shopId: string, pin: string }
 * Reads: shops/{shopId}/settings/security.adminPinHash
 * Returns: { ok: boolean }
 */
export const verifyAdminPin = functions.https.onCall(async (data, context) => {
  const shopId = String(data?.shopId || "default");
  const pin = String(data?.pin || "");

  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required");
  }

  // Validate user belongs to shop
  const uid = context.auth.uid;
  const userSnap = await db.collection("users").doc(uid).get();
  const userShopId = userSnap.exists ? String(userSnap.get("shopId") || "") : "";
  if (!userShopId || userShopId !== shopId) {
    throw new functions.https.HttpsError("permission-denied", "Shop mismatch");
  }

  const secRef = db.doc(`shops/${shopId}/settings/security`);
  const secSnap = await secRef.get();
  const hash = secSnap.exists ? String(secSnap.get("adminPinHash") || "") : "";


  if (!hash) return { ok: false };

  const ok = hashAdminPin({ shopId, pin }) === hash;
  if (!ok) return { ok: false };

  // Grant short-lived custom claim used by Firestore rules (PIN gating)
  const TTL_MIN = 5;
  const pinVerifiedUntil = Date.now() + TTL_MIN * 60 * 1000;

  const userRecord = await admin.auth().getUser(uid);
  const prev = (userRecord.customClaims ?? {}) as Record<string, any>;
  await admin.auth().setCustomUserClaims(uid, {
    ...prev,
    // FIX: rules `pinVerified == true` ni tekshiradi — avval bu claim o'rnatilmasdi.
    pinVerified: true,
    pinShopId: shopId,
    pinVerifiedUntil,
  });

  return { ok: true, pinVerifiedUntil };
});

// =========================================
// Staff Approve (SAAS / multi-tenant)
// =========================================

/**
 * Callable: approveStaff
 * Input: { requestId: string }
 * Server-side ONLY:
 * - reads staff_requests/{id}
 * - verifies caller is admin of that shop (or super admin)
 * - updates users/{staffUid} => { role: 'cashier', shopId }
 * - marks request as approved
 */

// =========================================
// SUPER ADMIN: Create shop / approve owner / subscription
// =========================================
export const createShop = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");
  const callerUid = context.auth.uid;
  requireSuperAdminCtx(context);

  const name = String(data?.name || "").trim();
  const ownerUid = String(data?.ownerUid || "").trim();

  if (!name) throw new functions.https.HttpsError("invalid-argument", "name required");

  const shopRef = db.collection("shops").doc();
  const shopId = shopRef.id;

  await shopRef.set({
    name,
    ownerUid: ownerUid || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: callerUid,
    status: "active",
    subscription: {
      type: "trial",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  });

  if (ownerUid) {
    await db.collection("users").doc(ownerUid).set(
      {
        role: "admin",
        shopId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return { ok: true, shopId };
});

export const approveOwnerRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");
  const callerUid = context.auth.uid;
  requireSuperAdminCtx(context);

  const requestId = String(data?.requestId || "").trim();
  const providedShopId = String(data?.shopId || "").trim();

  if (!requestId) throw new functions.https.HttpsError("invalid-argument", "requestId required");

  const reqRef = db.collection("owner_requests").doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) throw new functions.https.HttpsError("not-found", "request not found");

  const req = reqSnap.data() as any;
  if (String(req.status || "pending") !== "pending") return { ok: true };

  const uid = String(req.uid || "").trim();
  const name = String(req.name || "").trim();
  if (!uid) throw new functions.https.HttpsError("invalid-argument", "uid missing");

  const shopId = providedShopId || db.collection("shops").doc().id;
  const shopRef = db.collection("shops").doc(shopId);

  await db.runTransaction(async (trx) => {
    const shopSnap = await trx.get(shopRef);
    if (!shopSnap.exists) {
      trx.set(shopRef, {
        name: name || "Shop",
        ownerUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: callerUid,
        status: "active",
        subscription: {
          type: "trial",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    } else {
      trx.set(shopRef, { ownerUid: uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    trx.set(
      db.collection("users").doc(uid),
      { role: "admin", shopId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    trx.set(
      reqRef,
      {
        status: "approved",
        shopId,
        approvedBy: callerUid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { ok: true, shopId };
});

export const setSubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");
  const callerUid = context.auth.uid;
  requireSuperAdminCtx(context);

  const shopId = String(data?.shopId || "").trim();
  const type = String(data?.type || "").trim(); // monthly | lifetime
  const months = Number(data?.months || 1);

  if (!shopId) throw new functions.https.HttpsError("invalid-argument", "shopId required");
  if (type !== "monthly" && type !== "lifetime") {
    throw new functions.https.HttpsError("invalid-argument", "type must be monthly|lifetime");
  }

  const now = Date.now();
  const expiresAt = type === "lifetime" ? null : now + months * 30 * 24 * 60 * 60 * 1000;

  await db
    .collection("shops")
    .doc(shopId)
    .set(
      {
        subscription: {
          type,
          months: type === "monthly" ? months : null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return { ok: true };
});

export const approveStaff = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required");
  }

  const callerUid = context.auth.uid;
  const requestId = String(data?.requestId || "").trim();
  if (!requestId) {
    throw new functions.https.HttpsError("invalid-argument", "requestId required");
  }
  // Tasdiqlashda rol tanlash mumkin: sotuvchi (cashier), omborchi (warehouse), faqat ko'ruvchi (viewer).
  const STAFF_ROLES = ["cashier", "warehouse", "viewer"];
  const requestedRole = String(data?.role || "cashier").trim();
  if (!STAFF_ROLES.includes(requestedRole)) {
    throw new functions.https.HttpsError("invalid-argument", "Noto'g'ri rol");
  }
  const isSuperAdmin = isSuperAdminCtx(context);

  const callerSnap = await db.collection("users").doc(callerUid).get();
  const callerRole = callerSnap.exists ? String(callerSnap.get("role") || "") : "";
  const callerShopId = callerSnap.exists ? String(callerSnap.get("shopId") || "") : "";

  if (!isSuperAdmin && callerRole !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin required");
  }

  const reqRef = db.collection("staff_requests").doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Request not found");
  }

  const req = reqSnap.data() as any;
  const targetShopId = String(req.shopId || "");
  const staffUid = String(req.uid || "");
  const status = String(req.status || "pending");

  if (!targetShopId || !staffUid) {
    throw new functions.https.HttpsError("failed-precondition", "Request missing shopId/uid");
  }

  if (!isSuperAdmin && callerShopId !== targetShopId) {
    throw new functions.https.HttpsError("permission-denied", "Shop mismatch");
  }

  if (status === "approved") {
    return { ok: true, already: true };
  }

  const staffRef = db.collection("users").doc(staffUid);

  await db.runTransaction(async (trx) => {
    const freshReq = await trx.get(reqRef);
    if (!freshReq.exists) throw new functions.https.HttpsError("not-found", "Request not found");
    const freshStatus = String((freshReq.data() as any)?.status || "pending");
    if (freshStatus === "approved") return;

    trx.set(
      staffRef,
      {
        role: requestedRole,
        shopId: targetShopId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    trx.set(
      reqRef,
      {
        status: "approved",
        approvedBy: callerUid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { ok: true };
});

/**
 * Callable: setStaffRole
 * Admin o'z do'konidagi hodimning rolini o'zgartiradi.
 * Input: { staffUid: string, role: "cashier" | "warehouse" | "viewer" }
 * Admin o'z rolini o'zgartira olmaydi (do'kon adminsiz qolmasligi uchun).
 */
export const setStaffRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required");
  }
  const callerUid = context.auth.uid;
  const staffUid = String(data?.staffUid || "").trim();
  const newRole = String(data?.role || "").trim();
  const STAFF_ROLES = ["cashier", "warehouse", "viewer"];
  if (!staffUid) throw new functions.https.HttpsError("invalid-argument", "staffUid required");
  if (!STAFF_ROLES.includes(newRole)) throw new functions.https.HttpsError("invalid-argument", "Noto'g'ri rol");
  if (staffUid === callerUid) throw new functions.https.HttpsError("failed-precondition", "O'z rolingizni o'zgartira olmaysiz");

  const isSuperAdmin = isSuperAdminCtx(context);
  const callerSnap = await db.collection("users").doc(callerUid).get();
  const callerRole = callerSnap.exists ? String(callerSnap.get("role") || "") : "";
  const callerShopId = callerSnap.exists ? String(callerSnap.get("shopId") || "") : "";
  if (!isSuperAdmin && callerRole !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin required");
  }

  const staffRef = db.collection("users").doc(staffUid);
  const staffSnap = await staffRef.get();
  if (!staffSnap.exists) throw new functions.https.HttpsError("not-found", "Hodim topilmadi");
  const staffShopId = String(staffSnap.get("shopId") || "");
  if (!isSuperAdmin && (!staffShopId || staffShopId !== callerShopId)) {
    throw new functions.https.HttpsError("permission-denied", "Shop mismatch");
  }
  if (String(staffSnap.get("role") || "") === "admin") {
    throw new functions.https.HttpsError("failed-precondition", "Admin rolini bu yerdan o'zgartirib bo'lmaydi");
  }

  await staffRef.set(
    { role: newRole, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  // audit-iz
  if (staffShopId) {
    await db.collection(`shops/${staffShopId}/audit_logs`).add({
      shopId: staffShopId,
      actorId: callerUid,
      createdBy: callerUid,
      role: isSuperAdmin ? "superadmin" : callerRole,
      actionType: "STAFF_ROLE_CHANGE",
      entityType: "user",
      entityId: staffUid,
      meta: { newRole },
      timestamp: Date.now(),
    });
  }

  return { ok: true };
});


// =========================================
// SUPER ADMIN: Connect per-shop Telegram Bot (SaaS)
// =========================================
function getProjectId(): string {
  const a = String(process.env.GCLOUD_PROJECT || "").trim();
  if (a) return a;
  try {
    const cfg = JSON.parse(String(process.env.FIREBASE_CONFIG || "{}"));
    const pid = String(cfg?.projectId || "").trim();
    if (pid) return pid;
  } catch {}
  return "";
}

/**
 * Callable: connectShopBot
 * Input: { shopId: string, botToken: string }
 *
 * ✅ SuperAdmin creates a bot for each shop, then connects it here.
 * This will:
 * - validate token via getMe
 * - set webhook -> telegramWebhook?shopId=...
 * - store token+secret in server-only doc: shops/{shopId}/private/telegram
 */
export const connectShopBot = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required");
  }
  const callerUid = context.auth.uid;
  requireSuperAdminCtx(context);

  const shopId = String(data?.shopId || "").trim();
  const botToken = String(data?.botToken || data?.token || "").trim();

  if (!shopId) {
    throw new functions.https.HttpsError("invalid-argument", "shopId required");
  }
  if (!botToken) {
    throw new functions.https.HttpsError("invalid-argument", "botToken required");
  }

  const shopSnap = await db.collection("shops").doc(shopId).get();
  if (!shopSnap.exists) {
      // Legacy fix: some shops may have subcollections but the parent doc is missing.
      // Create a minimal shop doc so telegram settings & queries work correctly.
      await db.collection("shops").doc(shopId).set(
        {
          name: "Legacy shop",
          legacy: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: callerUid || null,
        },
        { merge: true }
      );
    }

  // 1) Validate token
  const meResp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const meJson: any = await meResp.json().catch(() => ({}));
  if (!meResp.ok || meJson?.ok !== true) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid Telegram bot token");
  }

  const pid = getProjectId();
  if (!pid) {
    throw new functions.https.HttpsError("internal", "ProjectId not found");
  }

  const secret = randomBytes(16).toString("hex");
  const webhookUrl =
    `https://us-central1-${pid}.cloudfunctions.net/telegramWebhook?shopId=` +
    encodeURIComponent(shopId);

  // 2) Set webhook for THIS BOT (one bot -> one webhook)
  const whResp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message", "edited_message"],
    }),
  });
  const whJson: any = await whResp.json().catch(() => ({}));
  if (!whResp.ok || whJson?.ok !== true) {
    throw new functions.https.HttpsError(
      "internal",
      `Webhook set failed: ${JSON.stringify(whJson)}`
    );
  }

  // 3) Store token in server-only doc
  await db.doc(`shops/${shopId}/private/telegram`).set(
    {
      botToken,
      secret,
      botUsername: String(meJson?.result?.username || ""),
      botId: String(meJson?.result?.id || ""),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      linkedBy: callerUid,
    },
    { merge: true }
  );

  // Make sure settings exist
  await ensureTelegramDefaultSettings(db, shopId);

  return {
    ok: true,
    shopId,
    botUsername: String(meJson?.result?.username || ""),
    webhookUrl,
  };
});

// =========================================
// Telegram Bot: Link customer + sale notify
// =========================================

/**
 * HTTP Webhook: telegramWebhook
 * - Customer sends /start <shopId>
 * - Bot requests contact
 * - Customer shares contact => link by phone => stores telegramChatId inside customer doc
 */
// NOTE: uses Firebase Secret: TELEGRAM_TOKEN


// On-demand: Send a single customer's sales history as PDF to Telegram (owner or customer)
export const sendCustomerSalesPdf = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required");
  }

  const callerUid = context.auth.uid;
  const shopId = String(data?.shopId || "").trim();
  const customerId = String(data?.customerId || "").trim();
  const target = String(data?.target || "owner").trim(); // owner | customer | auto

  if (!shopId) throw new functions.https.HttpsError("invalid-argument", "shopId required");
  if (!customerId) throw new functions.https.HttpsError("invalid-argument", "customerId required");

  await requireShopAdmin(callerUid, shopId, isSuperAdminCtx(context));

  const token = await getShopTelegramToken(db, shopId);
  if (!token) throw new functions.https.HttpsError("failed-precondition", "Telegram token not configured");

  const cSnap = await db.doc(`shops/${shopId}/customers/${customerId}`).get();
  if (!cSnap.exists) throw new functions.https.HttpsError("not-found", "Customer not found");
  const c = (cSnap.data() as any) || {};

  const customerChatId = c.telegramChatId ? String(c.telegramChatId) : "";

  // NOTE: settings/ownerChatId should NOT block customer sending.
  // If admin selects "Mijoz" and customer has telegramChatId, we can send without ownerChatId.
  const settings = await getTelegramSettings(db, shopId);
  const ownerChatId = settings?.ownerChatId ? String(settings.ownerChatId) : "";

  let chatId = ownerChatId;
  let sentTo: "owner" | "customer" = "owner";

  if (target === "customer") {
    if (!customerChatId) throw new functions.https.HttpsError("failed-precondition", "Customer telegramChatId not linked");
    chatId = customerChatId;
    sentTo = "customer";
  } else if (target === "auto") {
    if (customerChatId && settings?.notifyCustomer !== false) {
      chatId = customerChatId;
      sentTo = "customer";
    } else {
      if (!ownerChatId) {
        throw new functions.https.HttpsError("failed-precondition", "ownerChatId not configured");
      }
      chatId = ownerChatId;
      sentTo = "owner";
    }
  } else {
    // explicit owner
    if (!ownerChatId) {
      throw new functions.https.HttpsError("failed-precondition", "ownerChatId not configured");
    }
    chatId = ownerChatId;
    sentTo = "owner";
  }

  // Date range
  const now = new Date();
  const fromStr = String(data?.from || "").trim();
  const toStr = String(data?.to || "").trim();

  const from = fromStr ? new Date(fromStr) : new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
  const to = toStr ? new Date(toStr) : now;
  const fromMs = from.getTime();
  const toMs = to.getTime() + 24 * 60 * 60 * 1000 - 1;

  function ymd(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  const periodLabel = `${ymd(from)} → ${ymd(to)}`;

  // Fetch sales (avoid extra Firestore composite indexes by filtering in-memory)
  const salesSnap = await db
    .collection(`shops/${shopId}/sales`)
    .where("customerId", "==", customerId)
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();

  const sales = salesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((s) => {
      const ts = Number(s.createdAt || 0);
      return ts >= fromMs && ts <= toMs;
    })
    .slice(0, 500);

  const total = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);

  const shopSnap = await db.doc(`shops/${shopId}`).get();
  const shopName = shopSnap.exists ? String((shopSnap.data() as any)?.name || "Shop") : "Shop";

  const rows = sales
    .slice()
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .map((s) => {
      const d = new Date(Number(s.createdAt || 0));
      const dateStr = d.toLocaleString("uz-UZ");
      const payType = String(s.paymentType || "") === "card" ? "Karta" : "Naqd";
      const note = s.note ? String(s.note).slice(0, 60) : "-";
      return [
        dateStr,
        String(s.saleNo || ""),
        `${formatMoneyUZS(Number(s.total || 0))} so'm`,
        `${formatMoneyUZS(Number(s.paidAmount || 0))} so'm`,
        `${formatMoneyUZS(Number(s.dueAmount || 0))} so'm`,
        payType,
        note,
      ];
    });

  const pdf = await buildPrettyPdf({
    title: "Mijoz savdo tarixi",
    shopName,
    periodLabel,
    sections: [
      {
        kind: "kv",
        heading: "Mijoz ma'lumotlari",
        rows: [
          ["Mijoz", String(c.name || "") || "NOMA'LUM"],
          ["Telefon", String(c.phone || "-")],
          ["Davr", periodLabel],
          ["Savdo (son)", `${sales.length} ta`],
          ["Jami savdo (davr)", `${formatMoneyUZS(total)} so'm`],
          // FIX: To'langan/Qarz endi mijozning HAQIQIY joriy balansidan olinadi (ilova bilan bir xil).
          // Avval faqat savdo paytidagi to'lov hisoblanardi -> alohida qarz to'lovlari (customer_payments)
          // hisobga olinmasdi va PDF'dagi qarz ilovadagidan farq qilardi.
          ["Jami olingan (umumiy)", `${formatMoneyUZS(Number(c.totalBought || 0))} so'm`],
          ["To'langan (umumiy)", `${formatMoneyUZS(Number(c.totalPaid || 0))} so'm`],
          ["Joriy qarz", `${formatMoneyUZS(Number(c.debt || 0))} so'm`],
        ],
      },
      {
        kind: "table",
        heading: "Savdolar",
        headers: ["Sana", "Chek", "Jami", "To'landi", "Qarz", "To'lov", "Izoh"],
        rows,
      },
    ],
  });

  const filename = `mijoz_savdo_${customerId}_${ymd(from)}-${ymd(to)}.pdf`;

  await tgSendDocument({
    token,
    chatId,
    filename,
    pdfBuffer: pdf,
    caption: `📄 Mijoz savdo tarixi\n${String(c.name || "") || "Mijoz"}\nDavr: ${periodLabel}`,
  });

  return { ok: true, sentTo, filename };
});

export const telegramWebhook = functions
  .https.onRequest(async (req, res): Promise<void> => {
  try {
    const forcedShopId = String((req as any)?.query?.shopId || "").trim();

    // Per-shop bot token (preferred). Fallback to old global token.
    let token = "";
    if (forcedShopId) {
      const priv = await getShopTelegramPrivate(db, forcedShopId);
      if (!priv?.botToken) {
        res.status(500).send("Shop Telegram bot is not connected yet");
        return;
      }
      // Optional security header from Telegram (setWebhook secret_token)
      const expectedSecret = String(priv.secret || "").trim();
      const gotSecret = String(
        req.header("x-telegram-bot-api-secret-token") ||
          req.header("X-Telegram-Bot-Api-Secret-Token") ||
          ""
      ).trim();
      // FIX: sarlavha yo'q bo'lsa ham rad etiladi (avval `&& gotSecret` bypass berardi).
      if (expectedSecret && gotSecret !== expectedSecret) {
        res.status(401).send("Invalid telegram secret token");
        return;
      }
      token = priv.botToken;
    } else {
      token = getTelegramToken();
    }

    if (!token) {
      res.status(500).send("TELEGRAM_BOT_TOKEN missing");
      return;
    }

    const update = (req.body || {}) as any;
    const message = update.message || update.edited_message;
    if (!message) {
      res.status(200).json({ ok: true });
      return;
    }

    const chatId = Number(message.chat?.id);
    const from = message.from || {};
    const text = String(message.text || "");

    // /start <shopId>
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const shopId = (forcedShopId || String(parts[1] || "default").trim() || "default").trim();

      await ensureTelegramDefaultSettings(db, shopId);
      await db.collection("telegram_sessions").doc(String(chatId)).set(
        {
          shopId,
          chatId: String(chatId),
          userId: String(from.id || ""),
          updatedAt: Date.now(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await tgSendMessage({
        token,
        chatId,
        text:
          "Assalomu alaykum! ✅\nSavdo xabarlari sizga kelishi uchun *telefon raqamingizni kontakt sifatida yuboring*.",
        parseMode: "Markdown",
        replyMarkup: {
          keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });

      res.status(200).json({ ok: true });
      return;
    }

    // Telegram commands (owner settings / debug)
    if (text === "/help" || text === "/me" || text === "/test" || text === "/owner_on" || text === "/owner_off" || text.startsWith("/owner ") || text === "/notify_on" || text === "/notify_off") {
      const telegramToken = token;
      if (!telegramToken) {
        console.warn("TELEGRAM_TOKEN secret is missing");
        res.status(200).send("OK"); return;
      }

      const chatIdStr = String(chatId);
      const reply = async (msg: string) => {
        await tgSendMessage({ token: telegramToken, chatId: chatIdStr, text: msg });
      };

      if (text === "/help") {
        await reply(
          "🤖 Hanprint bot buyruqlari:\n" +
            "• /me  — chatId ko‘rish\n" +
            "• /start <shopId> — shopga ulanish\n" +
            "• /owner_on — owner bildirishnoma yoqish\n" +
            "• /owner_off — owner bildirishnoma o‘chirish\n" +
            "• /notify_on — mijozga chek yuborish yoqish\n" +
            "• /notify_off — mijozga chek yuborish o‘chirish\n" +
            "• /test — test xabar"
        );
        res.status(200).send("OK"); return;
      }

      if (text === "/me") {
        await reply(`chatId: ${chatIdStr}`);
        res.status(200).send("OK"); return;
      }

      // ShopId: command param or existing session
      let shopIdFromCmd: string | null = null;
      if (text.startsWith("/owner ")) {
        const parts = text.split(" ").filter(Boolean);
        shopIdFromCmd = parts[1] ?? null;
      }

      const sessionDoc = await db.collection("telegram_sessions").doc(chatIdStr).get();
      const sessionShopId = sessionDoc.exists ? String(sessionDoc.data()?.shopId || "") : "";
      const shopId = forcedShopId || shopIdFromCmd || (sessionShopId || null);

      if (!shopId) {
        await reply("❗ Shop topilmadi. Avval /start <shopId> yozing. Masalan: /start ABC123");
        res.status(200).send("OK"); return;
      }

      await ensureTelegramDefaultSettings(db, shopId);
      const settingsRef = db.collection("shops").doc(shopId).collection("settings").doc("telegram");

      if (text === "/test") {
        await reply(`✅ Bot ishlayapti. Shop: ${shopId}`);
        res.status(200).send("OK"); return;
      }

      if (text === "/owner_off") {
        await settingsRef.set({ enabled: false }, { merge: true });
        await reply("⛔ Owner bildirishnoma o‘chirildi.");
        res.status(200).send("OK"); return;
      }

      if (text === "/owner_on" || text.startsWith("/owner ")) {
        await settingsRef.set({ enabled: true, ownerChatId: chatIdStr }, { merge: true });
        await reply(`✅ Owner ulandi.\nShop: ${shopId}\nEndi savdo yakunlanganda xabar keladi.`);
        res.status(200).send("OK"); return;
      }

      if (text === "/notify_on" || text === "/notify_off") {
        await settingsRef.set({ notifyCustomer: text === "/notify_on" }, { merge: true });
        await reply(text === "/notify_on" ? "✅ Mijozga chek yuborish yoqildi" : "⛔ Mijozga chek yuborish o‘chirildi");
        res.status(200).send("OK"); return;
      }
    }

    // Contact share
    if (message.contact?.phone_number) {
      const phone = String(message.contact.phone_number);

      const sessRef = db.collection("telegram_sessions").doc(String(chatId));
      const sessSnap = await sessRef.get();
      const sessionShopId = sessSnap.exists ? String((sessSnap.data() as any)?.shopId || "") : "";
      const shopId = String(forcedShopId || sessionShopId || "default").trim();

      // If webhook was configured with ?shopId=..., persist it so user doesn't need /start
      if (forcedShopId && (!sessSnap.exists || sessionShopId !== forcedShopId)) {
        await sessRef.set(
          {
            shopId: forcedShopId,
            createdAt: nowTs(),
            updatedAt: nowTs(),
          },
          { merge: true }
        );
      }

      const r = await linkCustomerTelegram({
        db,
        shopId,
        phone,
        chatId,
        tgUserId: Number(from.id || 0),
        tgName: [from.first_name, from.last_name].filter(Boolean).join(" ").trim(),
      });

      if (r.ok) {
        await tgSendMessage({
          token,
          chatId,
          text: `✅ Ulandi!\nMijoz: *${r.customerName || ""}*\nEndi savdolar shaxsan sizga yuboriladi.`,
          parseMode: "Markdown",
          replyMarkup: { remove_keyboard: true },
        });
      } else {
        await tgSendMessage({
          token,
          chatId,
          text: `⚠️ Ulanmadi: ${r.reason}\n\nIltimos kassadan mijozni avval qo'shing, so'ng qayta urinib ko'ring.`,
        });
      }

      res.status(200).json({ ok: true });
      return;
    }

    // Unknown message
    await tgSendMessage({
      token,
      chatId,
      text:
        "Botga ulanish uchun /start <shopId> yozing va keyin kontakt yuboring.\nMasalan: /start default",
    });

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(200).json({ ok: false });
  }
  });

/**
 * Firestore Trigger: send sale notification
 * - Sends to OWNER (all sales)
 * - Sends to CUSTOMER if linked (customerId + telegramChatId)
 */
// NOTE: uses Firebase Secret: TELEGRAM_TOKEN
export const onSaleCompletedNotify = functions
  .firestore
  .document("shops/{shopId}/sales/{saleId}")
  .onWrite(async (change, context) => {
    const shopId = String(context.params.shopId);

    // Per-shop bot token (preferred). Fallback to old global token.
    const priv = await getShopTelegramPrivate(db, shopId);
    const token = priv?.botToken || getTelegramToken();
    if (!token) return;
    const before = change.before.exists ? (change.before.data() as any) : null;
    const after = change.after.exists ? (change.after.data() as any) : null;

    // only on first time completed
    if (!after) return;
    if (after.status !== "completed") return;
    if (before && before.status === "completed") return;

    const settings = await getTelegramSettings(db, shopId);
    if (!settings.enabled) return;

    const saleNo = String(after.saleNo || "");
    const total = Number(after.total || 0);
    const paid = Number(after.paidAmount || 0);
    const due = Number(after.dueAmount || 0);
    const paymentType = after.paymentType === "card" ? "Karta" : "Naqd";
    const customerName = String(after.customerNameSnapshot || "");
    const customerPhone = String(after.customerPhoneSnapshot || "");

    const text =
      `🧾 Savdo yakunlandi (#${saleNo})\n` +
      (customerName ? `👤 Mijoz: ${customerName} (${customerPhone})\n` : "👤 Mijoz: Bir martalik\n") +
      `💳 To'lov: ${paymentType}\n` +
      `💰 Jami: ${formatMoneyUZS(total)}\n` +
      `✅ To'landi: ${formatMoneyUZS(paid)}\n` +
      (due > 0 ? `⚠️ Qarz: ${formatMoneyUZS(due)}\n` : "") +
      `🕒 ${new Date(after.createdAt || Date.now()).toLocaleString("uz-UZ")}`;

    // 1) Owner gets ALL sales
    if (settings.ownerChatId) {
      await tgSendMessage({ token, chatId: settings.ownerChatId, text });
    }

    // 2) Customer gets personal message if linked
    if (settings.notifyCustomer && after.customerId) {
      const cRef = db.doc(`shops/${shopId}/customers/${after.customerId}`);
      const cSnap = await cRef.get();
      const c = cSnap.exists ? (cSnap.data() as any) : null;
      const custChatId = c?.telegramChatId ? String(c.telegramChatId) : "";
      if (custChatId) {
        await tgSendMessage({
          token,
          chatId: custChatId,
          text: "✅ Xaridingiz uchun rahmat!\n\n" + text,
        });
      }
    }
  });


// =========================
// RECEIPT IMPORT (Admin only)
// =========================
async function requireShopAdmin(uid: string, shopId: string, isSuper = false) {
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Auth required");
  if (!shopId) throw new functions.https.HttpsError("invalid-argument", "shopId required");

  if (isSuper || uid === SUPER_ADMIN_UID) return;

  const uSnap = await db.collection("users").doc(uid).get();
  const u = uSnap.exists ? (uSnap.data() as any) : null;
  const role = String(u?.role || "");
  const myShop = String(u?.shopId || "");
  if (role !== "admin" || myShop !== shopId) {
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract first JSON object/array
    const firstObj = text.indexOf("{");
    const lastObj = text.lastIndexOf("}");
    if (firstObj >= 0 && lastObj > firstObj) {
      try {
        return JSON.parse(text.slice(firstObj, lastObj + 1));
      } catch {}
    }
    const firstArr = text.indexOf("[");
    const lastArr = text.lastIndexOf("]");
    if (firstArr >= 0 && lastArr > firstArr) {
      try {
        return JSON.parse(text.slice(firstArr, lastArr + 1));
      } catch {}
    }
    return null;
  }
}

async function openaiExtractReceipt(args: { imageUrls: string[] }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new functions.https.HttpsError("failed-precondition", "OPENAI_API_KEY secret not set");
  }

  const images = (args.imageUrls || []).filter(Boolean).slice(0, 3);
  if (images.length === 0) throw new functions.https.HttpsError("invalid-argument", "No images");

  const content: any[] = [
    {
      type: "text",
      text:
        "You are extracting items from a retail receipt photo. Output ONLY valid JSON (no markdown). " +
        "Schema: { meta:{storeName?:string,date?:string,currency?:string}, items:[{name:string, qty:number, unit?:string|null, unitPrice?:number|null, total?:number|null, barcode?:string|null, confidence?:number|null}], rawText?:string }. " +
        "If qty missing, use 1. If unit price missing but total and qty exist, compute unitPrice = total/qty. " +
        "Use UZS for Uzbek sums if currency unclear. Keep names as seen on receipt."
    },
    ...images.map((u) => ({ type: "image_url", image_url: { url: u } })),
  ];

  const body = {
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "user", content },
    ],
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new functions.https.HttpsError("internal", `OpenAI error: ${resp.status} ${t}`);
  }

  const j: any = await resp.json();
  const text = String(j?.choices?.[0]?.message?.content || "").trim();
  const parsed = safeJsonParse(text);
  if (!parsed) {
    throw new functions.https.HttpsError("internal", "Could not parse JSON from extractor");
  }
  return { parsed, rawText: text };
}

export const receiptImportExtract = functions
  .runWith({ timeoutSeconds: 300, memory: "1GB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");
    const uid = context.auth.uid;
  try {

    const shopId = String(data?.shopId || "").trim();
    const imagePaths: string[] = Array.isArray(data?.imagePaths) ? data.imagePaths : [];
    if (!shopId) throw new functions.https.HttpsError("invalid-argument", "shopId required");
    if (!imagePaths.length) throw new functions.https.HttpsError("invalid-argument", "imagePaths required");

    await requireShopAdmin(uid, shopId, isSuperAdminCtx(context));

    const bucket = admin.storage().bucket();
    const urls: string[] = [];
    for (const p of imagePaths.slice(0, 3)) {
      const path = String(p || "").trim();
      if (!path) continue;

      // XAVFSIZLIK: faqat shu do'kon papkasidagi rasmlar o'qilishi mumkin.
      // Admin SDK Storage rules'ni chetlab o'tadi, shuning uchun bu yerda
      // tekshiramiz — aks holda A do'kon admini B do'kon rasmini o'qishi mumkin.
      if (!path.startsWith(`shops/${shopId}/`)) {
        throw new functions.https.HttpsError("permission-denied", "Rasm yo'li ushbu do'konga tegishli emas");
      }

      // Download file bytes and pass as base64 data URL to OpenAI.
      // This avoids SignedURL/signBlob permission issues in Cloud Functions.
      const file = bucket.file(path);
      const [buf] = await file.download();

      const ext = (path.split(".").pop() || "jpg").toLowerCase();
      const mime =
        ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

      const b64 = Buffer.from(buf).toString("base64");
      urls.push(`data:${mime};base64,${b64}`);
    }

    const { parsed, rawText } = await openaiExtractReceipt({ imageUrls: urls });
const meta = (parsed?.meta && typeof parsed.meta === "object") ? parsed.meta : {};
    const itemsRaw = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
    const items = itemsRaw
      .slice(0, 120)
      .map((it: any) => {
        const name = String(it?.name || "").trim();
        const qty = Number(it?.qty ?? 1) || 1;
        const total = it?.total != null ? Number(it.total) : null;
        let unitPrice = it?.unitPrice != null ? Number(it.unitPrice) : null;
        if ((unitPrice == null || !isFinite(unitPrice)) && total != null && isFinite(total) && qty) {
          unitPrice = total / qty;
        }
        const barcode = it?.barcode != null ? String(it.barcode).trim() : null;
        const unit = it?.unit != null ? String(it.unit).trim() : null;
        const confidence = it?.confidence != null ? Number(it.confidence) : null;

        return {
          name,
          qty: qty > 0 ? qty : 1,
          unit: unit || null,
          unitPrice: unitPrice != null && isFinite(unitPrice) ? unitPrice : null,
          total: total != null && isFinite(total) ? total : null,
          barcode: barcode || null,
          confidence: confidence != null && isFinite(confidence) ? confidence : null,
        };
      })
      .filter((x: any) => x.name);

    return { ok: true, meta, items, rawText };
  
  } catch (err: any) {
    // If it's already a callable error, keep it
    if (err instanceof functions.https.HttpsError) throw err;
    functions.logger.error("receiptImportExtract failed", err);
    throw new functions.https.HttpsError(
      "internal",
      err?.message || "receiptImportExtract failed"
    );
  }
});

// =========================
// TELEGRAM: Customer debt payment notify
// =========================
export const onCustomerPaymentNotify = functions
  .firestore
  .document("shops/{shopId}/customer_payments/{paymentId}")
  .onCreate(async (snap, context) => {
    const shopId = String(context.params.shopId);

    const priv = await getShopTelegramPrivate(db, shopId);
    const token = priv?.botToken || getTelegramToken();
    if (!token) return;

    const settings = await getTelegramSettings(db, shopId);
    if (!settings.enabled || !settings.ownerChatId) return;

    const p = (snap.data() as any) || {};
    const customerId = String(p.customerId || "");
    const amount = Number(p.amount || 0);
    const note = String(p.note || "");
    const paymentType = p.paymentType === "card" ? "Karta" : "Naqd";

    let customerName = "";
    let customerPhone = "";
    let customerChatId = "";
    let debtAfter: number | null = null;
    if (customerId) {
      const cSnap = await db.doc(`shops/${shopId}/customers/${customerId}`).get();
      if (cSnap.exists) {
        const c = (cSnap.data() as any) || {};
        customerName = String(c.name || "");
        customerPhone = String(c.phone || c.telefon || "");
        customerChatId = String(c.telegramChatId || "").trim();
        debtAfter = Number(c.debt ?? null);
      }
    }

    const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : new Date();
    const text =
      `💳 Mijoz qarz to'lovi\n` +
      (customerName ? `👤 Mijoz: ${customerName} (${customerPhone})\n` : "👤 Mijoz: NOMA'LUM\n") +
      `💰 Summa: ${formatMoneyUZS(amount)}\n` +
      `🧾 To'lov turi: ${paymentType}\n` +
      (note ? `📝 Izoh: ${note}\n` : "") +
      (debtAfter != null && isFinite(debtAfter) ? `🧯 Qolgan qarz: ${formatMoneyUZS(debtAfter)}\n` : "") +
      `🕒 ${createdAt.toLocaleString("uz-UZ")}`;

    await tgSendMessage({ token, chatId: settings.ownerChatId, text });

    // Also notify the customer directly if their Telegram is linked.
    if (customerChatId) {
      const customerText =
        `✅ To'lov qabul qilindi
` +
        (customerName ? `👤 Mijoz: ${customerName}
` : "") +
        `💰 Summa: ${formatMoneyUZS(amount)}
` +
        `🧾 To'lov turi: ${paymentType}
` +
        (note ? `📝 Izoh: ${note}
` : "") +
        (debtAfter != null && isFinite(debtAfter)
          ? `🧯 Qolgan qarz: ${formatMoneyUZS(debtAfter)}
`
          : "") +
        `🕒 ${createdAt.toLocaleString("uz-UZ")}`;

      try {
        await tgSendMessage({ token, chatId: customerChatId, text: customerText });
      } catch (err) {
        console.error("onCustomerPaymentNotify: customer telegram send failed", {
          shopId,
          customerId,
          paymentId: context.params.paymentId,
          err: (err as any)?.message || String(err),
        });
      }
    }
  });

// =========================
// TELEGRAM: Weekly / Monthly PDF reports
// - Owner receives shop-level report PDF
// - Customers receive their own statement PDF if telegramChatId is linked
// =========================

function tashkentNow(): Date {
  // Asia/Tashkent is UTC+5 (no DST). We use a simple offset for stable reporting.
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utc + 5 * 60 * 60_000);
}

function periodWeekly(): { from: Date; to: Date; label: string } {
  const to = tashkentNow();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60_000);
  const label = `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`;
  return { from, to, label };
}

function periodMonthly(): { from: Date; to: Date; label: string } {
  const to = tashkentNow();
  const y = to.getFullYear();
  const m = to.getMonth();
  // Previous calendar month
  const prevMonthEnd = new Date(y, m, 1);
  const prevMonthStart = new Date(y, m - 1, 1);
  const from = prevMonthStart;
  const toLocal = prevMonthEnd;
  const label = `${from.toISOString().slice(0, 10)} → ${toLocal.toISOString().slice(0, 10)}`;
  return { from, to: toLocal, label };
}

async function buildShopReport(shopId: string, from: Date, to: Date) {
  // FIX: createdAt RAQAM (ms) sifatida saqlanadi -> Timestamp bilan solishtirish 0 ta hujjat qaytarardi.
  const fromTs = from.getTime();
  const toTs = to.getTime();

  // Sales (completed)
  const salesSnap = await db
    .collection(`shops/${shopId}/sales`)
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<", toTs)
    .get();
  const sales = salesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((s: any) => String(s.status || "") === "completed");

  const totalSales = sales.reduce((sum: number, s: any) => sum + Number(s.total || 0), 0);
  const totalPaid = sales.reduce((sum: number, s: any) => sum + Number(s.paidAmount || 0), 0);
  const totalDue = sales.reduce((sum: number, s: any) => sum + Number(s.dueAmount || 0), 0);
  const profit = sales.reduce((sum: number, s: any) => sum + Number(s.profit || 0), 0);

  // Purchases
  const purSnap = await db
    .collection(`shops/${shopId}/purchases`)
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<", toTs)
    .get();
  const purchasesTotal = purSnap.docs.reduce((sum, d) => sum + Number((d.data() as any)?.total || 0), 0);

  // Expenses
  const expSnap = await db
    .collection(`shops/${shopId}/expenses`)
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<", toTs)
    .get();
  const expensesTotal = expSnap.docs.reduce((sum, d) => sum + Number((d.data() as any)?.amount || 0), 0);

  // Customer payments
  const paySnap = await db
    .collection(`shops/${shopId}/customer_payments`)
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<", toTs)
    .get();
  const customerPaymentsTotal = paySnap.docs.reduce((sum, d) => sum + Number((d.data() as any)?.amount || 0), 0);

  return {
    sales,
    totals: {
      totalSales,
      totalPaid,
      totalDue,
      profit,
      purchasesTotal,
      expensesTotal,
      customerPaymentsTotal,
      salesCount: sales.length,
    },
  };
}

async function sendOwnerReportPdf(params: {
  shopId: string;
  token: string;
  ownerChatId: string;
  title: string;
  label: string;
  from: Date;
  to: Date;
}) {
  const { shopId, token, ownerChatId, title, label, from, to } = params;
  const shopSnap = await db.doc(`shops/${shopId}`).get();
  const shopName = shopSnap.exists ? String((shopSnap.data() as any)?.name || "Shop") : "Shop";

  const rep = await buildShopReport(shopId, from, to);
  const t = rep.totals;

  // TOP Customers (by total sales)
  const byCust = new Map<string, { name: string; phone: string; total: number; count: number }>();
  for (const s of rep.sales) {
    const key = String(s.customerId || s.customerNameSnapshot || "NOMA'LUM");
    const cur = byCust.get(key) || {
      name: String(s.customerNameSnapshot || "NOMA'LUM"),
      phone: String(s.customerPhoneSnapshot || ""),
      total: 0,
      count: 0,
    };
    cur.total += Number(s.total || 0);
    cur.count += 1;
    byCust.set(key, cur);
  }
  const topCustomers = Array.from(byCust.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // TOP Products (by revenue)
  const byProd = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const s of rep.sales) {
    const items = Array.isArray((s as any).items) ? ((s as any).items as any[]) : [];
    for (const it of items) {
      const pid = String(it.productId || it.nameSnapshot || "").trim();
      if (!pid) continue;
      const cur = byProd.get(pid) || {
        name: String(it.nameSnapshot || "Mahsulot"),
        qty: 0,
        revenue: 0,
      };
      const qty = Number(it.qty || 0);
      const line = Number(it.lineTotal || (Number(it.unitPrice || 0) * qty) || 0);
      cur.qty += qty;
      cur.revenue += line;
      byProd.set(pid, cur);
    }
  }
  const topProducts = Array.from(byProd.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const pdf = await buildPrettyPdf({
    title,
    shopName,
    periodLabel: label,
    sections: [
      {
        kind: "kv",
        heading: "Umumiy natijalar",
        rows: [
          ["Savdo (son)", `${t.salesCount} ta`],
          ["Jami savdo", `${formatMoneyUZS(t.totalSales)} so'm`],
          ["To'landi", `${formatMoneyUZS(t.totalPaid)} so'm`],
          ["Qarz (savdo)", `${formatMoneyUZS(t.totalDue)} so'm`],
          ["Foyda (profit)", `${formatMoneyUZS(t.profit)} so'm`],
          ["Kirim (purchases)", `${formatMoneyUZS(t.purchasesTotal)} so'm`],
          ["Harajatlar", `${formatMoneyUZS(t.expensesTotal)} so'm`],
          ["Mijoz to'lovlari", `${formatMoneyUZS(t.customerPaymentsTotal)} so'm`],
        ],
      },
      {
        kind: "table",
        heading: "TOP mijozlar (savdo bo'yicha)",
        headers: ["Mijoz", "Telefon", "Savdo soni", "Jami"],
        rows: topCustomers.map((c) => [
          c.name || "NOMA'LUM",
          c.phone || "-",
          String(c.count),
          `${formatMoneyUZS(c.total)} so'm`,
        ]),
      },
      {
        kind: "table",
        heading: "TOP tovarlar (daromad bo'yicha)",
        headers: ["Tovar", "Soni", "Jami"],
        rows: topProducts.map((p) => [p.name || "-", String(p.qty), `${formatMoneyUZS(p.revenue)} so'm`]),
      },
    ],
  });
  const filename = `${title.replace(/\s+/g, "_")}_${label.replace(/\s+/g, "").replace(/→/g, "-")}.pdf`;

  await tgSendDocument({
    token,
    chatId: ownerChatId,
    filename,
    pdfBuffer: pdf,
    caption: `${title}\n${shopName}\nDavr: ${label}`,
  });
}

async function sendCustomerStatementsPdf(params: {
  shopId: string;
  token: string;
  label: string;
  from: Date;
  to: Date;
  sales: any[];
}) {
  const { shopId, token, label, from, to, sales } = params;
  const shopSnap = await db.doc(`shops/${shopId}`).get();
  const shopName = shopSnap.exists ? String((shopSnap.data() as any)?.name || "Shop") : "Shop";
  // FIX: createdAt RAQAM (ms) sifatida saqlanadi -> Timestamp bilan solishtirish 0 ta hujjat qaytarardi.
  const fromTs = from.getTime();
  const toTs = to.getTime();

  // Map sales totals by customerId
  const byCustomerSale = new Map<string, { count: number; total: number }>();
  for (const s of sales) {
    const cid = String(s.customerId || "").trim();
    if (!cid) continue;
    const cur = byCustomerSale.get(cid) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(s.total || 0);
    byCustomerSale.set(cid, cur);
  }

  // Payments by customer in period
  const paySnap = await db
    .collection(`shops/${shopId}/customer_payments`)
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<", toTs)
    .get();
  const byCustomerPay = new Map<string, { count: number; total: number }>();
  for (const d of paySnap.docs) {
    const p = (d.data() as any) || {};
    const cid = String(p.customerId || "").trim();
    if (!cid) continue;
    const cur = byCustomerPay.get(cid) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(p.amount || 0);
    byCustomerPay.set(cid, cur);
  }

  // Customers: scan and pick only those with telegramChatId linked
  const cSnap = await db.collection(`shops/${shopId}/customers`).limit(1000).get();
  for (const cDoc of cSnap.docs) {
    const c = (cDoc.data() as any) || {};
    const chatId = c.telegramChatId ? String(c.telegramChatId) : "";
    if (!chatId) continue; // Variant A: only linked customers

    const cid = cDoc.id;
    const sAgg = byCustomerSale.get(cid) || { count: 0, total: 0 };
    const pAgg = byCustomerPay.get(cid) || { count: 0, total: 0 };
    const debt = Number(c.debt || 0);

    const pdf = await buildPrettyPdf({
      title: "Mijoz hisobot",
      shopName,
      periodLabel: label,
      sections: [
        {
          kind: "kv",
          heading: "Mijoz ma'lumotlari",
          rows: [
            ["Mijoz", String(c.name || "") || "NOMA'LUM"],
            ["Telefon", String(c.phone || "-")],
            ["Hozirgi qarz", `${formatMoneyUZS(debt)} so'm`],
          ],
        },
        {
          kind: "kv",
          heading: "Davr bo'yicha",
          rows: [
            ["Savdolar (son)", `${sAgg.count} ta`],
            ["Savdo jami", `${formatMoneyUZS(sAgg.total)} so'm`],
            ["To'lovlar (son)", `${pAgg.count} ta`],
            ["To'lov jami", `${formatMoneyUZS(pAgg.total)} so'm`],
          ],
        },
      ],
    });
    const filename = `mijoz_${cid}_${label.replace(/\s+/g, "").replace(/→/g, "-")}.pdf`;

    await tgSendDocument({
      token,
      chatId,
      filename,
      pdfBuffer: pdf,
      caption: `📄 Mijoz hisobot\nDavr: ${label}`,
    });
  }
}

async function runPdfReporting(kind: "weekly" | "monthly") {
  const period = kind === "weekly" ? periodWeekly() : periodMonthly();
  const title = kind === "weekly" ? "Haftalik hisobot" : "Oylik hisobot";

  const shopsSnap = await db.collection("shops").where("status", "==", "active").limit(200).get();
  for (const shopDoc of shopsSnap.docs) {
    const shopId = shopDoc.id;

    const priv = await getShopTelegramPrivate(db, shopId);
    const token = priv?.botToken || getTelegramToken();
    if (!token) continue;

    const settings = await getTelegramSettings(db, shopId);
    if (!settings.enabled) continue;

    // Owner PDF
    if (settings.ownerChatId) {
      await sendOwnerReportPdf({
        shopId,
        token,
        ownerChatId: settings.ownerChatId,
        title,
        label: period.label,
        from: period.from,
        to: period.to,
      });
    }

    // Customer statements
    if (settings.notifyCustomer) {
      const rep = await buildShopReport(shopId, period.from, period.to);
      await sendCustomerStatementsPdf({
        shopId,
        token,
        label: period.label,
        from: period.from,
        to: period.to,
        sales: rep.sales,
      });
    }
  }
}

export const weeklyPdfReports = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("0 9 * * 1") // Monday 09:00
  .timeZone("Asia/Tashkent")
  .onRun(async () => {
    await runPdfReporting("weekly");
    return null;
  });

export const monthlyPdfReports = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("0 9 1 * *") // 1st day of month 09:00
  .timeZone("Asia/Tashkent")
  .onRun(async () => {
    await runPdfReporting("monthly");
    return null;
  });


export const sttUzbekVoice = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  // XAVFSIZLIK: pullik STT API — faqat do'konga biriktirilgan, faol rolli
  // foydalanuvchilar chaqira oladi (pending/rolsiz user cost-abuse qila olmasin).
  const uid = context.auth.uid;
  if (!isSuperAdminCtx(context)) {
    const uSnap = await db.collection("users").doc(uid).get();
    const uRole = uSnap.exists ? String(uSnap.get("role") || "") : "";
    const uShop = uSnap.exists ? String(uSnap.get("shopId") || "") : "";
    const ALLOWED = ["admin", "cashier", "warehouse"];
    if (!uShop || !ALLOWED.includes(uRole)) {
      throw new functions.https.HttpsError("permission-denied", "Ruxsat yo'q");
    }
  }
  const base64Audio = String(data?.base64Audio || "");
  const mimeType = String(data?.mimeType || "audio/webm");
  const fileName = String(data?.fileName || "audio.webm");
  const language = String(data?.language || "uz");
  if (!base64Audio) {
    throw new functions.https.HttpsError("invalid-argument", "base64Audio required");
  }
  const apiKey =
    process.env.UZBEKVOICE_API_KEY ||
    process.env.UZBEKVOICE_STT_API_KEY ||
    functions.config()?.uzbekvoice?.api_key;
  if (!apiKey) {
    throw new functions.https.HttpsError("failed-precondition", "UZBEKVOICE API key not configured");
  }

  try {
    const fileBuffer = Buffer.from(base64Audio, "base64");
    const form = new FormData();
    form.append("file", fileBuffer, { filename: fileName, contentType: mimeType });
    form.append("return_offsets", "false");
    form.append("run_diarization", "false");
    form.append("language", language);
    form.append("blocking", "true");

    const resp = await axios.post("https://uzbekvoice.ai/api/v1/stt", form, {
      headers: {
        Authorization: apiKey,
        ...form.getHeaders(),
      },
      timeout: 120000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });

    if (resp.status < 200 || resp.status >= 300) {
      throw new functions.https.HttpsError("internal", `STT failed: ${resp.status}`);
    }

    const payload: any = resp.data || {};
    const transcript =
      payload.text ||
      payload.transcript ||
      payload.result?.text ||
      payload.data?.text ||
      "";
    const confidence =
      payload.confidence ??
      payload.result?.confidence ??
      payload.data?.confidence ??
      null;

    return { transcript: String(transcript || ""), confidence };
  } catch (err: any) {
    const msg = err?.message || "STT request failed";
    throw new functions.https.HttpsError("internal", msg);
  }
});
