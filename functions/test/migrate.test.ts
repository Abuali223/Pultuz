/**
 * Migratsiya testi (emulyator): Timestamp -> raqam (ms).
 * Ishga tushirish: firebase emulators:exec --only firestore "cd functions && npm test"
 */
process.env.GCLOUD_PROJECT = "demo-audit";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

import { beforeEach, describe, test, expect } from "vitest";
import * as admin from "firebase-admin";
// CJS skriptdan import (haqiqiy migratsiya mantig'i shu yerda sinaladi)
import { migrateTimestamps } from "../scripts/migrateTimestamps.js";

if (admin.apps.length === 0) admin.initializeApp({ projectId: "demo-audit" });
const db = admin.firestore();

async function clear() {
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/demo-audit/databases/(default)/documents`,
    { method: "DELETE" }
  );
}

beforeEach(clear);

describe("migrateTimestamps", () => {
  test("Timestamp createdAt/updatedAt -> raqam, raqamlar tegmaydi", async () => {
    await db.doc("shops/shopA").set({ name: "A" });
    const ref = db.doc("shops/shopA/customer_payments/pay1");
    await ref.set({
      shopId: "shopA",
      amount: 10,
      createdAt: admin.firestore.Timestamp.fromMillis(1700000000000),
      updatedAt: admin.firestore.Timestamp.fromMillis(1700000000500),
    });
    // allaqachon raqam — o'zgarmasligi kerak
    await db.doc("shops/shopA/sales/s1").set({ shopId: "shopA", total: 5, createdAt: 1700000000001 });

    const res = await migrateTimestamps(db, { dryRun: false });

    const after = (await ref.get()).data() as any;
    expect(typeof after.createdAt).toBe("number");
    expect(after.createdAt).toBe(1700000000000);
    expect(typeof after.updatedAt).toBe("number");
    expect(after.updatedAt).toBe(1700000000500);
    expect(after.amount).toBe(10); // boshqa maydon tegilmadi

    const sale = (await db.doc("shops/shopA/sales/s1").get()).data() as any;
    expect(sale.createdAt).toBe(1700000000001); // raqam o'zgarmadi

    expect(res.changed).toBeGreaterThanOrEqual(1);
  });

  test("dry-run: hisoblaydi, lekin HECH NARSA yozmaydi", async () => {
    await db.doc("shops/shopB").set({ name: "B" });
    const ref = db.doc("shops/shopB/sales/x1");
    await ref.set({ shopId: "shopB", total: 1, createdAt: admin.firestore.Timestamp.fromMillis(123) });

    const res = await migrateTimestamps(db, { dryRun: true });

    const after = (await ref.get()).data() as any;
    // hali ham Timestamp (yozilmadi)
    expect(typeof after.createdAt.toMillis).toBe("function");
    expect(res.changed).toBeGreaterThanOrEqual(1);
  });
});
