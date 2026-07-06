import { getDocs, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { col } from "./paths";
import { functions } from "@/lib/firebase";
import type { Expense } from "@/types";

export async function listExpenses(shopId: string): Promise<Expense[]> {
  const qs = await getDocs(query(col(shopId, "expenses"), orderBy("createdAt", "desc")));
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

// SERVER-AUTHORITATIVE: harajat Cloud Function orqali yoziladi.
export async function createExpense(params: Omit<Expense, "id"> & { operationId?: string }): Promise<string> {
  const call = httpsCallable(functions, "expenseTx");
  const res = await call({
    shopId: params.shopId,
    category: (params as any).category ?? "Boshqa",
    amount: params.amount,
    paymentType: params.paymentType,
    note: (params as any).note ?? "",
    operationId: (params as any).operationId,
  });
  return res.data as string;
}
