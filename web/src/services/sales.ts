import { getDocs, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { col } from "./paths";
import { functions } from "@/lib/firebase";
import type { PaymentType as PayType, Sale, CashTxn } from "@/types";

/**
 * SERVER-AUTHORITATIVE
 * --------------------
 * O'qishlar (list*) bevosita Firestore'dan. O'zgartirishlar (createSale/createReturn/
 * voidSale) esa Cloud Functions (server) orqali — client ombor/pul/qarzni
 * to'g'ridan-to'g'ri o'zgartira olmaydi.
 */

// =========================== READS ===========================

export async function listRecentSales(shopId: string, limitN = 50): Promise<Sale[]> {
  const qs = await getDocs(query(col(shopId, "sales"), orderBy("createdAt", "desc")));
  return qs.docs.slice(0, limitN).map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function listSalesByCustomer(
  shopId: string,
  customerId: string,
  limitN = 50
): Promise<Sale[]> {
  if (!customerId) return [];
  try {
    const qs = await getDocs(
      query(col(shopId, "sales"), where("customerId", "==", customerId), orderBy("createdAt", "desc"))
    );
    return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Sale)).slice(0, limitN);
  } catch (e) {
    const qs = await getDocs(query(col(shopId, "sales"), where("customerId", "==", customerId)));
    const arr = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Sale));
    arr.sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return arr.slice(0, limitN);
  }
}

export async function listCashTxns(shopId: string): Promise<CashTxn[]> {
  const qs = await getDocs(query(col(shopId, "cash_transactions"), orderBy("createdAt", "desc")));
  return qs.docs.map((d) => {
    const data = d.data() as any;
    return { id: d.id, ...data, createdBy: data.createdBy ?? data.actorId ?? "system" } as CashTxn;
  });
}

// ===================== MUTATIONS (server) =====================

export async function createSale(params: {
  shopId: string;
  actorId?: string; // server caller.uid ishlatadi; client qiymati e'tiborga olinmaydi
  paymentType: PayType;
  customer: { id: string; name: string; phone: string } | null;
  /** unitPrice — ixtiyoriy: savdo paytida qo'lda o'zgartirilgan narx. Yuborilmasa katalog narxi. */
  items: { productId: string; qty: number; unitPrice?: number }[];
  paidAmount: number;
  note?: string;
  operationId?: string; // idempotentlik (offline replay)
}): Promise<{ saleId: string; saleNo: string; total: number; paidAmount: number; dueAmount: number }> {
  const call = httpsCallable(functions, "createSaleTx");
  const res = await call({
    shopId: params.shopId,
    paymentType: params.paymentType,
    customer: params.customer,
    items: params.items,
    paidAmount: params.paidAmount,
    note: params.note ?? "",
    operationId: params.operationId,
  });
  return res.data as any;
}

export async function createReturn(params: {
  shopId: string;
  actorId?: string;
  approvedBy?: string;
  saleId: string;
  operationId?: string;
  items: { productId: string; qty: number }[];
  reason?: string;
  note?: string;
}): Promise<{ id: string; totalRefund: number }> {
  const call = httpsCallable(functions, "createReturnTx");
  const res = await call({
    shopId: params.shopId,
    saleId: params.saleId,
    items: params.items,
    operationId: params.operationId,
    reason: params.reason ?? null,
    note: params.note ?? null,
  });
  return res.data as any;
}

export async function voidSale(params: {
  shopId: string;
  actorId?: string;
  approvedBy?: string;
  saleId: string;
  reason?: string;
  note?: string;
}): Promise<boolean> {
  const call = httpsCallable(functions, "voidSaleTx");
  const res: any = await call({
    shopId: params.shopId,
    saleId: params.saleId,
    reason: params.reason ?? null,
    note: params.note ?? null,
  });
  return Boolean(res?.data?.ok ?? true);
}
