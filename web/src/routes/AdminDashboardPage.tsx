import React from "react";
import { addDays, startOfDay } from "date-fns";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { useToast } from "@/ui/Toast";
import { useAuth } from "@/auth/useAuth";
import { listProducts } from "@/services/products";
import { listCustomers } from "@/services/customers";
import { buildReport, type ReportSummary } from "@/services/reports";
import type { Product, Customer } from "@/types";
import { formatMoney } from "@/lib/money";

type PeriodKey = "day" | "week" | "month" | "all";

const SUPER_ADMIN_UID = "M8WKl0BlBnPanTU6Hh60SumTpQu1";

type DashboardData = {
  products: Product[];
  customers: Customer[];
  report: ReportSummary;
};

function periodRange(period: PeriodKey): { from: number; to: number } {
  const now = new Date();
  const to = startOfDay(addDays(now, 1)).getTime(); // exclusive

  if (period === "all") {
    return { from: 0, to };
  }
  if (period === "week") {
    return { from: startOfDay(addDays(now, -6)).getTime(), to };
  }
  if (period === "month") {
    return { from: startOfDay(addDays(now, -29)).getTime(), to };
  }
  return { from: startOfDay(now).getTime(), to };
}

function kpiTone(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-500";
  return "text-muted-foreground";
}

