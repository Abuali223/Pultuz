/**
 * SERVER-AUTHORITATIVE LEDGER
 * ===========================
 * Ombor / pul / qarzni o'zgartiruvchi BARCHA amallar shu yerda, server tomonda
 * (admin SDK) bajariladi. Client bu kolleksiyalarga to'g'ridan-to'g'ri yoza olmaydi
 * (firestore.rules faqat o'qishga ruxsat beradi). Shu sababli ombor/pul mantig'ini
 * client (yoki buzilgan/qasddan o'zgartirilgan client) buzolmaydi.
 *
 * createdAt har doim RAQAM (ms) — hisobot va reconcile shuni kutadi.
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const SUPER_ADMIN_UID = "M8WKl0BlBnPanTU6Hh60SumTpQu1";

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

type Caller = { uid: string; role: string; shopId: string; isSuper: boolean };

async function getCaller(context: functions.https.CallableContext): Promise<Caller> {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");
  const uid = context.auth.uid;
  if (uid === SUPER_ADMIN_UID) return { uid, role: "admin", shopId: "", isSuper: true };
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const d = (snap.exists ? snap.data() : {}) as any;
  return { uid, role: String(d?.role || ""), shopId: String(d?.shopId || ""), isSuper: false };
}

/**
 * Shop mosligini va rolni tekshiradi.
 * opts.admin=true — faqat admin.
 * opts.roles — ruxsat etilgan rollar ro'yxati (admin har doim ruxsatli).
 * Standart: admin/cashier (savdo amallari).
 */
function assertShop(caller: Caller, shopId: string, opts: { admin?: boolean; roles?: string[] } = {}) {
  if (!shopId) throw new functions.https.HttpsError("invalid-argument", "shopId required");
  if (caller.isSuper) return;
  if (!caller.shopId || caller.shopId !== shopId) {
    throw new functions.https.HttpsError("permission-denied", "Shop mismatch");
  }
  if (opts.admin) {
    if (caller.role !== "admin") throw new functions.https.HttpsError("permission-denied", "Admin required");
    return;
  }
  const allowed = opts.roles ?? ["cashier"];
  if (caller.role !== "admin" && !allowed.includes(caller.role)) {
    throw new functions.https.HttpsError("permission-denied", "Ruxsat yo'q (rol yetarli emas)");
  }
}

async function writeAudit(shopId: string, actorId: string, role: string, actionType: string, entityType: string, entityId: string, meta: any) {
  try {
    await admin.firestore().collection(`shops/${shopId}/audit_logs`).add({
      shopId,
      actorId,
      createdBy: actorId,
      role: role || null,
      actionType,
      entityType,
      entityId,
      meta: meta ?? null,
      timestamp: Date.now(),
    });
  } catch (_) { /* audit best-effort */ }
}

// ---- cut (sm) yordamchilari ----
function isCutSm(p: any) {
  return String(p?.unit ?? "").trim() === "sm" && Number(p?.cutWidthCm ?? 0) > 0;
}
function cutTotalSm(p: any): number {
  return Math.max(0, Number(p?.stock ?? 0) * Number(p?.cutWidthCm ?? 0) + Number(p?.cutRemainderCm ?? 0));
}
function cutApply(p: any, deltaSm: number): { newSheets: number; newRem: number } {
  const width = Math.max(1, Number(p?.cutWidthCm ?? 1));
  const next = Math.max(0, cutTotalSm(p) + deltaSm);
  return { newSheets: Math.floor(next / width), newRem: next % width };
}
function cutUnitCostPerSm(p: any): number {
  const width = Number(p?.cutWidthCm ?? 0);
  const costPerSheet = Number(p?.avgCost ?? 0);
  return width > 0 ? round2(costPerSheet / width) : round2(costPerSheet);
}

const RUNWITH = { timeoutSeconds: 60, memory: "256MB" as const };

