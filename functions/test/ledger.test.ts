/**
 * LEDGER (server-authoritative) — INTEGRATSION TESTLAR
 * ====================================================
 * Cloud Functions biznes-mantig'ini HAQIQIY Firestore emulyatorida tekshiradi
 * (firebase-functions-test test.wrap + admin SDK -> emulator).
 *
 * Ishga tushirish (functions papkasidan):
 *   firebase emulators:exec --only firestore "cd functions && npm install && npm test"
 */
process.env.GCLOUD_PROJECT = "demo-audit";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

import { beforeAll, afterAll, beforeEach, describe, test, expect } from "vitest";
import functionsTest from "firebase-functions-test";
import * as admin from "firebase-admin";

const tEnv = functionsTest();
if (admin.apps.length === 0) admin.initializeApp({ projectId: "demo-audit" });
const db = admin.firestore();

import {
  createSaleTx, createPurchaseTx, createReturnTx, voidSaleTx, voidPurchaseTx,
  customerPaymentTx, supplierPaymentTx, expenseTx,
} from "../src/ledger";

const wrap = (fn: any) => tEnv.wrap(fn);
const adminCtx = { auth: { uid: "adminA", token: {} } } as any;
const cashierCtx = { auth: { uid: "cashierA", token: {} } } as any;
const SHOP = "shopA";

