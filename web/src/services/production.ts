import { getDocs, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { col } from "./paths";
import { functions } from "@/lib/firebase";
import type { Production } from "@/types";
import { round2 } from "@/lib/money";

/**
 * ISHLAB CHIQARISH (Production / Assembly)
 * Xomashyo/detallardan tayyor mahsulot yig'ish — SERVER-AUTHORITATIVE.
 */

export async function listProductions(shopId: string, limitN = 200): Promise<Production[]> {
  try {
    const qs = await getDocs(query(col(shopId, "productions"), orderBy("createdAt", "desc")));
    return qs.docs.slice(0, limitN).map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    const qs = await getDocs(query(col(shopId, "productions")));
    const arr = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Production));
    arr.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return arr.slice(0, limitN);
  }
}

export async function listProductionsByRange(shopId: string, from: number, to: number): Promise<Production[]> {
  const qs = await getDocs(
    query(col(shopId, "productions"), where("createdAt", ">=", from), where("createdAt", "<", to))
  );
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function createProduction(params: {
  shopId: string;
  qtyProduced: number;
  materials: { productId: string; qty: number }[];
  finished:
    | { productId: string }
    | { newProduct: { name: string; barcode: string; price: number; category?: string; unit?: string; minStock?: number } };
  note?: string;
  operationId?: string;
}): Promise<{ id: string; unitCost: number; totalCost: number; productionNo: string }> {
  const call = httpsCallable(functions, "createProductionTx");
  const res = await call({
    shopId: params.shopId,
    qtyProduced: params.qtyProduced,
    materials: params.materials,
    finished: params.finished,
    note: params.note ?? "",
    operationId: params.operationId,
  });
  return res.data as any;
}

/** Oylik hisobot: tayyor mahsulot bo'yicha — necha dona ishlab chiqarildi va 1 dona o'rtacha tannarxi */
export function summarizeByProduct(rows: Production[]) {
  const m = new Map<string, { name: string; qty: number; totalCost: number }>();
  for (const r of rows) {
    const key = r.finishedProductId || r.finishedNameSnapshot;
    const cur = m.get(key) ?? { name: r.finishedNameSnapshot, qty: 0, totalCost: 0 };
    cur.qty = round2(cur.qty + Number(r.qtyProduced || 0));
    cur.totalCost = round2(cur.totalCost + Number(r.totalCost || 0));
    m.set(key, cur);
  }
  return Array.from(m.values())
    .map((v) => ({ ...v, avgUnitCost: v.qty > 0 ? round2(v.totalCost / v.qty) : 0 }))
    .sort((a, b) => b.qty - a.qty);
}