// =========================================================
// SAVDO (SALE)
// =========================================================
export const createSaleTx = functions.runWith(RUNWITH).https.onCall(async (data, context) => {
  const caller = await getCaller(context);
  const shopId = String(data?.shopId || "");
  assertShop(caller, shopId, { admin: false });

  const db = admin.firestore();
  // unitPrice — ixtiyoriy: sotuv paytida qo'lda o'zgartirilgan narx (chegirma/ulgurji/tanish mijoz).
  // Yuborilmasa katalogdagi narx ishlatiladi. Foyda har doim avgCost dan avtomatik hisoblanadi.
  const items: Array<{ productId: string; qty: number; unitPrice?: number }> = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) throw new functions.https.HttpsError("invalid-argument", "Savat bo'sh");
  const paymentType = data?.paymentType === "card" ? "card" : "cash";
  const customer = data?.customer && data.customer.id ? data.customer : null;
  const note = String(data?.note || "").slice(0, 300);

  const saleNo = `S-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  const createdAt = Date.now();
  const opId = String(data?.operationId || saleNo);

  const result = await db.runTransaction(async (tx) => {
    const saleRef = db.doc(`shops/${shopId}/sales/${opId}`);
    const existing = await tx.get(saleRef);
    if (existing.exists) {
      const d = existing.data() as any;
      return { saleId: saleRef.id, saleNo: d.saleNo ?? saleNo, total: Number(d.total || 0), paidAmount: Number(d.paidAmount || 0), dueAmount: Number(d.dueAmount || 0) };
    }

    // READ: mahsulotlar
    const prodRefs = items.map((it) => db.doc(`shops/${shopId}/products/${it.productId}`));
    const prodSnaps = await Promise.all(prodRefs.map((r) => tx.get(r)));

    let customerRef: FirebaseFirestore.DocumentReference | null = null;
    let customerSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (customer?.id) {
      customerRef = db.doc(`shops/${shopId}/customers/${customer.id}`);
      customerSnap = await tx.get(customerRef);
      if (!customerSnap.exists) throw new functions.https.HttpsError("not-found", "Mijoz topilmadi");
    }

    const saleItems: any[] = [];
    let total = 0;
    let profit = 0;
    const stockWrites: Array<{ ref: any; updates: any }> = [];
    const movements: Array<{ productId: string; qty: number; unitCost: number }> = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const psnap = prodSnaps[i];
      if (!psnap.exists) throw new functions.https.HttpsError("not-found", "Mahsulot topilmadi");
      const p = psnap.data() as any;
      const qty = Number(it.qty);
      if (!Number.isFinite(qty) || qty <= 0) throw new functions.https.HttpsError("invalid-argument", "qty > 0 bo'lishi kerak");

      // Narxni aniqlash: qo'lda kiritilgan narx (override) yoki katalog narxi.
      const listPrice = Number(p.price ?? 0);
      let unitPrice = listPrice;
      let priceOverridden = false;
      if (it.unitPrice !== undefined && it.unitPrice !== null) {
        const ov = Number(it.unitPrice);
        if (!Number.isFinite(ov) || ov < 0) throw new functions.https.HttpsError("invalid-argument", `Noto'g'ri narx: ${p.name}`);
        // Yuqori chegara: absurd/overflow narxlar kassa va qarzni buzmasligi uchun.
        // 1e11 so'm (100 mlrd) real narxlardan ancha yuqori, ammo Infinity emas.
        const PRICE_CEILING = 100_000_000_000;
        if (ov > PRICE_CEILING) throw new functions.https.HttpsError("invalid-argument", `Narx juda katta: ${p.name}`);
        unitPrice = round2(ov);
        priceOverridden = Math.abs(unitPrice - listPrice) > 0.001;
      }

      if (isCutSm(p)) {
        if (cutTotalSm(p) < qty) throw new functions.https.HttpsError("failed-precondition", `Omborda yetarli emas: ${p.name}`);
        const unitCost = cutUnitCostPerSm(p);
        const lineTotal = round2(unitPrice * qty);
        const lineProfit = round2((unitPrice - unitCost) * qty);
        saleItems.push({ productId: it.productId, nameSnapshot: String(p.name ?? ""), barcodeSnapshot: String(p.barcode ?? ""), qty, unitSnapshot: String(p.unit ?? "sm"), unitPrice, listPriceSnapshot: listPrice, priceOverridden, unitCostSnapshot: unitCost, lineTotal, profit: lineProfit });
        total = round2(total + lineTotal); profit = round2(profit + lineProfit);
        const { newSheets, newRem } = cutApply(p, -qty);
        stockWrites.push({ ref: prodRefs[i], updates: { stock: newSheets, cutRemainderCm: newRem } });
        movements.push({ productId: it.productId, qty, unitCost });
      } else {
        const stock = Number(p.stock ?? 0);
        if (stock < qty) throw new functions.https.HttpsError("failed-precondition", `Omborda yetarli emas: ${p.name}`);
        const unitCost = Number(p.avgCost ?? 0);
        const lineTotal = round2(unitPrice * qty);
        const lineProfit = round2((unitPrice - unitCost) * qty);
        saleItems.push({ productId: it.productId, nameSnapshot: String(p.name ?? ""), barcodeSnapshot: String(p.barcode ?? ""), qty, unitSnapshot: String(p.unit ?? "dona"), unitPrice, listPriceSnapshot: listPrice, priceOverridden, unitCostSnapshot: unitCost, lineTotal, profit: lineProfit });
        total = round2(total + lineTotal); profit = round2(profit + lineProfit);
        stockWrites.push({ ref: prodRefs[i], updates: { stock: stock - qty } });
        movements.push({ productId: it.productId, qty, unitCost });
      }
    }

    const paidInput = Number(data?.paidAmount);
    if (!Number.isFinite(paidInput) || paidInput < 0) throw new functions.https.HttpsError("invalid-argument", "Noto'g'ri to'lov summasi");
    if (paidInput > total + 0.001) throw new functions.https.HttpsError("invalid-argument", "To'lov jami summadan oshmasligi kerak");
    const paidAmount = round2(Math.min(paidInput, total));
    const dueAmount = round2(total - paidAmount);
    if (dueAmount > 0 && !customer?.id) throw new functions.https.HttpsError("failed-precondition", "Qarzga savdo uchun mijoz tanlang");

    // WRITE
    for (const sw of stockWrites) tx.update(sw.ref, { ...sw.updates, updatedAt: createdAt });
    for (const mv of movements) {
      tx.set(db.collection(`shops/${shopId}/stock_movements`).doc(), { shopId, productId: mv.productId, type: "OUT", qty: mv.qty, unitCostSnapshot: mv.unitCost, createdAt, createdBy: caller.uid, saleNo });
    }
    tx.set(saleRef, {
      shopId, saleNo,
      customerId: customer ? customer.id : null,
      customerNameSnapshot: customer ? customer.name : null,
      customerPhoneSnapshot: customer ? customer.phone : null,
      items: saleItems, total, paidAmount, dueAmount, paymentType, note,
      createdAt, createdBy: caller.uid, status: "completed", profit,
    });
    if (paidAmount > 0) {
      tx.set(db.collection(`shops/${shopId}/cash_transactions`).doc(), { shopId, type: "SALE", amount: paidAmount, paymentType, refId: saleRef.id, createdAt, createdBy: caller.uid });
    }
    if (customerRef && customerSnap?.exists) {
      const c = customerSnap.data() as any;
      tx.update(customerRef, {
        totalBought: round2(Number(c.totalBought ?? 0) + total),
        totalPaid: round2(Number(c.totalPaid ?? 0) + paidAmount),
        debt: round2(Number(c.debt ?? 0) + dueAmount),
        updatedAt: createdAt,
      });
    }
    const priceOverrides = saleItems
      .filter((si) => si.priceOverridden)
      .map((si) => ({ productId: si.productId, name: si.nameSnapshot, listPrice: si.listPriceSnapshot, soldPrice: si.unitPrice }));
    return { saleId: saleRef.id, saleNo, total, paidAmount, dueAmount, priceOverrides };
  });

  // Audit: narx qo'lda o'zgartirilgan bo'lsa, kim qaysi narxda sotgani izda qoladi.
  await writeAudit(shopId, caller.uid, caller.role, "SALE_CREATE", "sale", result.saleId, {
    saleNo: result.saleNo, total: result.total, paidAmount: result.paidAmount, dueAmount: result.dueAmount,
    priceOverrides: (result as any).priceOverrides?.length ? (result as any).priceOverrides : null,
  });
  return result;
});

// =========================================================
// KIRIM (PURCHASE)
// =========================================================
export const createPurchaseTx = functions.runWith(RUNWITH).https.onCall(async (data, context) => {
  const caller = await getCaller(context);
  const shopId = String(data?.shopId || "");
  // Kirim: admin va omborchi (warehouse) qila oladi.
  assertShop(caller, shopId, { roles: ["warehouse"] });

  const db = admin.firestore();
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) throw new functions.https.HttpsError("invalid-argument", "Kirim savati bo'sh");
  const supplier = data?.supplier && data.supplier.id ? data.supplier : null;
  const purchaseNo = `P-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  const createdAt = Date.now();
  const safePaid = round2(Math.max(0, Number(data?.paidAmount || 0)));
  const payType = safePaid > 0 ? (data?.paymentType === "card" ? "card" : "cash") : null;

  const purchaseId = await db.runTransaction(async (tx) => {
    type Row = { ref: any; productId: string; qty: number; unitCost: number; p?: any; newProduct?: any; beforeStock?: number; beforeAvgCost?: number; afterStock?: number; afterAvgCost?: number };
    const rows: Row[] = [];
    let total = 0;

    for (const it of items) {
      const qty = Number(it.qty || 0);
      const unitCost = round2(Number(it.unitCost || 0));
      if (qty <= 0) continue;
      if (unitCost < 0) throw new functions.https.HttpsError("invalid-argument", "Kelish narxi xato");

      if (it.newProduct) {
        const bc = String(it.newProduct.barcode || "").trim();
        if (!bc) throw new functions.https.HttpsError("invalid-argument", "Barcode xato");
        const pref = db.doc(`shops/${shopId}/products/p_${bc}`);
        const existing = await tx.get(pref);
        if (existing.exists) {
          const p = existing.data() as any;
          rows.push({ ref: pref, productId: pref.id, qty, unitCost, p, beforeStock: Number(p.stock ?? 0), beforeAvgCost: Number(p.avgCost ?? 0) });
        } else {
          rows.push({ ref: pref, productId: pref.id, qty, unitCost, newProduct: {
            name: String(it.newProduct.name || "").trim(), barcode: bc,
            category: it.newProduct.category ?? null, unit: it.newProduct.unit ?? null,
            model: it.newProduct.model ? String(it.newProduct.model).trim() : null,
            brand: it.newProduct.brand ? String(it.newProduct.brand).trim() : null,
            note: it.newProduct.note ? String(it.newProduct.note).slice(0, 500) : null,
            imageUrl: it.newProduct.imageUrl ? String(it.newProduct.imageUrl) : null,
            price: round2(Number(it.newProduct.price || 0)), minStock: it.newProduct.minStock ?? null,
            cutLengthCm: it.newProduct.cutLengthCm ?? null, cutWidthCm: it.newProduct.cutWidthCm ?? null,
          } });
        }
      } else {
        const pref = db.doc(`shops/${shopId}/products/${it.productId}`);
        const psnap = await tx.get(pref);
        if (!psnap.exists) throw new functions.https.HttpsError("not-found", "Tovar topilmadi");
        const p = psnap.data() as any;
        rows.push({ ref: pref, productId: it.productId, qty, unitCost, p, beforeStock: Number(p.stock ?? 0), beforeAvgCost: Number(p.avgCost ?? 0) });
      }
      total = round2(total + round2(qty * unitCost));
    }

    let supplierRef: any = null;
    let supplierSnap: any = null;
    if (supplier?.id) { supplierRef = db.doc(`shops/${shopId}/suppliers/${supplier.id}`); supplierSnap = await tx.get(supplierRef); }

    const paidAmount = round2(Math.min(total, safePaid));
    if (safePaid > total + 0.001) throw new functions.https.HttpsError("invalid-argument", "To'langan summa jami summadan oshmasligi kerak");
    const dueAmount = round2(total - paidAmount);

    for (const r of rows) {
      if (r.newProduct) { r.beforeStock = 0; r.beforeAvgCost = 0; r.afterStock = round2(r.qty); r.afterAvgCost = r.unitCost; }
      else {
        const cs = Number(r.beforeStock ?? 0); const ca = Number(r.beforeAvgCost ?? 0);
        const ns = round2(cs + r.qty);
        r.afterStock = ns;
        r.afterAvgCost = ns > 0 ? round2((round2(cs * ca) + round2(r.qty * r.unitCost)) / ns) : 0;
      }
    }

    const snapItems = rows.map((r) => ({
      productId: r.productId,
      nameSnapshot: r.newProduct ? String(r.newProduct.name || "") : String(r.p?.name || ""),
      barcodeSnapshot: r.newProduct ? String(r.newProduct.barcode || "") : String(r.p?.barcode || ""),
      qty: r.qty, unitCost: r.unitCost, lineTotal: round2(r.qty * r.unitCost),
      beforeStock: r.beforeStock, beforeAvgCost: r.beforeAvgCost, afterStock: r.afterStock, afterAvgCost: r.afterAvgCost,
    }));

    for (const r of rows) {
      if (r.newProduct) {
        const np = r.newProduct;
        if (!np.name) throw new functions.https.HttpsError("invalid-argument", "Tovar nomi xato");
        if (np.price < 0) throw new functions.https.HttpsError("invalid-argument", "Sotish narxi xato");
        const isSm = String(np.unit ?? "").trim().toLowerCase() === "sm";
        tx.set(r.ref, {
          shopId, name: np.name, barcode: np.barcode, category: np.category ?? null, unit: np.unit ?? "dona",
          model: np.model ?? null, brand: np.brand ?? null, note: np.note ?? null, imageUrl: np.imageUrl ?? null,
          cutLengthCm: (isSm && Number(np.cutLengthCm ?? 0) > 0) ? Number(np.cutLengthCm) : null,
          cutWidthCm: (isSm && Number(np.cutWidthCm ?? 0) > 0) ? Number(np.cutWidthCm) : null,
          cutRemainderCm: (isSm && Number(np.cutLengthCm ?? 0) > 0 && Number(np.cutWidthCm ?? 0) > 0) ? 0 : null,
          price: np.price, minStock: np.minStock ?? 0, stock: round2(r.qty), avgCost: r.unitCost, isDeleted: false,
          createdAt, updatedAt: createdAt,
        }, { merge: true });
      } else {
        tx.update(r.ref, { stock: r.afterStock, avgCost: r.afterAvgCost, updatedAt: createdAt });
      }
      tx.set(db.collection(`shops/${shopId}/stock_movements`).doc(), { shopId, type: "IN", productId: r.productId, qty: r.qty, unitCost: r.unitCost, refType: "PURCHASE", refNo: purchaseNo, createdAt, createdBy: caller.uid });
    }

    const purchaseRef = db.collection(`shops/${shopId}/purchases`).doc();
    tx.set(purchaseRef, {
      shopId, purchaseNo,
      supplierId: supplier ? supplier.id : null, supplierNameSnapshot: supplier ? supplier.name : null,
      supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
      invoiceNo: data?.invoiceNo ?? null, note: data?.note ?? null,
      items: snapItems, total, paidAmount, dueAmount, paymentType: paidAmount > 0 ? payType : null,
      createdAt, createdBy: caller.uid, status: "completed",
    });

    if (supplierRef && supplierSnap?.exists) {
      const s = supplierSnap.data() as any;
      tx.update(supplierRef, { totalPurchased: round2((s.totalPurchased ?? 0) + total), totalPaid: round2((s.totalPaid ?? 0) + paidAmount), balance: round2((s.balance ?? 0) + dueAmount), updatedAt: createdAt });
    }
    if (paidAmount > 0) {
      tx.set(db.collection(`shops/${shopId}/cash_transactions`).doc(), { shopId, type: "PURCHASE", amount: -paidAmount, paymentType: payType, refId: purchaseRef.id, createdAt, createdBy: caller.uid });
    }
    return purchaseRef.id;
  });

  await writeAudit(shopId, caller.uid, caller.role, "PURCHASE_CREATE", "purchase", purchaseId, { purchaseNo, paidAmount: safePaid, itemsCount: items.length });
  return purchaseId;
});

