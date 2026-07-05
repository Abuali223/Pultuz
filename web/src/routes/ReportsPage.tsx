import React from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { useToast } from "@/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { buildReport, type ReportSummary } from "@/services/reports";
import { exportToExcel } from "@/lib/excel";
import { openReportPrint } from "@/lib/print";
import { downloadFullReport } from "@/services/fullReportPdf";
import { formatMoney } from "@/lib/money";
import { listUsersInShop } from "@/services/staff";
import { addDays, format, startOfDay } from "date-fns";

export function ReportsPage() {
  const toast = useToast();
  const { shopId } = useAuth();
  // Sotuvchi UID -> ism (hisobotda ko'rsatish uchun; faqat admin o'qiy oladi, xato bo'lsa UID ko'rinadi)
  const [userNames, setUserNames] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!shopId) return;
    listUsersInShop(shopId)
      .then((users) => {
        const m: Record<string, string> = {};
        for (const u of users as any[]) m[u.id] = u.displayName || u.email || u.id;
        setUserNames(m);
      })
      .catch(() => setUserNames({}));
  }, [shopId]);
  const today = React.useMemo(() => startOfDay(new Date()), []);
  const [fromDate, setFromDate] = React.useState(() => format(today, "yyyy-MM-dd"));
  const [toDate, setToDate] = React.useState(() => format(addDays(today, 1), "yyyy-MM-dd"));
  const [summary, setSummary] = React.useState<ReportSummary | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  function setRange(from: Date, toExclusive: Date) {
    setFromDate(format(startOfDay(from), "yyyy-MM-dd"));
    setToDate(format(startOfDay(toExclusive), "yyyy-MM-dd"));
  }

  async function run() {
    setBusy(true);
    try {
      if (!shopId || shopId === "default") {
        toast.push("Shop ID topilmadi. Admin/SuperAdmin tasdiqlaganidan keyin qayta urinib ko'ring.", "error");
        return;
      }

      const fromTs = startOfDay(new Date(fromDate)).getTime();
      const toTs = startOfDay(new Date(toDate)).getTime();
      const s = await buildReport(shopId, fromTs, toTs);
      setSummary(s);
      toast.push("Hisobot tayyor", "success");
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      setBusy(false);
    }
  }

  function exportExcel() {
    if (!summary) return;
    exportToExcel(
      [
        { label: "Savdolar soni", value: summary.salesCount },
        { label: "Umumiy savdo", value: summary.grossSales },
        { label: "Refund/Return", value: summary.refunds },
        { label: "Net daromad", value: summary.netRevenue },
        { label: "Taxminiy foyda", value: summary.approxProfit },
        { label: "Naqd savdo", value: summary.salesCashTotal },
        { label: "Karta savdo", value: summary.salesCardTotal },
        { label: "Nasiya savdo", value: summary.salesDebtTotal },
        { label: "Naqd kirim", value: summary.cashIn },
        { label: "Karta kirim", value: summary.cardIn },
        { label: "Naqd chiqim", value: summary.cashOut },
        { label: "Karta chiqim", value: summary.cardOut },
        { label: "Ta’minotchi to‘lovlari", value: summary.supplierPaymentsOut },
        { label: "Harajatlar", value: summary.expensesOut },
        { label: "Net kassa oqimi", value: summary.netCashFlow },
        { label: "Kirimlar soni", value: summary.purchasesCount },
        { label: "Kirimlar jami", value: summary.purchasesTotal },
      ],
      `hisobot_${fromDate}_${toDate}.xlsx`,
      "Hisobot"
    );
  }

  function printPdf() {
    if (!summary) return;
    openReportPrint({ report: summary, fromLabel: fromDate, toLabel: toDate });
  }

  async function fullPdf() {
    setPdfBusy(true);
    try {
      if (!shopId || shopId === "default") {
        toast.push("Shop ID topilmadi. Admin/SuperAdmin tasdiqlaganidan keyin qayta urinib ko'ring.", "error");
        return;
      }
      const fromTs = startOfDay(new Date(fromDate)).getTime();
      const toTs = startOfDay(new Date(toDate)).getTime();
      await downloadFullReport({ shopId, fromTs, toTs, fromLabel: fromDate, toLabel: toDate });
    } catch (e: any) {
      toast.push(e?.message ?? "PDF hisobotni yuklab bo'lmadi", "error");
    } finally {
      setPdfBusy(false);
    }
  }


  return (
    <div className="space-y-4">
      <Card
        title="Hisobot (kun/hafta/oy)"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy} onClick={run}>
              {busy ? "Yuklanmoqda..." : "Hisobotni yaratish"}
            </Button>
            <Button variant="secondary" disabled={!summary} onClick={exportExcel}>
              Excel
            </Button>
            <Button variant="secondary" disabled={!summary} onClick={printPdf}>
              Print / PDF
            </Button>
            <Button disabled={pdfBusy} onClick={fullPdf}>
              {pdfBusy ? "Tayyorlanmoqda..." : "📄 To'liq PDF (savdo/qarz/to'lov)"}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="hidden sm:block text-xs text-muted-foreground">Boshlanish sana</div>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <div className="hidden sm:block text-xs text-muted-foreground">Tugash sana</div>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <Button
              variant="ghost"
              onClick={() => setRange(new Date(), addDays(new Date(), 1))}
            >
              Bugun
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const d = addDays(new Date(), -1);
                setRange(d, new Date());
              }}
            >
              Kecha
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const d = addDays(new Date(), -6);
                setRange(d, addDays(new Date(), 1));
              }}
            >
              7 kun
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const d = addDays(new Date(), -29);
                setRange(d, addDays(new Date(), 1));
              }}
            >
              30 kun
            </Button>
          </div>
          <div className="hidden md:flex items-end text-xs text-muted-foreground">
            Eslatma: Tugash sana <b className="mx-1">exclusive</b> (ya'ni ertasi 00:00 gacha).
          </div>
        </div>
      </Card>

      {summary ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Savdolar">
            <div className="text-sm">Savdo soni: <b>{summary.salesCount}</b></div>
            <div className="text-sm">Jami savdo: <b>{formatMoney(summary.grossSales)}</b></div>
            <div className="text-sm">Qaytarishlar: <b>{formatMoney(summary.refunds)}</b></div>
            <div className="text-sm">Net revenue: <b>{formatMoney(summary.netRevenue)}</b></div>
          </Card>

          <Card title="Kassa kirim/chiqim">
            <div className="text-sm">Naqd kirim: <b>{formatMoney(summary.cashIn)}</b></div>
            <div className="text-sm">Karta kirim: <b>{formatMoney(summary.cardIn)}</b></div>
            <div className="text-sm">Naqd chiqim: <b className="text-destructive">{formatMoney(summary.cashOut)}</b></div>
            <div className="text-sm">Karta chiqim: <b className="text-destructive">{formatMoney(summary.cardOut)}</b></div>
            <div className="text-sm mt-2">Net cash-flow: <b>{formatMoney(summary.netCashFlow)}</b></div>
          </Card>

          <Card title="Kirim / Harajat / Foyda">
            <div className="text-sm">Kirim soni: <b>{summary.purchasesCount}</b></div>
            <div className="text-sm">Kirim jami: <b>{formatMoney(summary.purchasesTotal)}</b></div>
            <div className="text-sm">Kirim to'langan: <b className="text-destructive">{formatMoney(summary.purchasesPaidOut)}</b></div>
            <div className="text-sm">Ta'minotchi to'lovlari: <b className="text-destructive">{formatMoney(summary.supplierPaymentsOut)}</b></div>
            <div className="text-sm">Harajatlar: <b className="text-destructive">{formatMoney(summary.expenses)}</b></div>
            <div className="text-sm">Taxminiy foyda: <b>{formatMoney(summary.approxProfit)}</b></div>
            <div className="hidden sm:block text-xs text-muted-foreground mt-2">
              Eslatma: MVP foyda hisobida return profit’ni to‘liq hisoblash keyingi bosqichga qo‘yilgan.
            </div>
          </Card>
        </div>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Naqd / karta / nasiya ajratmasi */}
          <Card title="To'lov turi bo'yicha savdo">
            <div className="text-sm">Naqd: <b>{formatMoney(summary.salesCashTotal)}</b></div>
            <div className="text-sm">Karta: <b>{formatMoney(summary.salesCardTotal)}</b></div>
            <div className="text-sm">Nasiya (qarzga): <b className="text-warning">{formatMoney(summary.salesDebtTotal)}</b></div>
          </Card>

          <Card title="Eng ko'p sotilgan (Top 10)">
            {summary.topProducts.length === 0 ? (
              <div className="text-sm text-muted-foreground">Savdo yo'q.</div>
            ) : (
              <div className="space-y-1">
                {summary.topProducts.map((p) => (
                  <div key={p.productId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {p.qty} dona • {formatMoney(p.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Kam sotilgan (10)">
            {summary.lowProducts.length === 0 ? (
              <div className="text-sm text-muted-foreground">Savdo yo'q.</div>
            ) : (
              <div className="space-y-1">
                {summary.lowProducts.map((p) => (
                  <div key={p.productId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {p.qty} dona • {formatMoney(p.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {summary ? (
        <Card title="Sotuvchi (ishchi) bo'yicha hisobot">
          {summary.salesByUser.length === 0 ? (
            <div className="text-sm text-muted-foreground">Savdo yo'q.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2">Sotuvchi</th>
                    <th className="py-1 pr-2 text-right">Savdo soni</th>
                    <th className="py-1 pr-2 text-right">Jami savdo</th>
                    <th className="py-1 text-right">Foyda</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.salesByUser.map((u) => (
                    <tr key={u.uid} className="border-t border-border/40">
                      <td className="py-1.5 pr-2 break-all">{userNames[u.uid] ?? u.uid}</td>
                      <td className="py-1.5 pr-2 text-right font-semibold">{u.salesCount}</td>
                      <td className="py-1.5 pr-2 text-right font-semibold">{formatMoney(u.total)}</td>
                      <td className="py-1.5 text-right font-semibold">{formatMoney(u.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
