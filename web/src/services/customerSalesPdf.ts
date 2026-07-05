import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export async function sendCustomerSalesPdf(params: {
  shopId: string;
  customerId: string;
  from?: string; // YYYY-MM-DD or ISO
  to?: string;   // YYYY-MM-DD or ISO
  target?: "owner" | "customer" | "auto";
}): Promise<{ ok: true; sentTo: string; filename: string }>{
  const fn = httpsCallable(functions, "sendCustomerSalesPdf");
  try {
    const res: any = await fn(params);
    const data: any = res?.data || {};
    if (!data?.ok) {
      throw new Error(data?.error || "Telegramga yuborishda xatolik");
    }
    return data as any;
  } catch (e: any) {
    // Firebase callable errors land here (HTTP 500/400) with useful message.
    const msg = String(e?.message || e || "Telegramga yuborishda xatolik");
    throw new Error(msg);
  }
}