// =========================================================
// QAYTARISH (RETURN)
// =========================================================
export const createReturnTx = functions.runWith(RUNWITH).https.onCall(async (data, context) => {
  const caller = await getCaller(context);
  const shopId = String(data?.shopId || "");
  assertShop(caller, shopId, { admin: false });

  const db = admin.firestore();
  const saleId = String(data?.saleId || "");
  const items: Array<{ productId: string; qty: number }> = Array.isArray(data?.items) ? data.items : [];
  if (!saleId) throw new functions.https.HttpsError("invalid-argument", "saleId required");
  if (items.length === 0) throw new functions.https.HttpsError("invalid-argument", "Qaytarish savati bo'sh");
  const createdAt = Date.now();
  const opId = String(data?.operationId || `${saleId}_${createdAt}`);

  const result = await db.runTransaction(async (tx) => {
    const saleRef = db.doc(`shops/${shopId}/sales/${saleId}`);
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) throw new functions.https.HttpsError("not-found", "Savdo topilmadi");
    const sale = saleSnap.data() as any;
    if (sale.status === "voided") throw new functions.https.HttpsError("failed-precondition", "Bu savdo VOID qilingan");

    const retRef = db.doc(`shops/${shopId}/returns/${opId}`);
    const existingRet = await tx.get(retRef);
    if (existingRet.exists) { const d = existingRet.data() as any; return { id: retRef.id, totalRefund: Number(d.totalRefund || 0) }; }

    // prior returns (transactional query — admin SDK qo'llab-quvvatlaydi)
    const priorSnap = await tx.get(db.collection(`shops/${shopId}/returns`).where("saleId", "==", saleId));
    const already: Record<string, number> = {};
    priorSnap.forEach((rd) => { for (const ri of ((rd.data() as any).items ?? [])) already[ri.productId] = (already[ri.productId] ?? 0) + Number(ri.qty ?? 0); });

    const prodRefs = items.map((it) => db.doc(`shops/${shopId}/products/${it.productId}`));
    const prodSnaps = await Promise.all(prodRefs.map((r) => tx.get(r)));

    let customerRef: any = null; let customerSnap: any = null;
    if (sale.customerId) { customerRef = db.doc(`shops/${shopId}/customers/${sale.customerId}`); customerSnap = await tx.get(customerRef); }

    const returnItems: any[] = [];
    let totalRefund = 0;
    for (const it of items) {
      const si = (sale.items as any[]).find((x) => x.productId === it.productId);
      if (!si) throw new functions.https.HttpsError("failed-precondition", "Bu mahsulot savdoda yo'q");
      const qty = Number(it.qty);
      if (qty <= 0) throw new functions.https.HttpsError("invalid-argument", "qty > 0");
      const canReturn = Number(si.qty) - (already[it.productId] ?? 0);
      if (canReturn <= 0) throw new functions.https.HttpsError("failed-precondition", `${si.nameSnapshot} — allaqachon to'liq qaytarilgan`);
      if (qty > canReturn) throw new functions.https.HttpsError("failed-precondition", `${si.nameSnapshot} — qaytarish oshib ketdi. Mumkin: ${canReturn}`);
      const unitPrice = Number(si.unitPrice); const unitCost = Number(si.unitCostSnapshot ?? 0);
      const lineTotalRefund = round2(unitPrice * qty);
      returnItems.push({ productId: it.productId, nameSnapshot: si.nameSnapshot, qty, unitPrice, unitCostSnapshot: unitCost, lineTotalRefund });
      totalRefund = round2(totalRefund + lineTotalRefund);
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i]; const psnap = prodSnaps[i];
      if (!psnap.exists) throw new functions.https.HttpsError("not-found", "Mahsulot topilmadi (ombor)");
      const p = psnap.data() as any; const qty = Number(it.qty);
      if (isCutSm(p)) { const { newSheets, newRem } = cutApply(p, qty); tx.update(prodRefs[i], { stock: newSheets, cutRemainderCm: newRem, updatedAt: createdAt }); }
      else tx.update(prodRefs[i], { stock: Number(p.stock ?? 0) + qty, updatedAt: createdAt });
      tx.set(db.collection(`shops/${shopId}/stock_movements`).doc(), { shopId, productId: it.productId, type: "RETURN", qty, unitCostSnapshot: returnItems[i].unitCostSnapshot, createdAt, createdBy: caller.uid, approvedBy: caller.uid, saleId, reason: data?.reason ?? null, note: data?.note ?? null });
    }

    let cashRefund = totalRefund;
    if (customerRef && customerSnap?.exists) {
      const c = customerSnap.data() as any;
      let newBought = round2(Number(c.totalBought ?? 0) - totalRefund); if (newBought < 0) newBought = 0;
      let paid = Number(c.totalPaid ?? 0); let debt = Number(c.debt ?? 0);
      const reduceDebt = Math.min(debt, totalRefund); debt = round2(debt - reduceDebt);
      const remaining = round2(totalRefund - reduceDebt); cashRefund = remaining;
      paid = round2(Math.max(0, paid - remaining));
      tx.update(customerRef, { totalBought: newBought, totalPaid: paid, debt, updatedAt: createdAt });
    }
    if (cashRefund > 0) {
      tx.set(db.collection(`shops/${shopId}/cash_transactions`).doc(), { shopId, type: "REFUND", amount: -Math.abs(cashRefund), paymentType: sale.paymentType, refId: retRef.id, createdAt, createdBy: caller.uid });
    }
    tx.set(retRef, { shopId, saleId, items: returnItems, totalRefund, reason: data?.reason ?? null, note: data?.note ?? null, approvedBy: caller.uid, createdBy: caller.uid, createdAt });
    return { id: retRef.id, totalRefund };
  });

  await writeAudit(shopId, caller.uid, caller.role, "RETURN_CREATE", "return", result.id, { saleId, totalRefund: result.totalRefund });
  return result;
});

