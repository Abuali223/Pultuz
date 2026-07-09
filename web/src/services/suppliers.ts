import { addDoc, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { col } from "./paths";
import { functions } from "@/lib/firebase";
import type { PaymentType, Supplier, SupplierPayment } from "@/types";

export async function listSuppliers(shopId: string): Promise<Supplier[]> {
  const qs = await getDocs(query(col(shopId, "suppliers"), orderBy("updatedAt", "desc")));
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function createSupplier(params: {
  shopId: string;
  name: string;
  phone?: string;
  note?: string;
}) {
  const { shopId } = params;
  const now = Date.now();
  // Firestore `undefined` qiymatni qabul qilmaydi — bo'sh maydonlarni "" ga aylantiramiz.
  const ref = await addDoc(col(shopId, "suppliers"), {
    shopId,
    name: String(params.name || "").trim(),
    phone: String(params.phone || "").trim(),
    note: String(params.note || "").trim(),
    // Balans 0 dan boshlanadi (rules talab qiladi); xarid/to'lov server orqali o'zgaradi.
    totalPurchased: 0,
    totalPaid: 0,
    balance: 0,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateSupplier(shopId: string, supplierId: string, patch: Partial<Supplier>) {
  // Eslatma: balance/totalPurchased/totalPaid maydonlarini bu yerdan o'zgartirib bo'lmaydi
  // (Firestore rules taqiqlaydi) — ular faqat server (Cloud Functions) orqali o'zgaradi.
  await updateDoc(doc(col(shopId, "suppliers"), supplierId), { ...patch, updatedAt: Date.now() });
}

export async function deleteSupplier(shopId: string, supplierId: string) {
  await deleteDoc(doc(col(shopId, "suppliers"), supplierId));
}

// SERVER-AUTHORITATIVE: ta'minotchi to'lovi Cloud Function orqali.
export async function createSupplierPayment(params: {
  shopId: string;
  supplierId: string;
  amount: number;
  paymentType: PaymentType;
  note?: string;
  actorId?: string;
}): Promise<string> {
  const call = httpsCallable(functions, "supplierPaymentTx");
  const res = await call({
    shopId: params.shopId,
    supplierId: params.supplierId,
    amount: params.amount,
    paymentType: params.paymentType,
    note: params.note ?? "",
  });
  return res.data as string;
}

export async function listSupplierPayments(shopId: string, supplierId?: string): Promise<SupplierPayment[]> {
  const qs = await getDocs(query(col(shopId, "supplier_payments"), orderBy("createdAt", "desc")));
  const all = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SupplierPayment[];
  if (!supplierId) return all;
  return all.filter((p) => p.supplierId === supplierId);
}
