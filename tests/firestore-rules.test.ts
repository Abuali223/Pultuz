/**
 * FIRESTORE RULES — REAL EMULATOR TESTLARI
 * ========================================
 * Bu testlar haqiqiy Firestore emulyatorida ishlaydi va xavfsizlik qoidalarini
 * (server-authoritative model) tekshiradi:
 *   - kirish matritsasi (rol / ijara izolyatsiyasi)
 *   - ledger kolleksiyalariga client YOZA OLMASLIGI (faqat server)
 *   - products/customers/suppliers balans maydonlari himoyasi
 *   - foydalanuvchi o'zini admin qila olmasligi
 *
 * Ishga tushirish (AUDIT papkasidan):
 *   firebase emulators:exec --only firestore "cd tests && npm i && npm test"
 */
import { readFileSync } from "fs";
import { beforeAll, afterAll, beforeEach, describe, test } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, addDoc, collection } from "firebase/firestore";

const SUPER_ADMIN_UID = "M8WKl0BlBnPanTU6Hh60SumTpQu1";
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-audit",
    firestore: {
      rules: readFileSync(new URL("../firebase/firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Seed: users + bitta shop ma'lumotlari (qoidalar o'chirilgan holatda)
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/adminA"), { role: "admin", shopId: "shopA" });
    await setDoc(doc(db, "users/cashierA"), { role: "cashier", shopId: "shopA" });
    await setDoc(doc(db, "users/accountantA"), { role: "accountant", shopId: "shopA" });
    await setDoc(doc(db, "users/adminB"), { role: "admin", shopId: "shopB" });
    await setDoc(doc(db, "users/pendingU"), { role: "pending", shopId: "" });

    await setDoc(doc(db, "shops/shopA"), { name: "Shop A", status: "active" });
    await setDoc(doc(db, "shops/shopA/products/p1"), { shopId: "shopA", name: "Tovar", stock: 10, avgCost: 5, price: 8 });
    await setDoc(doc(db, "shops/shopA/customers/c1"), { shopId: "shopA", name: "Mijoz", debt: 100, totalBought: 100, totalPaid: 0 });
    await setDoc(doc(db, "shops/shopA/suppliers/s1"), { shopId: "shopA", name: "Taminotchi", balance: 50, totalPurchased: 50, totalPaid: 0 });
    await setDoc(doc(db, "shops/shopA/sales/sale1"), { shopId: "shopA", total: 80, status: "completed", createdBy: "cashierA" });
  });
});

function asAdmin() { return env.authenticatedContext("adminA").firestore(); }
function asCashier() { return env.authenticatedContext("cashierA").firestore(); }
function asAccountant() { return env.authenticatedContext("accountantA").firestore(); }
function asAdminB() { return env.authenticatedContext("adminB").firestore(); }
function asSuper() { return env.authenticatedContext(SUPER_ADMIN_UID).firestore(); }
function asUnauth() { return env.unauthenticatedContext().firestore(); }

// =========================================================
describe("1) Kirish matritsasi (read)", () => {
  test("cashier o'z shopidagi products/sales ni o'qiy oladi", async () => {
    const db = asCashier();
    await assertSucceeds(getDoc(doc(db, "shops/shopA/products/p1")));
    await assertSucceeds(getDoc(doc(db, "shops/shopA/sales/sale1")));
  });

  test("accountant (faqat o'qish roli) ham o'qiy oladi", async () => {
    const db = asAccountant();
    await assertSucceeds(getDoc(doc(db, "shops/shopA/products/p1")));
    await assertSucceeds(getDoc(doc(db, "shops/shopA/customers/c1")));
  });

  test("boshqa shop admini (shopB) shopA ni o'qiy OLMAYDI", async () => {
    const db = asAdminB();
    await assertFails(getDoc(doc(db, "shops/shopA/products/p1")));
    await assertFails(getDoc(doc(db, "shops/shopA/sales/sale1")));
  });

  test("login qilmagan foydalanuvchi o'qiy OLMAYDI", async () => {
    const db = asUnauth();
    await assertFails(getDoc(doc(db, "shops/shopA/products/p1")));
  });

  test("superAdmin hamma shopni o'qiy oladi", async () => {
    const db = asSuper();
    await assertSucceeds(getDoc(doc(db, "shops/shopA/products/p1")));
  });
});

// =========================================================
describe("2) LEDGER kolleksiyalari — client YOZA OLMAYDI (server-only)", () => {
  const ledger: Array<[string, any]> = [
    ["sales", { shopId: "shopA", total: 10, status: "completed", createdBy: "cashierA" }],
    ["purchases", { shopId: "shopA", total: 10, status: "completed", createdBy: "adminA" }],
    ["returns", { shopId: "shopA", saleId: "sale1", totalRefund: 5, createdBy: "cashierA" }],
    ["cash_transactions", { shopId: "shopA", type: "SALE", amount: 10, createdBy: "cashierA" }],
    ["stock_movements", { shopId: "shopA", productId: "p1", type: "OUT", qty: 1, createdBy: "cashierA" }],
    ["supplier_payments", { shopId: "shopA", supplierId: "s1", amount: 5, createdBy: "adminA" }],
    ["customer_payments", { shopId: "shopA", customerId: "c1", amount: 5, createdBy: "cashierA" }],
    ["expenses", { shopId: "shopA", category: "x", amount: 5, createdBy: "adminA" }],
    ["audit_logs", { shopId: "shopA", actionType: "X", createdBy: "cashierA" }],
  ];

  for (const [coll, data] of ledger) {
    test(`cashier ${coll} ga yoza OLMAYDI`, async () => {
      const db = asCashier();
      await assertFails(addDoc(collection(db, `shops/shopA/${coll}`), data));
    });
    test(`admin ${coll} ga yoza OLMAYDI`, async () => {
      const db = asAdmin();
      await assertFails(addDoc(collection(db, `shops/shopA/${coll}`), data));
    });
  }
});