// =========================================================
// SAVDO BEKOR (VOID SALE) — admin
// =========================================================
export const voidSaleTx = functions.runWith(RUNWITH).https.onCall(async (data, context) => {
  const caller = await getCaller(context);
  const shopId = String(data?.shopId || "");
  assertShop(caller, shopId, { admin: true });

  const db = admin.firestore();
  const saleId = String(data?.saleId || "");
  if (!saleId) throw new functions.https.HttpsError("invalid-argument", "saleId required");
  const createdAt = Date.now();

  await db.runTransaction(async (tx) => {
    const saleRef = db.doc(`shops/${shopId}/sales/${saleId}`);
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) throw new functions.https.HttpsError("not-found", "Savdo topilmadi");
    const sale = saleSnap.data() as any;
    if (sale.status === "voided") throw new functions.https.HttpsError("failed-precondition", "Savdo allaqachon VOID qilingan");
    if (sale.status !== "completed") throw new functions.https.HttpsError("failed-precondition", "Faqat yakunlangan savdo VOID bo'ladi");

    const priorSnap = await tx.get(db.collection(`shops/${shopId}/returns`).where("saleId", "==", saleId));
    const returnedQty: Record<string, number> = {};
    priorSnap.forEach((rd) => { for (const ri of ((rd.data() as any).items ?? [])) returnedQty[ri.productId] = (returnedQty[ri.productId] ?? 0) + Number(ri.qty ?? 0); });

    const saleItems = (sale.items ?? []) as any[];
    const lineRefs = saleItems.filter((it) => Number(it.qty ?? 0) > 0).map((it) => db.doc(`shops/${shopId}/products/${it.productId}`));
    const lineSnaps = await Promise.all(lineRefs.map((r) => tx.get(r)));

    let customerRef: any = null; let customerSnap: any = null;
    if (sale.customerId) { customerRef = db.doc(`shops/${shopId}/customers/${sale.customerId}`); customerSnap = await tx.get(customerRef); }

    let idx = 0;
    for (const it of saleItems) {
      const qty = Number(it.qty ?? 0); if (!qty) continue;
      const toRestore = Math.max(0, qty - (returnedQty[it.productId] ?? 0));
      const psnap = lineSnaps[idx]; idx++;
      if (psnap && psnap.exists && toRestore > 0) {
        const p = psnap.data() as any;
        if (isCutSm(p)) { const { newSheets, newRem } = cutApply(p, toRestore); tx.update(psnap.ref, { stock: newSheets, cutRemainderCm: newRem, updatedAt: createdAt }); }
        else tx.update(psnap.ref, { stock: Number(p.stock ?? 0) + toRestore, updatedAt: createdAt });
      }
      tx.set(db.collection(`shops/${shopId}/stock_movements`).doc(), { shopId, productId: String(it.productId), type: "VOID_SALE", qty: toRestore, unitCostSnapshot: Number(it.unitCostSnapshot ?? 0), createdAt, createdBy: caller.uid, approvedBy: caller.uid, saleId, saleNo: sale.saleNo, reason: data?.reason ?? null, note: data?.note ?? null });
    }
    if (customerRef && customerSnap?.exists) {
      const c = customerSnap.data() as any;
      tx.update(customerRef, { totalBought: round2(Math.max(0, Number(c.totalBought ?? 0) - Number(sale.total ?? 0))), totalPaid: round2(Math.max(0, Number(c.totalPaid ?? 0) - Number(sale.paidAmount ?? 0))), debt: round2(Math.max(0, Number(c.debt ?? 0) - Number(sale.dueAmount ?? 0))), updatedAt: createdAt });
    }
    const paid = Number(sale.paidAmount ?? 0);
    if (paid > 0) {
      tx.set(db.collection(`shops/${shopId}/cash_transactions`).doc(), { shopId, type: "REFUND", amount: -Math.abs(paid), paymentType: sale.paymentType, refId: saleId, createdAt, createdBy: caller.uid, reason: data?.reason ?? null, note: data?.note ?? null });
    }
    tx.update(saleRef, { status: "voided", voidedAt: createdAt, voidedBy: caller.uid, voidReason: data?.reason ?? null, voidNote: data?.note ?? null, updatedAt: createdAt });
  });

  await writeAudit(shopId, caller.uid, caller.role, "SALE_VOID", "sale", saleId, { reason: data?.reason ?? null });
  return { ok: true };
});

