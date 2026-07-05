import { getDocs, query, where } from "firebase/firestore";
import { col } from "./paths";
import type { Expense, Sale, CashTxn, Purchase } from "@/types";
import { round2 } from "@/lib/money";

export type ReportSummary = {
  from: number;
  to: number;

  salesCount: number;
  grossSales: number; // sum sale.total
  refunds: number; // abs sum of REFUND
  netRevenue: number; // grossSales - refunds
  approxProfit: number; // sum sale.profit - expenses (returns not included in profit yet)

  // cash flows (from cash_transactions)
  cashIn: number; // SALE paid (cash)
  cardIn: number; // SALE paid (card)
  cashOut: number; // negative amounts (cash)
  cardOut: number; // negative amounts (card)
  purchasesPaidOut: number; // abs sum PURCHASE (paid part)
  supplierPaymentsOut: number; // abs sum SUPPLIER_PAYMENT
  expensesOut: number; // abs sum EXPENSE
  netCashFlow: number; // (cashIn+cardIn) - (cashOut+cardOut)

  // purchases (kirim)
  purchasesCount: number;
  purchasesTotal: number;

  expenses: number; // from expenses collection (for P/L)

  // Naqd / karta / nasiya bo'yicha ajratilgan savdo (sale.total asosida)
  salesCashTotal: number; // naqd to'langan qismi
  salesCardTotal: number; // karta bilan to'langan qismi
  salesDebtTotal: number; // nasiyaga yozilgan qismi (dueAmount)

  // Eng ko'p / kam sotilgan mahsulotlar (davr ichida)
  topProducts: ProductSalesRow[]; // ko'p sotilgan (kamayish tartibida)
  lowProducts: ProductSalesRow[]; // kam sotilgan (o'sish tartibida)

  // Sotuvchi (ishchi) bo'yicha hisobot
  salesByUser: UserSalesRow[];
};

export type ProductSalesRow = {
  productId: string;
  name: string;
  qty: number;
  total: number;
  profit: number;
};

export type UserSalesRow = {
  uid: string;
  salesCount: number;
  total: number;
  profit: number;
};

// Backward-compat: some print modules import ReportData
export type ReportData = ReportSummary;