// =========================================================
describe("3) PRODUCTS — balans maydonlari himoyasi", () => {
  test("admin katalog maydonini (narx) o'zgartira oladi", async () => {
    const db = asAdmin();
    await assertSucceeds(updateDoc(doc(db, "shops/shopA/products/p1"), { price: 9, updatedAt: Date.now() }));
  });

  test("admin stock ni o'zgartira OLMAYDI (faqat server)", async () => {
    const db = asAdmin();
    await assertFails(updateDoc(doc(db, "shops/shopA/products/p1"), { stock: 999, updatedAt: Date.now() }));
  });

  test("admin avgCost ni o'zgartira OLMAYDI", async () => {
    const db = asAdmin();
    await assertFails(updateDoc(doc(db, "shops/shopA/products/p1"), { avgCost: 1, updatedAt: Date.now() }));
  });

  test("cashier mahsulotni o'zgartira OLMAYDI", async () => {
    const db = asCashier();
    await assertFails(updateDoc(doc(db, "shops/shopA/products/p1"), { price: 9 }));
  });

  test("admin yangi mahsulotni stock=0 bilan yarata oladi", async () => {
    const db = asAdmin();
    await assertSucceeds(setDoc(doc(db, "shops/shopA/products/p2"), { shopId: "shopA", name: "Yangi", stock: 0, avgCost: 0, price: 5 }));
  });

  test("admin stock>0 bilan mahsulot yarata OLMAYDI", async () => {
    const db = asAdmin();
    await assertFails(setDoc(doc(db, "shops/shopA/products/p3"), { shopId: "shopA", name: "Yangi", stock: 100, avgCost: 0, price: 5 }));
  });
});

// =========================================================
describe("4) CUSTOMERS — qarz maydonlari himoyasi", () => {
  test("cashier yangi mijozni debt=0 bilan yarata oladi", async () => {
    const db = asCashier();
    await assertSucceeds(setDoc(doc(db, "shops/shopA/customers/c2"), { shopId: "shopA", name: "Yangi", debt: 0, totalBought: 0, totalPaid: 0 }));
  });

  test("cashier debt>0 bilan mijoz yarata OLMAYDI", async () => {
    const db = asCashier();
    await assertFails(setDoc(doc(db, "shops/shopA/customers/c3"), { shopId: "shopA", name: "Yangi", debt: 500, totalBought: 0, totalPaid: 0 }));
  });

  test("cashier mijoz nomini o'zgartira oladi", async () => {
    const db = asCashier();
    await assertSucceeds(updateDoc(doc(db, "shops/shopA/customers/c1"), { name: "Yangi nom", updatedAt: Date.now() }));
  });

  test("cashier mijoz qarzini o'zgartira OLMAYDI", async () => {
    const db = asCashier();
    await assertFails(updateDoc(doc(db, "shops/shopA/customers/c1"), { debt: 0 }));
  });
});

// =========================================================
describe("5) SUPPLIERS — balans maydonlari himoyasi", () => {
  test("admin balance=0 bilan ta'minotchi yarata oladi", async () => {
    const db = asAdmin();
    await assertSucceeds(setDoc(doc(db, "shops/shopA/suppliers/s2"), { shopId: "shopA", name: "Yangi", balance: 0, totalPurchased: 0, totalPaid: 0 }));
  });

  test("admin balansni o'zgartira OLMAYDI", async () => {
    const db = asAdmin();
    await assertFails(updateDoc(doc(db, "shops/shopA/suppliers/s1"), { balance: 0 }));
  });

  test("cashier ta'minotchi yarata OLMAYDI (admin kerak)", async () => {
    const db = asCashier();
    await assertFails(setDoc(doc(db, "shops/shopA/suppliers/s9"), { shopId: "shopA", name: "Y", balance: 0, totalPurchased: 0, totalPaid: 0 }));
  });
});

// =========================================================
describe("6) Ko'p-ijara izolyatsiyasi (multi-tenant)", () => {
  test("shopB admini shopA mijozini o'qiy/yoza OLMAYDI", async () => {
    const db = asAdminB();
    await assertFails(getDoc(doc(db, "shops/shopA/customers/c1")));
    await assertFails(updateDoc(doc(db, "shops/shopA/customers/c1"), { name: "x" }));
  });
});

// =========================================================
describe("7) USERS — o'zini admin qila olmaslik", () => {
  test("foydalanuvchi o'zini 'pending' bilan yarata oladi", async () => {
    const db = env.authenticatedContext("newUser").firestore();
    await assertSucceeds(setDoc(doc(db, "users/newUser"), { role: "pending", shopId: "" }));
  });

  test("foydalanuvchi o'zini darhol 'admin' qila OLMAYDI (create)", async () => {
    const db = env.authenticatedContext("evilUser").firestore();
    await assertFails(setDoc(doc(db, "users/evilUser"), { role: "admin", shopId: "shopA" }));
  });

  test("cashier o'z rolini admin ga o'zgartira OLMAYDI (update)", async () => {
    const db = asCashier();
    await assertFails(updateDoc(doc(db, "users/cashierA"), { role: "admin" }));
  });

  test("foydalanuvchi boshqa userni yarata OLMAYDI", async () => {
    const db = env.authenticatedContext("evilUser").firestore();
    await assertFails(setDoc(doc(db, "users/victim"), { role: "pending", shopId: "" }));
  });
});
