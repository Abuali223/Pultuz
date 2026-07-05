import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  runTransaction,
  orderBy,
  limit,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { col } from "./paths";
import { functions } from "@/lib/firebase";
import type { Customer, CustomerPayment, PaymentType } from "@/types";

/**
 * customers.ts (CLEAN)
 * - Fixes duplicate createCustomer errors
 * - Ensures `shopId` is written on CREATE (required by your Firestore Rules)
 * - Uses a query constraint on READ (where shopId == shopId) so Firestore rules allow the query
 *   (and avoids composite-index requirements by sorting in JS).
 */

// Optional helper for debugging (you can call this from anywhere)
export function customersPath(shopId: string) {
  return col(shopId, "customers").path;
}

export async function listCustomers(shopId: string): Promise<Customer[]> {
  const qs = await getDocs(query(col(shopId, "customers"), where("shopId", "==", shopId)));

  const items = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Customer[];

  // Sort newest first (no Firestore orderBy => no composite index required)
  items.sort((a: any, b: any) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
  return items;
}

export async function getCustomer(shopId: string, customerId: string): Promise<Customer | null> {
  const snap = await getDoc(doc(col(shopId, "customers"), customerId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) } as Customer;
}

export async function findCustomerByPhone(shopId: string, phone: string): Promise<Customer | null> {
  // Avoid composite index needs: query by shopId then filter by phone locally
  const qs = await getDocs(query(col(shopId, "customers"), where("shopId", "==", shopId)));

  const norm = (phone ?? "").trim();
  const found = qs.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as Customer)
    .find((c: any) => String(c?.phone ?? "").trim() === norm);

  return found ?? null;
}

export async function findCustomerByName(shopId: string, name: string): Promise<Customer | null> {
  const qs = await getDocs(query(col(shopId, "customers"), where("shopId", "==", shopId)));

  const norm = (name ?? "").trim().toLowerCase();
  if (!norm) return null;

  const found = qs.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as Customer)
    .find((c: any) => String(c?.name ?? "").trim().toLowerCase().includes(norm));

  return found ?? null;
}


export type CreateCustomerInput = {
  name: string;
  phone: string;
  // add any optional fields you may send from UI:
  notes?: string;
  address?: string;
};

export async function createCustomer(shopId: string, input: CreateCustomerInput): Promise<string> {
  const now = Date.now();

  // Normalize phone for easy equality match (Telegram bot link, search, etc.)
  const phoneNorm = String(input.phone ?? "")
    .replace(/\D/g, "")
    .replace(/^0/, "")
    .trim();

  const ref = await addDoc(col(shopId, "customers"), {
    shopId, // ✅ REQUIRED by your Rules
    ...input,

    // helpful for Telegram linking / exact matching
    phoneNorm,

    // Optional accounting fields (safe defaults)
    totalBought: 0,
    totalPaid: 0,
    debt: 0,

    createdAt: now,
    updatedAt: now,
  });

  return ref.id;
}

export async function updateCustomer(
  shopId: string,
  customerId: string,
  patch: Partial<Customer>
): Promise<void> {
  // Block changing shopId/createdAt va BALANS maydonlarini client tomonidan.
  // (debt/totalBought/totalPaid faqat server orqali o'zgaradi — rules ham taqiqlaydi.)
  const {
    shopId: _ignoreShopId,
    createdAt: _ignoreCreatedAt,
    debt: _ignoreDebt,
    totalBought: _ignoreTB,
    totalPaid: _ignoreTP,
    ...safePatch
  } = (patch ?? {}) as any;

  // Telefon normallashtirish:
  // - phone bo'lsa: phoneNorm ham hisoblanadi
  // - phoneNorm bo'lsa: ichidagi hamma belgilar tozalanadi
  if (typeof safePatch.phone === "string") {
    const norm = safePatch.phone.replace(/\D/g, "").replace(/^0/, "").trim();
    safePatch.phoneNorm = norm;
  }
  if (typeof safePatch.phoneNorm === "string") {
    safePatch.phoneNorm = safePatch.phoneNorm.replace(/\D/g, "").replace(/^0/, "").trim();
  }

  await updateDoc(doc(col(shopId, "customers"), customerId), {
    ...safePatch,
    updatedAt: Date.now(),
  });
}


export async function deleteCustomer(shopId: string, customerId: string): Promise<void> {
  await deleteDoc(doc(col(shopId, "customers"), customerId));
}



// SERVER-AUTHORITATIVE: mijoz qarz to'lovi Cloud Function (customerPaymentTx) orqali.
// Qarz/to'lov/kassa server tomonida atomar yangilanadi; client to'g'ridan-to'g'ri yoza olmaydi.
export async function addCustomerPayment(
  shopId: string,
  customerId: string,
  input: { amount: number; paymentType: PaymentType; note?: string }
): Promise<string> {
  const call = httpsCallable(functions, "customerPaymentTx");
  const res = await call({
    shopId,
    customerId,
    amount: input.amount,
    paymentType: input.paymentType,
    note: input.note ?? "",
  });
  return res.data as string;
}

export async function listCustomerPayments(
  shopId: string,
  customerId: string,
  opts: { limit?: number } = {}
): Promise<CustomerPayment[]> {
  const lim = opts.limit ?? 50;
  const q = query(
    col(shopId, "customer_payments"),
    where("customerId", "==", customerId),
    orderBy("createdAt", "desc"),
    limit(lim)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data: any = d.data() || {};
    return {
      id: d.id,
      shopId,
      customerId,
      amount: Number(data.amount || 0),
      paymentType: data.paymentType,
      note: data.note || "",
      createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Number(data.createdAt || Date.now()),
      createdBy: data.createdBy || "",
    } as CustomerPayment;
  });
}