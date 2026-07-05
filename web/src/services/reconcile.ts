import { getDocs } from "firebase/firestore";
import { col } from "./paths";
import { round2 } from "@/lib/money";

/**
 * SELF-AUDIT / YARASHTIRISH (Reconciliation)
 * =========================================
 * Bu modul "auditor" vazifasini bajaradi: ombor va pul yozuvlarini birlamchi
 * manbalardan qayta hisoblab, saqlangan qiymatlar bilan solishtiradi.
 *
 * Tekshiriladigan invariantlar:
 *  A) Mahsulot ombori  = stock_movements yig'indisi (dona mahsulotlar uchun)
 *  B) Savdo izchilligi: total = Σ(item.lineTotal), paid + due = total, profit = Σ(item.profit)
 *  C) Mijoz: debt = totalBought − totalPaid  (va debt ≥ 0)
 *  D) Ta'minotchi: balance = totalPurchased − totalPaid
 *  E) Kassa qoldig'i = Σ(cash_transactions.amount)  (axborot uchun)
 *
 * Natija: hech qanday nomuvofiqlik bo'lmasa `ok: true`. Aks holda har bir
 * muammo aniq ko'rsatiladi (qaysi obyekt, kutilgan vs haqiqiy, farq).
 */

const TOL = 0.01; // float bardoshlilik

// stock_movements turlari uchun ishora (ombor o'zgarishi yo'nalishi)
const MOVE_SIGN: Record<string, number> = {
  IN: +1,
  OUT: -1,
  RETURN: +1,
  VOID_SALE: +1,
  VOID_PURCHASE: -1,
  ADJUST_IN: +1,
  ADJUST_OUT: -1,
};

export type ReconIssue = {
  kind:
    | "STOCK_MISMATCH"
    | "SALE_TOTAL_MISMATCH"
    | "SALE_PAID_DUE_MISMATCH"
    | "SALE_PROFIT_MISMATCH"
    | "CUSTOMER_DEBT_MISMATCH"
    | "CUSTOMER_NEGATIVE_DEBT"
    | "SUPPLIER_BALANCE_MISMATCH"
    | "NEGATIVE_STOCK"
    | "ORPHAN_MOVEMENT";
  entity: string; // id yoki nomi
  label: string; // o'qishga qulay tavsif
  expected: number;
  actual: number;
  diff: number;
};

export type ReconReport = {
  ok: boolean;
  checkedAt: number;
  counts: {
    products: number;
    sales: number;
    returns: number;
    customers: number;
    suppliers: number;
    movements: number;
    cashTxns: number;
  };
  summary: {
    cashBalance: number; // Σ cash_transactions.amount
    cashIn: number;
    cashOut: number;
    totalDebt: number; // Σ customer.debt
    totalSupplierBalance: number; // Σ supplier.balance
    stockValueAvgCost: number; // Σ stock * avgCost
  };
  issues: ReconIssue[];
};

function isCut(p: any): boolean {
  return String(p?.unit ?? "").trim() === "sm" && Number(p?.cutWidthCm ?? 0) > 0;
}