// =========================================================
// KIRIM BEKOR (VOID PURCHASE) — admin
// =========================================================
export const voidPurchaseTx = functions.runWith(RUNWITH).https.onCall(async (data, context) => {
  const caller = await getCaller(context);
  const shopId = String(data?.shopId || "");
  assertShop(caller, shopId, { admin: true });

  const db = admin.firestore();
  const purchaseId = String(data?.purchaseId || "");
  if (!purchaseId) throw new functions.https.HttpsError("invalid-argument", "purchaseId required");
  const createdAt = Date.now();

  await db.runTransaction(async (tx) => {
    const pref = db.doc(`shops/${shopId}/purchases/${purchaseId}`);
    const psnap = await tx.get(pref);
    if (!psnap.exists) throw new functions.https.HttpsError("not-found", "Kirim topilmadi");
    const purchase = psnap.data() as any;
    if (purchase.status === "voided") throw new functions.https.HttpsError("failed-precondition", "Bu kirim allaqachon VOID qilingan");
    const itemsArr = (purchase.items ?? []) as any[];
    if (!Array.isArray(itemsArr) || itemsArr.length === 0) throw new functions.https.HttpsError("failed-precondition", "Kirim itemlari yo'q");

    const prodRefs = itemsArr.map((it) => db.doc(`shops/${shopId}/products/${it.productId}`));
    const prodSnaps = await Promise.all(prodRefs.map((r) => tx.get(r)));

    let supplierRef: any = null; let supplierSnap: any = null;
    if (purchase.supplierId) { supplierRef = db.doc(`shops/${shopId}/suppliers/${purchase.supplierId}`); supplierSnap = await tx.get(supplierRef); }

    for (let i = 0; i < itemsArr.length; i++) {
      const it = itemsArr[i]; const psn = prodSnaps[i];
      if (psn.exists) {
        const p = psn.data() as any;
        const curStock = Number(p.stock ?? 0); const curAvg = Number(p.avgCost ?? 0);
        const qty = Number(it.qty ?? 0); const unitCost = Number(it.unitCost ?? 0);
        const newStock = round2(Math.max(0, curStock - qty));
        let newAvg = curAvg;
        if (newStock <= 0) newAvg = 0;
        else newAvg = round2(Math.max(0, round2(curStock * curAvg - qty * unitCost)) / newStock);
        tx.update(prodRefs[i], { stock: newStock, avgCost: newAvg, updatedAt: createdAt });
      }
      tx.set(db.collection(`shops/${shopId}/stock_movements`).doc(), { shopId, type: "VOID_PURCHASE", productId: it.productId, qty: Number(it.qty ?? 0), unitCost: Number(it.unitCost ?? 0), refType: "PURCHASE_VOID", refId: purchaseId, createdAt, createdBy: caller.uid });
    }
    if (supplierRef && supplierSnap?.exists) {
      const s = supplierSnap.data() as any;
      tx.update(supplierRef, { totalPurchased: round2((s.totalPurchased ?? 0) - Number(purchase.total ?? 0)), totalPaid: round2((s.totalPaid ?? 0) - Number(purchase.paidAmount ?? 0)), balance: round2((s.balance ?? 0) - Number(purchase.dueAmount ?? 0)), updatedAt: createdAt });
    }
    if (Number(purchase.paidAmount ?? 0) > 0) {
      tx.set(db.collection(`shops/${shopId}/cash_transactions`).doc(), { shopId, type: "PURCHASE_VOID", amount: Math.abs(Number(purchase.paidAmount ?? 0)), paymentType: purchase.paymentType ?? "cash", refId: purchaseId, createdAt, createdBy: caller.uid });
    }
    tx.update(pref, { status: "voided", voidedAt: createdAt, voidedBy: caller.uid, updatedAt: createdAt });
  });

  await writeAudit(shopId, caller.uid, caller.role, "PURCHASE_VOID", "purchase", purchaseId, {});
  return { ok: true };
});