export function AdminDashboardPage() {
  const { user, shopId, role } = useAuth();
  const toast = useToast();

  const [period, setPeriod] = React.useState<PeriodKey>("day");
  const [busy, setBusy] = React.useState(false);
  const [data, setData] = React.useState<DashboardData | null>(null);

  const canOpen = role === "admin" || role === "accountant" || user?.uid === SUPER_ADMIN_UID;

  const load = React.useCallback(async () => {
    if (!shopId || shopId === "default") return;
    setBusy(true);
    try {
      const { from, to } = periodRange(period);
      const [products, customers, report] = await Promise.all([
        listProducts(shopId),
        listCustomers(shopId),
        buildReport(shopId, from, to),
      ]);
      setData({ products, customers, report });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Xato";
      toast.push(msg, "error");
    } finally {
      setBusy(false);
    }
  }, [period, shopId, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canOpen) {
    return (
      <Card title="Admin oynasi">
        <div className="text-sm text-muted-foreground">
          Bu bo'lim faqat Admin / Accountant / Super Admin uchun.
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card
        title="Admin oynasi"
        right={<Button onClick={() => void load()} disabled={busy}>{busy ? "Yuklanmoqda..." : "Yangilash"}</Button>}
      >
        <div className="text-sm text-muted-foreground">Ma'lumotlar yuklanmoqda...</div>
      </Card>
    );
  }

  const { products, customers, report } = data;

  const getCustomerDebt = (c: Customer) => {
    const x = c as Customer & { balance?: number; debt?: number };
    // Canonical field is `debt`; keep fallback for legacy datasets that may have `balance`.
    return Number(x.debt ?? x.balance ?? 0);
  };

  const totalStockUnits = products.reduce((sum, p) => sum + Number(p.stock || 0), 0);
  const totalStockValue = products.reduce((sum, p) => sum + Number(p.stock || 0) * Number(p.avgCost || 0), 0);
  const totalCustomerDebt = customers.reduce((sum, c) => sum + Math.max(0, getCustomerDebt(c)), 0);
  const totalCustomerAdvance = customers.reduce((sum, c) => sum + Math.abs(Math.min(0, getCustomerDebt(c))), 0);

  const lowStock = products
    .filter((p) => Number(p.stock || 0) <= Number(p.minStock || 0))
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
    .slice(0, 6);

  const topDebtors = customers
    .filter((c) => getCustomerDebt(c) > 0)
    .sort((a, b) => getCustomerDebt(b) - getCustomerDebt(a))
    .slice(0, 6);

  const periodLabel: Record<PeriodKey, string> = {
    day: "Kunlik",
    week: "Haftalik",
    month: "Oylik",
    all: "Barcha davr",
  };

  return (
    <div className="space-y-4">
      <Card
        title="Admin oynasi"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={period === "day" ? "primary" : "ghost"} onClick={() => setPeriod("day")}>Kunlik</Button>
            <Button variant={period === "week" ? "primary" : "ghost"} onClick={() => setPeriod("week")}>Haftalik</Button>
            <Button variant={period === "month" ? "primary" : "ghost"} onClick={() => setPeriod("month")}>Oylik</Button>
            <Button variant={period === "all" ? "primary" : "ghost"} onClick={() => setPeriod("all")}>Barchasi</Button>
            <Button variant="secondary" onClick={() => void load()} disabled={busy}>{busy ? "Yangilanmoqda..." : "Yangilash"}</Button>
          </div>
        }
      >
        <div className="rounded-2xl border border-border/40 bg-gradient-to-r from-cyan-500/15 via-emerald-400/15 to-indigo-500/15 p-4">
          <div className="text-sm text-muted-foreground">Tanlangan davr</div>
          <div className="text-xl font-extrabold tracking-tight">{periodLabel[period]} ko'rsatkichlar</div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Tovarlar">
          <div className="text-2xl font-extrabold">{products.length}</div>
          <div className="text-sm text-muted-foreground">SKU soni</div>
          <div className="mt-2 text-sm">Jami qoldiq: <b>{totalStockUnits.toLocaleString()}</b></div>
          <div className="text-sm">Tannarx qiymati: <b>{formatMoney(totalStockValue)}</b></div>
        </Card>

        <Card title="Mijozlar qarzi">
          <div className="text-2xl font-extrabold text-red-500">{formatMoney(totalCustomerDebt)}</div>
          <div className="text-sm text-muted-foreground">Umumiy qarzdorlik</div>
          <div className="mt-2 text-sm">Oldindan to'langan: <b>{formatMoney(totalCustomerAdvance)}</b></div>
          <div className="text-sm">Mijozlar soni: <b>{customers.length}</b></div>
        </Card>

        <Card title="Savdolar">
          <div className="text-2xl font-extrabold">{report.salesCount.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Savdo soni</div>
          <div className="mt-2 text-sm">Jami savdo: <b>{formatMoney(report.grossSales)}</b></div>
          <div className="text-sm">Net revenue: <b>{formatMoney(report.netRevenue)}</b></div>
        </Card>

        <Card title="Foyda / Zarar">
          <div className={`text-2xl font-extrabold ${kpiTone(report.approxProfit)}`}>{formatMoney(report.approxProfit)}</div>
          <div className="text-sm text-muted-foreground">Sof natija</div>
          <div className="mt-2 text-sm">Taxminiy foyda: <b>{formatMoney(report.approxProfit)}</b></div>
          <div className="text-sm">Harajatlar: <b className="text-red-500">{formatMoney(report.expenses)}</b></div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Kassa oqimi (davr bo'yicha)" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/40 bg-muted/35 p-3">
              <div className="text-xs text-muted-foreground">Kirim</div>
              <div className="text-lg font-bold">{formatMoney(report.cashIn + report.cardIn)}</div>
            </div>
            <div className="rounded-xl border border-border/40 bg-muted/35 p-3">
              <div className="text-xs text-muted-foreground">Chiqim</div>
              <div className="text-lg font-bold text-red-500">{formatMoney(report.cashOut + report.cardOut)}</div>
            </div>
            <div className="rounded-xl border border-border/40 bg-muted/35 p-3">
              <div className="text-xs text-muted-foreground">Net cash flow</div>
              <div className={`text-lg font-bold ${kpiTone(report.netCashFlow)}`}>{formatMoney(report.netCashFlow)}</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border/40 bg-muted/35 p-3">
              <div className="text-xs text-muted-foreground">Kirim (tovar)</div>
              <div className="text-sm">Soni: <b>{report.purchasesCount}</b></div>
              <div className="text-sm">Jami: <b>{formatMoney(report.purchasesTotal)}</b></div>
              <div className="text-sm">To'langan: <b className="text-red-500">{formatMoney(report.purchasesPaidOut)}</b></div>
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/35 p-3">
              <div className="text-xs text-muted-foreground">Qo'shimcha chiqimlar</div>
              <div className="text-sm">Ta'minotchi to'lovi: <b className="text-red-500">{formatMoney(report.supplierPaymentsOut)}</b></div>
              <div className="text-sm">Harajat: <b className="text-red-500">{formatMoney(report.expensesOut)}</b></div>
              <div className="text-sm">Refund/Return: <b className="text-red-500">{formatMoney(report.refunds)}</b></div>
            </div>
          </div>
        </Card>

        <Card title="Tez holat">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Past qoldiq tovarlar</span><b>{lowStock.length}</b></div>
            <div className="flex items-center justify-between"><span>Qarzdor mijozlar</span><b>{topDebtors.length}</b></div>
            <div className="flex items-center justify-between"><span>Shop ID</span><b className="truncate max-w-[140px] text-right">{shopId}</b></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card title="Past qoldiq tovarlar (Top 6)">
          {lowStock.length === 0 ? (
            <div className="text-sm text-muted-foreground">Hammasi me'yorda.</div>
          ) : (
            <div className="space-y-2">
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/35 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">Min: {Number(p.minStock || 0)} • Birlik: {p.unit || "dona"}</div>
                  </div>
                  <div className="font-bold text-red-500">{Number(p.stock || 0)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Eng katta qarzdor mijozlar (Top 6)">
          {topDebtors.length === 0 ? (
            <div className="text-sm text-muted-foreground">Qarzdor mijoz topilmadi.</div>
          ) : (
            <div className="space-y-2">
              {topDebtors.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/35 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.phone || "Telefon yo'q"}</div>
                  </div>
                  <div className="font-bold text-red-500">{formatMoney(getCustomerDebt(c))}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