export async function buildReport(shopId: string, from: number, to: number): Promise<ReportSummary> {
  // sales
  const salesQs = await getDocs(
    query(col(shopId, "sales"), where("createdAt", ">=", from), where("createdAt", "<", to))
  );
  // FIX: void qilingan savdolar hisobotga kiritilmaydi.
  const sales = (salesQs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Sale[])
    .filter((s: any) => s.status !== "voided");

  // cash txns
  const cashQs = await getDocs(
    query(col(shopId, "cash_transactions"), where("createdAt", ">=", from), where("createdAt", "<", to))
  );
  const cash = cashQs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CashTxn[];

  // expenses (P/L)
  const expensesQs = await getDocs(
    query(col(shopId, "expenses"), where("createdAt", ">=", from), where("createdAt", "<", to))
  );
  const expenses = expensesQs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Expense[];

  // purchases
  const purchasesQs = await getDocs(
    query(col(shopId, "purchases"), where("createdAt", ">=", from), where("createdAt", "<", to))
  );
  // FIX: void qilingan kirimlar ham hisobdan chiqariladi.
  const purchases = (purchasesQs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Purchase[])
    .filter((p: any) => p.status !== "voided");

  // FIX: qaytarishlar (returns) endi ACCRUAL asosida hisoblanadi.
  // Avval netRevenue grossSales (accrual) dan cash REFUND (faqat qaytarilgan naqd)
  // ni ayirardi — qarzga qaytarilgan tovar daromadni kamaytirmasdi, void esa ikki
  // marta jazolanardi. Endi returns kolleksiyasidan to'liq summa olinadi.
  const returnsQs = await getDocs(
    query(col(shopId, "returns"), where("createdAt", ">=", from), where("createdAt", "<", to))
  );
  const returns = returnsQs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const returnsTotal = round2(
    returns.reduce((a: number, r: any) => a + Number(r.totalRefund || 0), 0)
  );
  // qaytarish marjasi (foydadan ayiriladi)
  const returnProfit = round2(
    returns.reduce((a: number, r: any) => {
      const items = Array.isArray(r.items) ? r.items : [];
      const m = items.reduce(
        (s: number, it: any) =>
          s + (Number(it.unitPrice || 0) - Number(it.unitCostSnapshot || 0)) * Number(it.qty || 0),
        0
      );
      return a + m;
    }, 0)
  );

  const salesCount = sales.length;
  const grossSales = round2(sales.reduce((a, s: any) => a + Number(s.total || 0), 0));

  // refunds = davr ichidagi qaytarishlar (accrual), netRevenue bilan mos.
  const refunds = returnsTotal;
  const netRevenue = round2(grossSales - refunds);

  // cash in/out by paymentType
  const cashIn = round2(cash.filter((c) => c.amount > 0 && c.paymentType === "cash").reduce((a, c) => a + Number(c.amount || 0), 0));
  const cardIn = round2(cash.filter((c) => c.amount > 0 && c.paymentType === "card").reduce((a, c) => a + Number(c.amount || 0), 0));

  const cashOut = round2(cash.filter((c) => c.amount < 0 && c.paymentType === "cash").reduce((a, c) => a + Math.abs(Number(c.amount || 0)), 0));
  const cardOut = round2(cash.filter((c) => c.amount < 0 && c.paymentType === "card").reduce((a, c) => a + Math.abs(Number(c.amount || 0)), 0));

  const purchasesPaidOut = round2(cash.filter((c) => c.type === "PURCHASE").reduce((a, c) => a + Math.abs(Number(c.amount || 0)), 0));
  const supplierPaymentsOut = round2(cash.filter((c) => c.type === "SUPPLIER_PAYMENT").reduce((a, c) => a + Math.abs(Number(c.amount || 0)), 0));
  const expensesOut = round2(cash.filter((c) => c.type === "EXPENSE").reduce((a, c) => a + Math.abs(Number(c.amount || 0)), 0));

  const netCashFlow = round2((cashIn + cardIn) - (cashOut + cardOut));

  const expensesSum = round2(expenses.reduce((a, e) => a + Number(e.amount || 0), 0));

  // approximate profit: sum(sale.profit) - qaytarish marjasi - xarajatlar
  // FIX: avval qaytarilgan tovarlar marjasi foydadan ayirilmasdi -> foyda oshib ketardi.
  const profitFromSales = round2(sales.reduce((a, s: any) => a + Number(s.profit || 0), 0));
  const approxProfit = round2(profitFromSales - returnProfit - expensesSum);

  const purchasesCount = purchases.length;
  const purchasesTotal = round2(purchases.reduce((a, p: any) => a + Number(p.total || 0), 0));

  // Naqd / karta / nasiya ajratmasi:
  // to'langan qismi paymentType bo'yicha, to'lanmagan qismi (dueAmount) — nasiya.
  const salesCashTotal = round2(
    sales.filter((s: any) => s.paymentType === "cash").reduce((a, s: any) => a + Number(s.paidAmount || 0), 0)
  );
  const salesCardTotal = round2(
    sales.filter((s: any) => s.paymentType === "card").reduce((a, s: any) => a + Number(s.paidAmount || 0), 0)
  );
  const salesDebtTotal = round2(sales.reduce((a, s: any) => a + Number(s.dueAmount || 0), 0));

  // Mahsulot bo'yicha jamlash (eng ko'p / kam sotilganlar)
  const byProduct = new Map<string, ProductSalesRow>();
  for (const s of sales as any[]) {
    for (const it of (s.items ?? []) as any[]) {
      const key = String(it.productId || it.nameSnapshot || "?");
      const row = byProduct.get(key) ?? {
        productId: key,
        name: String(it.nameSnapshot || "?"),
        qty: 0,
        total: 0,
        profit: 0,
      };
      row.qty = round2(row.qty + Number(it.qty || 0));
      row.total = round2(row.total + Number(it.lineTotal || 0));
      row.profit = round2(row.profit + Number(it.profit || 0));
      byProduct.set(key, row);
    }
  }
  const productRows = Array.from(byProduct.values());
  const topProducts = [...productRows].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const lowProducts = [...productRows].sort((a, b) => a.qty - b.qty).slice(0, 10);

  // Sotuvchi bo'yicha jamlash
  const byUser = new Map<string, UserSalesRow>();
  for (const s of sales as any[]) {
    const uid = String(s.createdBy || "?");
    const row = byUser.get(uid) ?? { uid, salesCount: 0, total: 0, profit: 0 };
    row.salesCount += 1;
    row.total = round2(row.total + Number(s.total || 0));
    row.profit = round2(row.profit + Number(s.profit || 0));
    byUser.set(uid, row);
  }
  const salesByUser = Array.from(byUser.values()).sort((a, b) => b.total - a.total);

  return {
    from,
    to,
    salesCount,
    grossSales,
    refunds,
    netRevenue,
    approxProfit,
    cashIn,
    cardIn,
    cashOut,
    cardOut,
    purchasesPaidOut,
    supplierPaymentsOut,
    expensesOut,
    netCashFlow,
    purchasesCount,
    purchasesTotal,
    expenses: expensesSum,
    salesCashTotal,
    salesCardTotal,
    salesDebtTotal,
    topProducts,
    lowProducts,
    salesByUser,
  };
}