// =========================================================
// MIJOZ QARZ TO'LOVI (CUSTOMER PAYMENT)
// =========================================================
export const customerPaymentTx = functions.runWith(RUNWITH).https.onCall(async (data, context) => {
  const caller = await getCaller(context);
  const shopId = String(data?.shopId || "");
  assertShop(caller, shopId, { admin: false });

  const db = admin.firestore();
  const customerId = String(data?.customerId || "");
  const amount = round2(Number(data?.amount || 0));
  const paymentType = data?.paymentType === "card" ? "card" : "cash";
  if (!customerId) throw new functions.https.HttpsError("invalid-argument", "customerId required");
  if (!Number.isFinite(amount) || amount <= 0) throw new functions.https.HttpsError("invalid-argument", "Noto'g'ri summa");
  const createdAt = Date.now();

  const paymentId = await db.runTransaction(async (tx) => {
    const custRef = db.doc(`shops/${shopId}/customers/${customerId}`);
    const snap = await tx.get(custRef);
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Mijoz topilmadi");
    const c = snap.data() as any;
    const debt = Number(c.debt || 0);
    if (debt <= 0) throw new functions.https.HttpsError("failed-precondition", "Bu mijozda qarz yo'q");
    if (amount > debt + 0.001) throw new functions.https.HttpsError("invalid-argument", "To'lov qarzdan oshmasligi kerak");

    const newPaid = round2(Number(c.totalPaid || 0) + amount);
    const newDebt = round2(Math.max(0, debt - amount));
    const payRef = db.collection(`shops/${shopId}/customer_payments`).doc();
    tx.update(custRef, { totalPaid: newPaid, debt: newDebt, updatedAt: createdAt });
    tx.set(payRef, { shopId, customerId, amount, paymentType, note: String(data?.note || ""), debtAfter: newDebt, createdAt, createdBy: caller.uid });
    tx.set(db.collection(`shops/${shopId}/cash_transactions`).doc(), { shopId, type: "CUSTOMER_PAYMENT", amount, paymentType, refId: payRef.id, customerId, createdAt, createdBy: caller.uid });
    return payRef.id;
  });

  await writeAudit(shopId, caller.uid, caller.role, "CUSTOMER_PAYMENT", "customer_payment", paymentId, { customerId, amount, paymentType });
  return paymentId;
});