async function clearFirestore() {
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/demo-audit/databases/(default)/documents`,
    { method: "DELETE" }
  );
}

async function seedUsers() {
  await db.doc("users/adminA").set({ role: "admin", shopId: SHOP });
  await db.doc("users/cashierA").set({ role: "cashier", shopId: SHOP });
}

const P = (id: string) => db.doc(`shops/${SHOP}/products/${id}`);
const C = (id: string) => db.doc(`shops/${SHOP}/customers/${id}`);
const S = (id: string) => db.doc(`shops/${SHOP}/suppliers/${id}`);

async function getData(ref: FirebaseFirestore.DocumentReference) {
  const s = await ref.get();
  return s.exists ? (s.data() as any) : null;
}
async function countCol(name: string) {
  const s = await db.collection(`shops/${SHOP}/${name}`).get();
  return s.size;
}
async function sumStockMovements(productId: string) {
  const SIGN: Record<string, number> = { IN: 1, OUT: -1, RETURN: 1, VOID_SALE: 1, VOID_PURCHASE: -1 };
  const s = await db.collection(`shops/${SHOP}/stock_movements`).where("productId", "==", productId).get();
  let t = 0;
  s.forEach((d) => { const m = d.data() as any; t += (SIGN[m.type] ?? 0) * Number(m.qty || 0); });
  return t;
}

beforeAll(async () => { await clearFirestore(); });
afterAll(async () => { tEnv.cleanup(); });
beforeEach(async () => { await clearFirestore(); await seedUsers(); });

// =========================================================
describe("KIRIM (createPurchaseTx)", () => {
  test("yangi mahsulot yaratiladi, ombor va avgCost to'g'ri, kassa/ta'minotchi yangilanadi", async () => {
    await S("sup1").set({ shopId: SHOP, name: "Sup", balance: 0, totalPurchased: 0, totalPaid: 0 });
    const pid = await wrap(createPurchaseTx)({
      shopId: SHOP,
      supplier: { id: "sup1", name: "Sup" },
      items: [{ productId: "NEW", qty: 10, unitCost: 5, newProduct: { barcode: "111", name: "Tovar", unit: "dona", price: 8 } }],
      paidAmount: 30,
      paymentType: "cash",
    }, adminCtx);
    expect(typeof pid).toBe("string");

    const prod = await getData(P("p_111"));
    expect(prod.stock).toBe(10);
    expect(prod.avgCost).toBe(5);

    const sup = await getData(S("sup1"));
    expect(sup.totalPurchased).toBe(50);
    expect(sup.totalPaid).toBe(30);
    expect(sup.balance).toBe(20); // due = 50-30

    expect(await countCol("cash_transactions")).toBe(1);
    expect(await countCol("stock_movements")).toBe(1);
  });

  test("mavjud mahsulotga ikkinchi kirim — avgCost o'rtacha hisoblanadi", async () => {
    await wrap(createPurchaseTx)({ shopId: SHOP, supplier: null, items: [{ productId: "NEW", qty: 10, unitCost: 5, newProduct: { barcode: "111", name: "T", unit: "dona", price: 8 } }], paidAmount: 0, paymentType: null }, adminCtx);
    // ikkinchi kirim: 10 dona @ 7 => avg = (10*5 + 10*7)/20 = 6
    await wrap(createPurchaseTx)({ shopId: SHOP, supplier: null, items: [{ productId: "p_111", qty: 10, unitCost: 7 }], paidAmount: 0, paymentType: null }, adminCtx);
    const prod = await getData(P("p_111"));
    expect(prod.stock).toBe(20);
    expect(prod.avgCost).toBe(6);
  });

  test("cashier kirim qila OLMAYDI (admin kerak)", async () => {
    await expect(
      wrap(createPurchaseTx)({ shopId: SHOP, supplier: null, items: [{ productId: "NEW", qty: 1, unitCost: 1, newProduct: { barcode: "9", name: "x", unit: "dona", price: 2 } }], paidAmount: 0, paymentType: null }, cashierCtx)
    ).rejects.toThrow();
  });
});

// =========================================================
describe("SAVDO (createSaleTx)", () => {
  beforeEach(async () => {
    await P("p1").set({ shopId: SHOP, name: "T", stock: 10, avgCost: 5, price: 8 });
    await C("c1").set({ shopId: SHOP, name: "M", debt: 0, totalBought: 0, totalPaid: 0 });
  });

  test("to'liq naqd savdo: ombor kamayadi, kassa va foyda to'g'ri", async () => {
    const r: any = await wrap(createSaleTx)({ shopId: SHOP, paymentType: "cash", customer: null, items: [{ productId: "p1", qty: 3 }], paidAmount: 24 }, cashierCtx);
    expect(r.total).toBe(24);
    expect(r.dueAmount).toBe(0);
    const prod = await getData(P("p1"));
    expect(prod.stock).toBe(7);
    const sale = await getData(db.doc(`shops/${SHOP}/sales/${r.saleId}`));
    expect(sale.profit).toBe(9); // (8-5)*3
    expect(await countCol("cash_transactions")).toBe(1);
  });

  test("qarzga savdo: mijoz debt oshadi", async () => {
    const r: any = await wrap(createSaleTx)({ shopId: SHOP, paymentType: "cash", customer: { id: "c1", name: "M", phone: "1" }, items: [{ productId: "p1", qty: 2 }], paidAmount: 6 }, cashierCtx);
    expect(r.dueAmount).toBe(10); // 16 - 6
    const c = await getData(C("c1"));
    expect(c.totalBought).toBe(16);
    expect(c.totalPaid).toBe(6);
    expect(c.debt).toBe(10);
  });

  test("ombor yetarli emas — xato", async () => {
    await expect(
      wrap(createSaleTx)({ shopId: SHOP, paymentType: "cash", customer: null, items: [{ productId: "p1", qty: 999 }], paidAmount: 0 }, cashierCtx)
    ).rejects.toThrow();
  });

  test("idempotentlik: bir xil operationId ikki marta — bitta savdo, ombor bir marta kamayadi", async () => {
    const op = "op-123";
    const r1: any = await wrap(createSaleTx)({ shopId: SHOP, paymentType: "cash", customer: null, items: [{ productId: "p1", qty: 2 }], paidAmount: 16, operationId: op }, cashierCtx);
    const r2: any = await wrap(createSaleTx)({ shopId: SHOP, paymentType: "cash", customer: null, items: [{ productId: "p1", qty: 2 }], paidAmount: 16, operationId: op }, cashierCtx);
    expect(r1.saleId).toBe(r2.saleId);
    expect(await countCol("sales")).toBe(1);
    const prod = await getData(P("p1"));
    expect(prod.stock).toBe(8); // faqat bir marta -2
  });

  test("savdodan keyin: ombor = stock_movements yig'indisi (invariant)", async () => {
    await wrap(createSaleTx)({ shopId: SHOP, paymentType: "cash", customer: null, items: [{ productId: "p1", qty: 4 }], paidAmount: 32 }, cashierCtx);
    const prod = await getData(P("p1"));
    expect(prod.stock).toBe(6);
    expect(await sumStockMovements("p1")).toBe(-4); // OUT 4 (kirimsiz seed)
  });
});

// =========================================================
describe("QAYTARISH (createReturnTx) va BEKOR (voidSaleTx)", () => {
  let saleId = "";
  beforeEach(async () => {
    await P("p1").set({ shopId: SHOP, name: "T", stock: 10, avgCost: 5, price: 8 });
    await C("c1").set({ shopId: SHOP, name: "M", debt: 0, totalBought: 0, totalPaid: 0 });
    const r: any = await wrap(createSaleTx)({ shopId: SHOP, paymentType: "cash", customer: { id: "c1", name: "M", phone: "1" }, items: [{ productId: "p1", qty: 4 }], paidAmount: 32 }, cashierCtx);
    saleId = r.saleId;
  });

  test("qaytarish: ombor ortadi, kassa REFUND, idempotent", async () => {
    const ret: any = await wrap(createReturnTx)({ shopId: SHOP, saleId, items: [{ productId: "p1", qty: 1 }], operationId: "ret-1" }, cashierCtx);
    expect(ret.totalRefund).toBe(8);
    let prod = await getData(P("p1"));
    expect(prod.stock).toBe(7); // 6 + 1
    // idempotent
    const ret2: any = await wrap(createReturnTx)({ shopId: SHOP, saleId, items: [{ productId: "p1", qty: 1 }], operationId: "ret-1" }, cashierCtx);
    expect(ret2.id).toBe(ret.id);
    prod = await getData(P("p1"));
    expect(prod.stock).toBe(7); // o'zgarmadi
  });

  test("ortiqcha qaytarish — xato", async () => {
    await expect(
      wrap(createReturnTx)({ shopId: SHOP, saleId, items: [{ productId: "p1", qty: 999 }] }, cashierCtx)
    ).rejects.toThrow();
  });

  test("void: faqat qaytarilmagan qism omborga qaytadi, status voided", async () => {
    await wrap(createReturnTx)({ shopId: SHOP, saleId, items: [{ productId: "p1", qty: 1 }], operationId: "ret-1" }, cashierCtx);
    // hozir stock=7, 1 ta qaytarilgan, savdoda 4 ta edi -> qaytarilmagan 3
    await wrap(voidSaleTx)({ shopId: SHOP, saleId }, adminCtx);
    const prod = await getData(P("p1"));
    expect(prod.stock).toBe(10); // 7 + 3 (qaytarilmagan)
    const sale = await getData(db.doc(`shops/${SHOP}/sales/${saleId}`));
    expect(sale.status).toBe("voided");
  });

  test("voided savdoga qaytarish — xato", async () => {
    await wrap(voidSaleTx)({ shopId: SHOP, saleId }, adminCtx);
    await expect(
      wrap(createReturnTx)({ shopId: SHOP, saleId, items: [{ productId: "p1", qty: 1 }] }, cashierCtx)
    ).rejects.toThrow();
  });

  test("cashier void qila OLMAYDI (admin kerak)", async () => {
    await expect(wrap(voidSaleTx)({ shopId: SHOP, saleId }, cashierCtx)).rejects.toThrow();
  });
});

// =========================================================
describe("KIRIM BEKOR (voidPurchaseTx)", () => {
  test("delta-reversal: keyingi kirimni o'chirmasdan teskari qiladi", async () => {
    await S("sup1").set({ shopId: SHOP, name: "Sup", balance: 0, totalPurchased: 0, totalPaid: 0 });
    const pid1 = await wrap(createPurchaseTx)({ shopId: SHOP, supplier: { id: "sup1", name: "Sup" }, items: [{ productId: "NEW", qty: 10, unitCost: 5, newProduct: { barcode: "111", name: "T", unit: "dona", price: 8 } }], paidAmount: 50, paymentType: "cash" }, adminCtx);
    // ikkinchi kirim 10 @ 7 -> stock 20, avg 6
    await wrap(createPurchaseTx)({ shopId: SHOP, supplier: null, items: [{ productId: "p_111", qty: 10, unitCost: 7 }], paidAmount: 0, paymentType: null }, adminCtx);
    // birinchi kirimni bekor qilamiz
    await wrap(voidPurchaseTx)({ shopId: SHOP, purchaseId: pid1 as string }, adminCtx);
    const prod = await getData(P("p_111"));
    expect(prod.stock).toBe(10); // 20 - 10
    // avg: (20*6 - 10*5)/10 = (120-50)/10 = 7
    expect(prod.avgCost).toBe(7);
    const sup = await getData(S("sup1"));
    expect(sup.totalPurchased).toBe(0); // 50 - 50
  });
});

// =========================================================
describe("TO'LOVLAR va HARAJAT", () => {
  test("mijoz qarz to'lovi: debt kamayadi, kassa kirim", async () => {
    await C("c1").set({ shopId: SHOP, name: "M", debt: 100, totalBought: 100, totalPaid: 0 });
    await wrap(customerPaymentTx)({ shopId: SHOP, customerId: "c1", amount: 40, paymentType: "cash" }, cashierCtx);
    const c = await getData(C("c1"));
    expect(c.debt).toBe(60);
    expect(c.totalPaid).toBe(40);
    expect(await countCol("cash_transactions")).toBe(1);
  });

  test("qarzdan ko'p to'lov — xato", async () => {
    await C("c1").set({ shopId: SHOP, name: "M", debt: 10, totalBought: 10, totalPaid: 0 });
    await expect(wrap(customerPaymentTx)({ shopId: SHOP, customerId: "c1", amount: 999, paymentType: "cash" }, cashierCtx)).rejects.toThrow();
  });

  test("ta'minotchi to'lovi (admin): balance kamayadi", async () => {
    await S("sup1").set({ shopId: SHOP, name: "S", balance: 100, totalPurchased: 100, totalPaid: 0 });
    await wrap(supplierPaymentTx)({ shopId: SHOP, supplierId: "sup1", amount: 30, paymentType: "cash" }, adminCtx);
    const s = await getData(S("sup1"));
    expect(s.balance).toBe(70);
    expect(s.totalPaid).toBe(30);
  });

  test("harajat (admin): expense + kassa chiqim", async () => {
    await wrap(expenseTx)({ shopId: SHOP, category: "Ijara", amount: 25, paymentType: "cash" }, adminCtx);
    expect(await countCol("expenses")).toBe(1);
    const cash = await db.collection(`shops/${SHOP}/cash_transactions`).where("type", "==", "EXPENSE").get();
    expect(cash.size).toBe(1);
    expect((cash.docs[0].data() as any).amount).toBe(-25);
  });

  test("cashier harajat kirita OLMAYDI (admin kerak)", async () => {
    await expect(wrap(expenseTx)({ shopId: SHOP, category: "x", amount: 5, paymentType: "cash" }, cashierCtx)).rejects.toThrow();
  });
});
