import {
  addDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { col } from "./paths";
import type { Order, OrderItem, OrderSource, OrderStatus } from "@/types";
import { round2 } from "@/lib/money";

/**
 * BUYURTMALAR
 * -----------
 * Buyurtma ombor/pul/qarzga tegmaydi — u faqat "so'rov" (online yoki offline).
 * Mijoz buyurtmani olib ketganda savdo POS orqali rasmiylashtiriladi.
 * Har bir holat o'zgarishi statusHistory da (kim, qachon) saqlanadi.
 */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Yangi",
  preparing: "Tayyorlanmoqda",
  delivered: "Yetkazildi",
  cancelled: "Bekor qilindi",
};

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  online: "Online",
  offline: "Offline",
};

export async function listOrders(shopId: string, limitN = 200): Promise<Order[]> {
  try {
    const qs = await getDocs(query(col(shopId, "orders"), orderBy("createdAt", "desc")));
    return qs.docs.slice(0, limitN).map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    // orderBy indeksi bo'lmasa — client tomonda saralaymiz
    const qs = await getDocs(query(col(shopId, "orders")));
    const arr = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Order));
    arr.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return arr.slice(0, limitN);
  }
}

export async function listOrdersByRange(shopId: string, from: number, to: number): Promise<Order[]> {
  const qs = await getDocs(
    query(col(shopId, "orders"), where("createdAt", ">=", from), where("createdAt", "<", to))
  );
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function createOrder(params: {
  shopId: string;
  actorId: string;
  source: OrderSource;
  customerName: string;
  customerPhone?: string;
  address?: string;
  items: OrderItem[];
  note?: string;
}): Promise<string> {
  const now = Date.now();
  const items = (params.items || []).filter((it) => it.name.trim() && Number(it.qty) > 0);
  const total = round2(items.reduce((a, it) => a + Number(it.price || 0) * Number(it.qty || 0), 0));
  const orderNo = `B-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(
    new Date().getDate()
  ).padStart(2, "0")}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

  const ref = await addDoc(col(params.shopId, "orders"), {
    shopId: params.shopId,
    orderNo,
    source: params.source,
    status: "new" as OrderStatus,
    customerName: params.customerName.trim(),
    customerPhone: (params.customerPhone || "").trim(),
    address: (params.address || "").trim(),
    items,
    total,
    note: (params.note || "").trim(),
    statusHistory: [{ status: "new" as OrderStatus, at: now, by: params.actorId }],
    createdAt: now,
    createdBy: params.actorId,
    updatedAt: now,
  });
  return ref.id;
}

export async function setOrderStatus(params: {
  shopId: string;
  orderId: string;
  actorId: string;
  status: OrderStatus;
  current: Order;
}) {
  const now = Date.now();
  const history = Array.isArray(params.current.statusHistory) ? params.current.statusHistory : [];
  await updateDoc(doc(col(params.shopId, "orders"), params.orderId), {
    status: params.status,
    statusHistory: [...history, { status: params.status, at: now, by: params.actorId }],
    updatedAt: now,
  });
}

/** Oylik hisobot: holatlar bo'yicha soni va jami summasi */
export function summarizeOrders(orders: Order[]) {
  const byStatus: Record<OrderStatus, { count: number; total: number }> = {
    new: { count: 0, total: 0 },
    preparing: { count: 0, total: 0 },
    delivered: { count: 0, total: 0 },
    cancelled: { count: 0, total: 0 },
  };
  let online = 0;
  let offline = 0;
  for (const o of orders) {
    const st = (o.status || "new") as OrderStatus;
    if (byStatus[st]) {
      byStatus[st].count += 1;
      byStatus[st].total = round2(byStatus[st].total + Number(o.total || 0));
    }
    if (o.source === "online") online += 1;
    else offline += 1;
  }
  return { byStatus, online, offline, count: orders.length };
}