// =========================================================
// TA'MINOTCHI TO'LOVI (SUPPLIER PAYMENT) — admin
// =========================================================
export const supplierPaymentTx = functions.runWith(RUNWITH).https.onCall(async (data, context) => {
  const caller = await getCaller(context);
  const shopId = String(data?.shopId || "");
  assertShop(caller, shopId, { admin: true });

  const db = admin.firestore();
  const supplierId = String(data?.supplierId || "");
  const pay = round2(Math.abs(Number(data?.amount || 0)));
  const paymentType = data?.paymentType === "card" ? "card" : "cash";
  if (!supplierId) throw new functions.https.HttpsError("invalid-argument", "supplierId required");
  if (!pay || pay <= 0) throw new functions.https.HttpsError("invalid-argument", "To'lov summasi 0 bo'la olmaydi");
  const createdAt = Date.now();

  const paymentId = await db.runTransaction(async (tx) => {
    const sref = db.doc(`shops/${shopId}/suppliers/${supplierId}`);
    const ssnap = await tx.get(sref);
    if (!ssnap.exists) throw new functions.https.HttpsError("not-found", "Ta'minotchi topilmadi");
    const s = ssnap.data() as any;
    const payRef = db.collection(`shops/${shopId}/supplier_payments`).doc();
    tx.update(sref, { totalPaid: round2((s.totalPaid ?? 0) + pay), balance: round2((s.balance ?? 0) - pay), updatedAt: createdAt });
    tx.set(payRef, { shopId, supplierId, supplierNameSnapshot: s.name ?? null, amount: pay, paymentType, note: String(data?.note || ""), createdAt, createdBy: caller.uid });
    tx.set(db.collection(`shops/${shopId}/cash_transactions`).doc(), { shopId, type: "SUPPLIER_PAYMENT", amount: -pay, paymentType, refId: payRef.id, createdAt, createdBy: caller.uid });
    return payRef.id;
  });

  await writeAudit(shopId, caller.uid, caller.role, "SUPPLIER_PAYMENT", "supplier_payment", paymentId, { supplierId, amount: pay, paymentType });
  return paymentId;
});

