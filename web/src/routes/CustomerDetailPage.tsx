import React from "react";
import { useParams } from "react-router-dom";

import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { useToast } from "@/ui/Toast";

import { useAuth } from "@/auth/AuthProvider";
import { addCustomerPayment, getCustomer, listCustomerPayments } from "@/services/customers";
import { listSalesByCustomer } from "@/services/sales";
import { sendCustomerSalesPdf } from "@/services/customerSalesPdf";
import type { Customer, CustomerPayment, PaymentType, Sale } from "@/types";
import { formatMoney } from "@/lib/money";

function toDateSafe(v: any): Date {
  if (!v) return new Date(0);
  if (typeof v?.toDate === "function") return v.toDate(); // Firestore Timestamp
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }
  // Firestore Timestamp-like
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  return new Date(0);
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { shopId } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [payments, setPayments] = React.useState<CustomerPayment[]>([]);

  const [sales, setSales] = React.useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = React.useState(false);
  const [salesErr, setSalesErr] = React.useState<string | null>(null);

  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportFrom, setExportFrom] = React.useState<string>("");
  const [exportTo, setExportTo] = React.useState<string>("");
  const [exportBusy, setExportBusy] = React.useState(false);

  function ymd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function openCustomerSalesPrint(opts: { customerName: string; customerPhone?: string; from?: string; to?: string; sales: Sale[] }) {
    const w = window.open("", "_blank", "width=900,height=800");
    if (!w) return;

    const { customerName, customerPhone, from, to, sales } = opts;
    const period = from || to ? `${from || "..." } → ${to || "..."}` : "Hammasi";
    const rows = sales
      .slice()
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .map((s) => {
        const d = new Date(Number(s.createdAt || 0)).toLocaleString();
        const pay = s.paymentType === "card" ? "Karta" : "Naqd";
        const note = (s as any).note ? String((s as any).note) : "";
        return `
          <tr>
            <td style="padding:6px 4px;border-top:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(d)}</td>
            <td style="padding:6px 4px;border-top:1px solid #e5e7eb;">${escapeHtml(String(s.saleNo || ""))}</td>
            <td style="padding:6px 4px;border-top:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatMoney(Number(s.total || 0)))}</td>
            <td style="padding:6px 4px;border-top:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatMoney(Number(s.paidAmount || 0)))}</td>
            <td style="padding:6px 4px;border-top:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatMoney(Number(s.dueAmount || 0)))}</td>
            <td style="padding:6px 4px;border-top:1px solid #e5e7eb;">${pay}</td>
            <td style="padding:6px 4px;border-top:1px solid #e5e7eb;">${escapeHtml(note || "—")}</td>
          </tr>
        `;
      })
      .join("");

    const total = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const paid = sales.reduce((sum, s) => sum + Number(s.paidAmount || 0), 0);
    const due = sales.reduce((sum, s) => sum + Number(s.dueAmount || 0), 0);

    w.document.write(`
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Mijoz savdo tarixi</title>
        <style>
          body{font-family:system-ui,-apple-system,Segoe UI,Roboto; padding:16px;}
          h1{font-size:18px;margin:0 0 6px 0;}
          .muted{color:#64748b;font-size:12px;}
          table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px;}
          th{background:#f1f5f9;text-align:left;padding:8px 4px;border:1px solid #e5e7eb;}
          td{border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;}
          .sum{margin-top:10px;font-size:12px;}
          @media print { button { display:none } }
        </style>
      </head>
      <body>
        <h1>Mijoz savdo tarixi</h1>
        <div class="muted"><b>Mijoz:</b> ${escapeHtml(customerName || "NOMA'LUM")} ${customerPhone ? `(${escapeHtml(customerPhone)})` : ""}</div>
        <div class="muted"><b>Davr:</b> ${escapeHtml(period)}</div>

        <div class="sum"><b>Jami savdo:</b> ${escapeHtml(formatMoney(total))} • <b>To'landi:</b> ${escapeHtml(formatMoney(paid))} • <b>Qarz:</b> ${escapeHtml(formatMoney(due))}</div>

        <table>
          <thead>
            <tr>
              <th>Sana</th>
              <th>Chek</th>
              <th style="text-align:right">Jami</th>
              <th style="text-align:right">To'landi</th>
              <th style="text-align:right">Qarz</th>
              <th>To'lov</th>
              <th>Izoh</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="7" style="padding:10px;border-top:1px solid #e5e7eb;">Ma'lumot topilmadi.</td></tr>`}
          </tbody>
        </table>

        <div style="margin-top:14px">
          <button onclick="window.print()" style="padding:10px 12px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-weight:700;cursor:pointer;">PDF / Print</button>
        </div>
      </body>
      </html>
    `);
    w.document.close();
  }

  function escapeHtml(s: string) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const [payOpen, setPayOpen] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState<string>("");
  const [payType, setPayType] = React.useState<PaymentType>("cash");
  const [payNote, setPayNote] = React.useState<string>("");
  const [payLoading, setPayLoading] = React.useState(false);

  const [openProductKey, setOpenProductKey] = React.useState<string | null>(null);

  const cid = id ?? "";

  const reload = React.useCallback(async () => {
    if (!shopId) {
      setLoading(false);
      toast.push("Shop ID topilmadi", "error");
      return;
    }
    if (!cid) {
      setLoading(false);
      toast.push("Mijoz ID topilmadi", "error");
      return;
    }

    setLoading(true);
    try {
      setSalesErr(null);
      setSalesLoading(true);
      const [c, p, s] = await Promise.all([
        getCustomer(shopId, cid),
        listCustomerPayments(shopId, cid, { limit: 50 }),
        listSalesByCustomer(shopId, cid, 50),
      ]);
      setCustomer(c);
      setPayments(p);
      setSales(s);
      setSalesLoading(false);
    } catch (e: any) {
      setSalesLoading(false);
      setSalesErr(e?.message || "Savdolarni yuklashda xatolik");
      toast.push(e?.message || "Xatolik", "error");
    } finally {
      setLoading(false);
    }
  }, [shopId, cid, toast]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function submitPayment() {
    if (!shopId || !cid) return;

    const amount = Number(String(payAmount).replace(/\s/g, ""));
    if (!amount || amount <= 0) {
      toast.push("Summa noto'g'ri", "error");
      return;
    }

    setPayLoading(true);
    try {
      await addCustomerPayment(shopId, cid, {
        amount,
        paymentType: payType,
        note: payNote?.trim() || "",
      });
      toast.push("To'lov saqlandi", "success");
      setPayOpen(false);
      setPayAmount("");
      setPayNote("");
      await reload();
    } catch (e: any) {
      setSalesLoading(false);
      setSalesErr(e?.message || "Savdolarni yuklashda xatolik");
      toast.push(e?.message || "Xatolik", "error");
    } finally {
      setPayLoading(false);
    }
  }


  const productSummary = React.useMemo(() => {
    const map = new Map<
      string,
      { key: string; name: string; qty: number; total: number }
    >();

    for (const s of sales) {
      const items: any[] = (s as any).items || [];
      for (const it of items) {
        const name = String(it.nameSnapshot || it.name || "NOMA'LUM");
        const key = String(it.productId || it.barcodeSnapshot || name);
        const prev = map.get(key) || { key, name, qty: 0, total: 0 };
        prev.qty += Number(it.qty || 0);
        prev.total += Number(it.lineTotal || 0);
        // keep the most informative name
        if (prev.name === "NOMA'LUM" && name !== "NOMA'LUM") prev.name = name;
        map.set(key, prev);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [sales]);

  const productSalesByKey = React.useMemo(() => {
    // key -> purchases grouped by receipt (sale)
    const m = new Map<
      string,
      Map<
        string,
        {
          saleId: string;
          receipt: string;
          createdAt: any;
          qty: number;
          total: number;
        }
      >
    >();

    for (const s of sales) {
      const saleId = String(s.id || "");
      const receipt = s.saleNo ? `S-${s.saleNo}` : saleId ? `S-${saleId.slice(-4).toUpperCase()}` : "S-";
      const createdAt = (s as any).createdAt;

      const perSale = new Map<string, { qty: number; total: number }>();
      for (const it of s.items || []) {
        const key = it.productId || it.barcodeSnapshot || it.nameSnapshot || "unknown";
        const prev = perSale.get(key) || { qty: 0, total: 0 };
        const qty = Number(it.qty || 0);
        const lineTotal = Number(it.lineTotal || 0);
        perSale.set(key, { qty: prev.qty + qty, total: prev.total + lineTotal });
      }

      for (const [key, agg] of perSale.entries()) {
        if (!m.has(key)) m.set(key, new Map());
        const bySale = m.get(key)!;
        const prev = bySale.get(saleId) || { saleId, receipt, createdAt, qty: 0, total: 0 };
        bySale.set(saleId, {
          saleId,
          receipt,
          createdAt,
          qty: prev.qty + agg.qty,
          total: prev.total + agg.total,
        });
      }
    }

    // Convert to plain object with newest-first ordering
    const out: Record<
      string,
      {
        saleId: string;
        receipt: string;
        createdAt: any;
        qty: number;
        total: number;
      }[]
    > = {};

    for (const [key, bySale] of m.entries()) {
      out[key] = Array.from(bySale.values()).sort((a, b) => {
        const da = toDateSafe(a.createdAt).getTime();
        const db = toDateSafe(b.createdAt).getTime();
        return db - da;
      });
    }

    return out;
  }, [sales]);

  const formatSaleDate = (createdAt: any) => {
    const d = toDateSafe(createdAt);
    if (!d) return "";
    try {
      return new Intl.DateTimeFormat("uz-UZ", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-muted">Xush kelibsiz,</div>
        <div className="text-2xl font-semibold">Mijoz</div>
        <div className="text-sm text-muted">Qarz / to'lov tarixi</div>
      </div>

      <Card className="p-4">
        {loading ? (
          <div className="text-sm text-muted">Yuklanmoqda...</div>
        ) : !customer ? (
          <div className="text-sm text-muted">Mijoz topilmadi</div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{customer.name || "(Nomsiz)"}</div>
                <div className="text-sm text-muted">{customer.phone || "Telefon yo'q"}</div>
              </div>

              <Button onClick={() => setPayOpen(true)}>To'lov qo'shish</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-3">
                <div className="text-xs text-muted">Jami oldi</div>
                <div className="text-xl font-semibold">{formatMoney(customer.totalBought || 0)}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted">Jami berdi</div>
                <div className="text-xl font-semibold">{formatMoney(customer.totalPaid || 0)}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted">Qarz</div>
                <div className="text-xl font-semibold">{formatMoney(customer.debt || 0)}</div>
              </Card>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-3">To'lovlar</div>
        {payments.length === 0 ? (
          <div className="text-sm text-muted">Hozircha to'lov yo'q.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2 pr-3">Sana</th>
                  <th className="py-2 pr-3">To'lov</th>
                  <th className="py-2 pr-3">Summa</th>
                  <th className="py-2 pr-3">Izoh</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => {
                  const d = toDateSafe(p.createdAt ?? p.date ?? p.ts);
                  return (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="py-2 pr-3 whitespace-nowrap">{d.toLocaleString()}</td>
                      <td className="py-2 pr-3">{p.paymentType === "card" ? "Karta" : "Naqd"}</td>
                      <td className="py-2 pr-3 font-medium">{formatMoney(p.amount || 0)}</td>
                      <td className="py-2 pr-3 text-muted">{p.note || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>


      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="font-semibold">Mijoz olgan tovarlar</div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">
              {sales.length ? `Savdolar: ${sales.length} ta` : ""}
            </div>

            <Button
              variant="secondary"
              onClick={() => {
                const now = new Date();
                setExportFrom(ymd(new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30)));
                setExportTo(ymd(now));
                setExportOpen(true);
              }}
              disabled={!sales.length}
              title={!sales.length ? "Avval savdolar yuklansin" : undefined}
            >
              PDF / Telegram
            </Button>
          </div>
        </div>

        {salesLoading ? (
          <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : salesErr ? (
          <div className="text-sm text-destructive">{salesErr}</div>
        ) : productSummary.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Hozircha bu mijoz bo‘yicha savdo topilmadi.
          </div>
        ) : (
          <div className="divide-y">
            {productSummary.slice(0, 60).map((it) => {
              const entries = productSalesByKey[it.key] || [];
              const isOpen = openProductKey === it.key;

              return (
                <div key={it.key} className="py-2">
                  <button
                    type="button"
                    onClick={() => setOpenProductKey(isOpen ? null : it.key)}
                    className="w-full text-left active:opacity-80"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{it.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Miqdor: {it.qty}
                          {entries.length ? ` • Cheklar: ${entries.length} ta` : ""}
                        </div>
                      </div>

                      <div className="text-right whitespace-nowrap">
                        <div className="font-semibold">{formatMoney(it.total)}</div>
                        <div className="text-xs text-muted-foreground">
                          {isOpen ? "Yopish" : "Ko‘rish"}
                        </div>
                      </div>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="mt-2 rounded-lg border bg-muted/30 p-2">
                      <div className="text-xs text-muted-foreground mb-2">
                        Cheklar bo‘yicha:
                      </div>

                      {entries.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Ma’lumot topilmadi.</div>
                      ) : (
                        <div className="space-y-2">
                          {entries.map((e: { saleId: string; receipt: string; createdAt: any; qty: number; total: number }) => (
                            <div
                              key={e.saleId}
                              className="flex items-start justify-between gap-3 rounded-md bg-background/60 p-2"
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate">{formatSaleDate(e.createdAt)}</div>
                                <div className="text-xs text-muted-foreground">Chek: {e.receipt}</div>
                              </div>
                              <div className="text-right whitespace-nowrap">
                                <div className="text-sm">Qty: {e.qty}</div>
                                <div className="font-semibold">{formatMoney(e.total)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-3">Savdolar tarixi</div>

        {salesLoading ? (
          <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : salesErr ? (
          <div className="text-sm text-destructive">{salesErr}</div>
        ) : sales.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Bu mijoz bo‘yicha savdo topilmadi.
          </div>
        ) : (
          <div className="space-y-2">
            {sales.slice(0, 20).map((s) => {
              const items: any[] = (s as any).items || [];
              const receipt = (s as any).saleNo
                ? `#${(s as any).saleNo}`
                : s.id
                ? `#${s.id.slice(-6)}`
                : "";
              const due = Number((s as any).dueAmount || 0);

              return (
                <div key={s.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{receipt}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatSaleDate((s as any).createdAt)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-semibold">
                        {formatMoney(Number((s as any).total || 0))}
                      </div>
                      {due > 0 ? (
                        <div className="text-xs text-warning">
                          Qarz: {formatMoney(due)}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">To‘langan</div>
                      )}
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className="mt-2 text-sm">
                      {items.slice(0, 4).map((it, idx) => (
                        <div
                          key={`${s.id}-${idx}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="truncate">
                            {String(it.nameSnapshot || it.name || "NOMA'LUM")}
                          </div>
                          <div className="whitespace-nowrap">x{Number(it.qty || 0)}</div>
                        </div>
                      ))}
                      {items.length > 4 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          + {items.length - 4} ta tovar...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      
<Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Savdo tarixi (PDF / Telegram)">
  <div className="space-y-3">
    <div className="text-sm text-muted-foreground">
      Mijoz savdolarini PDF qilib yuklab olish (Print → Save as PDF) yoki Telegramga yuborish.
    </div>

    <div className="grid grid-cols-2 gap-2">
      <Input
        label="Boshlanish sana"
        type="date"
        value={exportFrom}
        onChange={(e) => setExportFrom(e.target.value)}
      />
      <Input
        label="Tugash sana"
        type="date"
        value={exportTo}
        onChange={(e) => setExportTo(e.target.value)}
      />
    </div>

    <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
      Eslatma: Eksport so‘nggi 500 ta savdo ichidan tanlangan sana oralig‘ini oladi (tezlik va barqarorlik uchun).
    </div>

    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Button
        variant="secondary"
        onClick={() => {
          const fromMs = exportFrom ? new Date(exportFrom + "T00:00:00").getTime() : -Infinity;
          const toMs = exportTo ? new Date(exportTo + "T23:59:59").getTime() : Infinity;
          const filtered = sales.filter((s) => {
            const ts = Number((s as any).createdAt || 0);
            return ts >= fromMs && ts <= toMs;
          });
          openCustomerSalesPrint({
            customerName: customer?.name || "NOMA'LUM",
            customerPhone: customer?.phone || "",
            from: exportFrom || "",
            to: exportTo || "",
            sales: filtered,
          });
        }}
        disabled={!sales.length}
      >
        PDF yuklab olish
      </Button>

      <Button
        loading={exportBusy}
        onClick={async () => {
          if (!shopId || !customer) return;
          setExportBusy(true);
          try {
            await sendCustomerSalesPdf({
              shopId,
              customerId: customer.id,
              from: exportFrom || undefined,
              to: exportTo || undefined,
              target: "auto",
            });
            toast.push("Telegramga yuborildi", "success");
          } catch (e: any) {
            toast.push(e?.message || "Telegramga yuborishda xatolik", "error");
          } finally {
            setExportBusy(false);
          }
        }}
        disabled={!sales.length || !customer}
      >
        Telegramga yuborish
      </Button>

      <Button variant="ghost" onClick={() => setExportOpen(false)}>
        Yopish
      </Button>
    </div>
  </div>
</Modal>

<Modal open={payOpen} onClose={() => setPayOpen(false)} title="Mijoz to'lovi">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={payType === "cash" ? "primary" : "secondary"}
              onClick={() => setPayType("cash")}
            >
              Naqd
            </Button>
            <Button
              type="button"
              variant={payType === "card" ? "primary" : "secondary"}
              onClick={() => setPayType("card")}
            >
              Karta
            </Button>
          </div>

          <div>
            <div className="text-xs text-muted mb-1">Summa</div>
            <Input value={payAmount} onChange={(e: any) => setPayAmount(e.target.value)} placeholder="Masalan: 10000" />
          </div>

          <div>
            <div className="text-xs text-muted mb-1">Izoh (ixtiyoriy)</div>
            <Input value={payNote} onChange={(e: any) => setPayNote(e.target.value)} placeholder="Masalan: qarz yopildi" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setPayOpen(false)}>
              Bekor
            </Button>
            <Button loading={payLoading} type="button" onClick={submitPayment}>
              Saqlash
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default CustomerDetailPage;
