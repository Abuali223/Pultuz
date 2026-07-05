import { getDocs, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { col } from "./paths";
import { functions } from "@/lib/firebase";
import type { PaymentType, Purchase } from "@/types";

/**
 * SERVER-AUTHORITATIVE: kirim (createPurchase) va kirim bekor (voidPurchase)
 * Cloud Functions orqali bajariladi. O'qishlar bevosita Firestore'dan.
 */

// =========================== READS ===========================

export async function listPurchases(shopId: string, limitN = 50): Promise<Purchase[]> {
  const qs = await getDocs(query(col(shopId, "purchases"), orderBy("createdAt", "desc")));
  return qs.docs.slice(0, limitN).map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function findSupplierByName(shopId: string, name: string) {
  const qs = await getDocs(query(col(shopId, "suppliers"), where("name", "==", name)));
  const first = qs.docs[0];
  if (!first) return null;
  return { id: first.id, ...(first.data() as any) } as any;
}

// ===================== MUTATIONS (server) =====================

export async function createPurchase(params: {
  shopId: string;
  actorId?: string;
  supplier: { id: string; name: string } | null;
  invoiceNo?: string;
  note?: string;
  items: {
    productId: string;
    qty: number;
    unitCost: number;
    newProduct?: {
      barcode: string;
      name: string;
      category?: string;
      unit?: string;
      price: number;
      minStock?: number;
      cutLengthCm?: number;
      cutWidthCm?: number;
    };
  }[];
  paidAmount: number;
  paymentType: PaymentType | null;
}): Promise<string> {
  const call = httpsCallable(functions, "createPurchaseTx");
  const res = await call({
    shopId: params.shopId,
    supplier: params.supplier,
    invoiceNo: params.invoiceNo ?? null,
    note: params.note ?? null,
    items: params.items,
    paidAmount: params.paidAmount,
    paymentType: params.paymentType,
  });
  return res.data as string;
}

export async function voidPurchase(params: {
  shopId: string;
  actorId?: string;
  purchaseId: string;
}): Promise<boolean> {
  const call = httpsCallable(functions, "voidPurchaseTx");
  const res: any = await call({ shopId: params.shopId, purchaseId: params.purchaseId });
  return Boolean(res?.data?.ok ?? true);
}