// =========================================================
// HARAJAT (EXPENSE) — admin
// =========================================================
export const expenseTx = functions.runWith(RUNWITH).https.onCall(async (data, context) => {
  const caller = await getCaller(context);
  const shopId = String(data?.shopId || "");
  assertShop(caller, shopId, { admin: true });

  const db = admin.firestore();
  const amount = round2(Math.abs(Number(data?.amount || 0)));
  const paymentType = data?.paymentType === "card" ? "card" : "cash";
  if (!amount || amount <= 0) throw new functions.https.HttpsError("invalid-argument", "Harajat summasi 0 bo'la olmaydi");
  const createdAt = Date.now();

  const expenseId = await db.runTransaction(async (tx) => {
    const expRef = db.collection(`shops/${shopId}/expenses`).doc();
    tx.set(expRef, { shopId, category: String(data?.category || "Boshqa"), amount, paymentType, note: String(data?.note || ""), createdAt, createdBy: caller.uid });
    tx.set(db.collection(`shops/${shopId}/cash_transactions`).doc(), { shopId, type: "EXPENSE", amount: -amount, paymentType, refId: expRef.id, createdAt, createdBy: caller.uid });
    return expRef.id;
  });

  await writeAudit(shopId, caller.uid, caller.role, "EXPENSE_CREATE", "expense", expenseId, { category: String(data?.category || "Boshqa"), amount, paymentType });
  return expenseId;
});
