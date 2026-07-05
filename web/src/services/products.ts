import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { col } from "./paths";
import type { Product } from "@/types";
import { generateEAN13 } from "@/lib/ean13";
import { round2 } from "@/lib/money";

export async function listProducts(shopId: string): Promise<Product[]> {
  const qs = await getDocs(query(col(shopId, "products"), orderBy("updatedAt", "desc")));
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function findProductByBarcode(shopId: string, barcode: string): Promise<Product | null> {
  const qs = await getDocs(query(col(shopId, "products"), where("barcode", "==", barcode)));
  const first = qs.docs[0];
  if (!first) return null;
  return { id: first.id, ...(first.data() as any) } as Product;
}

export async function createProduct(
  shopId: string,
  input: Omit<Product, "id" | "shopId" | "createdAt" | "updatedAt">
) {
  const now = Date.now();

  // barcode optional: if empty -> generate internal EAN-13 (prefix 290) and ensure uniqueness
  let barcode = String((input as any).barcode || "").trim();
  barcode = barcode.replace(/\D/g, "");
  if (!barcode) {
    for (let i = 0; i < 8; i++) {
      const candidate = generateEAN13("290");
      const exists = await findProductByBarcode(shopId, candidate);
      if (!exists) {
        barcode = candidate;
        break;
      }
    }
    if (!barcode) throw new Error("Barcode generatsiya qilinmadi, qayta urinib ko'ring");
  }

  const ref = await addDoc(col(shopId, "products"), {
    shopId,
    ...input,
    barcode,
    createdAt: now,
    updatedAt: now,
  });

  return ref.id;
}

export async function updateProduct(shopId: string, productId: string, patch: Partial<Product>) {
  await updateDoc(doc(col(shopId, "products"), productId), { ...patch, updatedAt: Date.now() });
}

export async function stockIn(params: {
  shopId: string;
  productId: string;
  qty: number;
  unitCost: number;
  actorId: string;
}) {
  const { shopId, productId, qty, unitCost } = params;
  if (qty <= 0) throw new Error("qty must be > 0");
  if (unitCost < 0) throw new Error("unitCost must be >= 0");

  await runTransaction(col(shopId, "products").firestore, async (tx) => {
    const pref = doc(col(shopId, "products"), productId);
    const snap = await tx.get(pref);
    if (!snap.exists()) throw new Error("Product not found");
    const p = snap.data() as any as Product;

    const oldStock = Number(p.stock ?? 0);
    const oldAvg = Number(p.avgCost ?? 0);
    const newStock = oldStock + qty;
    const newAvg = newStock === 0 ? 0 : round2((oldAvg * oldStock + unitCost * qty) / newStock);

    tx.update(pref, { stock: newStock, avgCost: newAvg, updatedAt: Date.now() });

    const mvRef = doc(col(shopId, "stock_movements"));
    tx.set(mvRef, {
      shopId,
      productId,
      type: "IN",
      qty,
      unitCost,
      createdAt: Date.now(),
      createdBy: params.actorId,
    });
  });
}