export async function runReconciliation(shopId: string): Promise<ReconReport> {
  const [productsS, salesS, returnsS, customersS, suppliersS, cashS, movesS] = await Promise.all([
    getDocs(col(shopId, "products")),
    getDocs(col(shopId, "sales")),
    getDocs(col(shopId, "returns")),
    getDocs(col(shopId, "customers")),
    getDocs(col(shopId, "suppliers")),
    getDocs(col(shopId, "cash_transactions")),
    getDocs(col(shopId, "stock_movements")),
  ]);

  const products = productsS.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const sales = salesS.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const customers = customersS.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const suppliers = suppliersS.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const cash = cashS.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const moves = movesS.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const issues: ReconIssue[] = [];

  // ---- A) Ombor = stock_movements yig'indisi (dona mahsulotlar) ----
  const movByProduct = new Map<string, number>();
  const productIds = new Set(products.map((p) => p.id));
  for (const mv of moves) {
    const pid = String(mv.productId || "");
    if (!pid) continue;
    const sign = MOVE_SIGN[String(mv.type || "")] ?? 0;
    movByProduct.set(pid, (movByProduct.get(pid) ?? 0) + sign * Number(mv.qty || 0));
    if (!productIds.has(pid)) {
      // harakat bor, lekin mahsulot yo'q (o'chirilgan) — faqat bir marta belgilaymiz
    }
  }

  for (const p of products) {
    const actual = Number(p.stock ?? 0);
    if (actual < 0) {
      issues.push({
        kind: "NEGATIVE_STOCK",
        entity: p.id,
        label: `Manfiy ombor: ${p.name ?? p.id}`,
        expected: 0,
        actual,
        diff: actual,
      });
    }
    if (isCut(p)) continue; // cut (sm) mahsulot ombori sheet+qoldiq sifatida saqlanadi — alohida mantiq
    const expected = round2(movByProduct.get(p.id) ?? 0);
    if (Math.abs(expected - actual) > TOL) {
      issues.push({
        kind: "STOCK_MISMATCH",
        entity: p.id,
        label: `Ombor mos emas: ${p.name ?? p.id}`,
        expected,
        actual,
        diff: round2(actual - expected),
      });
    }
  }

  // ---- B) Savdo izchilligi ----
  for (const s of sales) {
    const items = Array.isArray(s.items) ? s.items : [];
    const itemsTotal = round2(items.reduce((a: number, it: any) => a + Number(it.lineTotal || 0), 0));
    const total = round2(Number(s.total || 0));
    if (Math.abs(itemsTotal - total) > TOL) {
      issues.push({
        kind: "SALE_TOTAL_MISMATCH",
        entity: s.id,
        label: `Savdo summasi mos emas: ${s.saleNo ?? s.id}`,
        expected: itemsTotal,
        actual: total,
        diff: round2(total - itemsTotal),
      });
    }
    const paid = round2(Number(s.paidAmount || 0));
    const due = round2(Number(s.dueAmount || 0));
    if (Math.abs(paid + due - total) > TOL) {
      issues.push({
        kind: "SALE_PAID_DUE_MISMATCH",
        entity: s.id,
        label: `To'langan + qarz ≠ jami: ${s.saleNo ?? s.id}`,
        expected: total,
        actual: round2(paid + due),
        diff: round2(paid + due - total),
      });
    }
    const itemsProfit = round2(items.reduce((a: number, it: any) => a + Number(it.profit || 0), 0));
    const profit = round2(Number(s.profit || 0));
    if (items.length > 0 && Math.abs(itemsProfit - profit) > TOL) {
      issues.push({
        kind: "SALE_PROFIT_MISMATCH",
        entity: s.id,
        label: `Foyda mos emas: ${s.saleNo ?? s.id}`,
        expected: itemsProfit,
        actual: profit,
        diff: round2(profit - itemsProfit),
      });
    }
  }

  // ---- C) Mijoz: debt = totalBought − totalPaid ----
  let totalDebt = 0;
  for (const c of customers) {
    const bought = Number(c.totalBought ?? 0);
    const paid = Number(c.totalPaid ?? 0);
    const debt = Number(c.debt ?? 0);
    totalDebt = round2(totalDebt + debt);
    const expected = round2(bought - paid);
    if (Math.abs(expected - debt) > TOL) {
      issues.push({
        kind: "CUSTOMER_DEBT_MISMATCH",
        entity: c.id,
        label: `Mijoz qarzi (bought−paid) mos emas: ${c.name ?? c.id}`,
        expected,
        actual: round2(debt),
        diff: round2(debt - expected),
      });
    }
    if (debt < -TOL) {
      issues.push({
        kind: "CUSTOMER_NEGATIVE_DEBT",
        entity: c.id,
        label: `Manfiy qarz: ${c.name ?? c.id}`,
        expected: 0,
        actual: round2(debt),
        diff: round2(debt),
      });
    }
  }

  // ---- D) Ta'minotchi: balance = totalPurchased − totalPaid ----
  let totalSupplierBalance = 0;
  for (const sup of suppliers) {
    const purchased = Number(sup.totalPurchased ?? 0);
    const paid = Number(sup.totalPaid ?? 0);
    const balance = Number(sup.balance ?? 0);
    totalSupplierBalance = round2(totalSupplierBalance + balance);
    const expected = round2(purchased - paid);
    if (Math.abs(expected - balance) > TOL) {
      issues.push({
        kind: "SUPPLIER_BALANCE_MISMATCH",
        entity: sup.id,
        label: `Ta'minotchi balansi mos emas: ${sup.name ?? sup.id}`,
        expected,
        actual: round2(balance),
        diff: round2(balance - expected),
      });
    }
  }

  // ---- E) Kassa qoldig'i (axborot) ----
  let cashIn = 0;
  let cashOut = 0;
  for (const t of cash) {
    const amt = Number(t.amount || 0);
    if (amt >= 0) cashIn = round2(cashIn + amt);
    else cashOut = round2(cashOut + Math.abs(amt));
  }
  const cashBalance = round2(cashIn - cashOut);

  const stockValueAvgCost = round2(
    products.reduce((a, p) => a + Number(p.stock || 0) * Number(p.avgCost || 0), 0)
  );

  return {
    ok: issues.length === 0,
    checkedAt: Date.now(),
    counts: {
      products: products.length,
      sales: sales.length,
      returns: returnsS.size,
      customers: customers.length,
      suppliers: suppliers.length,
      movements: moves.length,
      cashTxns: cash.length,
    },
    summary: {
      cashBalance,
      cashIn,
      cashOut,
      totalDebt,
      totalSupplierBalance,
      stockValueAvgCost,
    },
    issues,
  };
}
