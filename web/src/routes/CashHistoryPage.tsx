// BUILD_TAG: variantC+sidebar+cashhistory+void-return-pin v2 (2026-01-17)
import React from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Modal } from "@/ui/Modal";
import { Input } from "@/ui/Input";
import { useToast } from "@/ui/Toast";
import { useAuth } from "@/auth/useAuth";
import { listRecentSales, listCashTxns, createReturn, voidSale } from "@/services/sales";
import type { Sale } from "@/types";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { formatMoney } from "@/lib/money";
import { exportToExcel } from "@/lib/excel";
import { openReceiptPrint } from "@/modules/pos/receipt";

function typeLabel(t: string) {
  switch (t) {
    case "SALE":
      return "Savdo";
    case "REFUND":
      return "Qaytarish";
    case "EXPENSE":
      return "Harajat";
    case "PURCHASE":
      return "Kirim to'lovi";
    case "SUPPLIER_PAYMENT":
      return "Ta'minotchi to'lovi";
    case "CUSTOMER_PAYMENT":
      return "Mijoz to'lovi";
    default:
      return t;
  }
}

export function CashHistoryPage() {
  const toast = useToast();
  const { shopId, user, role } = useAuth();

  const [sales, setSales] = React.useState<Sale[]>([]);

  // Prevent double-click / double-submit (RETURN / VOID)
  const [busyAction, setBusyAction] = React.useState<null | "return" | "void">(null);
  const [cash, setCash] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<Sale | null>(null);

  // Filters
  const [qSearch, setQSearch] = React.useState("");
  const [qStatus, setQStatus] = React.useState<"all" | "ok" | "voided">("all");
  const [qPay, setQPay] = React.useState<"all" | "cash" | "card">("all");
  const [qPeriod, setQPeriod] = React.useState<"all" | "day" | "week" | "month">("all");
  const [qFrom, setQFrom] = React.useState<string>("");
  const [qTo, setQTo] = React.useState<string>("");

  // RETURN modal
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [returnMap, setReturnMap] = React.useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = React.useState("Xato kiritildi");
  const [returnNote, setReturnNote] = React.useState("");

  // VOID modal
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState("Xato kiritildi");
  const [voidNote, setVoidNote] = React.useState("");
  const [voidConfirm, setVoidConfirm] = React.useState("");

  // PIN (cashier+PIN). Admin can do directly, but PIN is allowed too.
  const [adminPin, setAdminPin] = React.useState("");

  async function refresh() {

    try {
      setSales(await listRecentSales(shopId, 60));
      setCash(await listCashTxns(shopId));
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  function toMs(v: any): number {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "string") return new Date(v).getTime() || 0;
    if (typeof v?.toDate === "function") return v.toDate().getTime();
    if (typeof v?.seconds === "number") return v.seconds * 1000;
    return 0;
  }

  function inSelectedPeriod(ts: number): boolean {
  // Custom date range overrides quick periods
  if (qFrom || qTo) {
    const fromMs = qFrom ? new Date(qFrom + "T00:00:00").getTime() : -Infinity;
    const toMs = qTo ? new Date(qTo + "T23:59:59").getTime() : Infinity;
    return ts >= fromMs && ts <= toMs;
  }

  if (qPeriod === "all") return true;
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  if (qPeriod === "day") return ts >= now - oneDay;
  if (qPeriod === "week") return ts >= now - oneDay * 7;
  if (qPeriod === "month") return ts >= now - oneDay * 30;
  return true;
}

  const filteredSales = React.useMemo(() => {
    const s = qSearch.trim().toLowerCase();
    return sales.filter((x: any) => {
      if (!inSelectedPeriod(toMs(x.createdAt))) return false;
      if (qStatus === "voided" && x.status !== "voided") return false;
      if (qStatus === "ok" && x.status === "voided") return false;

      if (qPay !== "all") {
        const pt = String(x.paymentType ?? "");
        if (qPay === "cash" && pt !== "cash") return false;
        if (qPay === "card" && pt !== "card") return false;
      }

      if (!s) return true;
      const hay = [
        String(x.saleNo ?? ""),
        String(x.customerNameSnapshot ?? ""),
        String(x.customerPhoneSnapshot ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [sales, qSearch, qStatus, qPay, qPeriod, qFrom, qTo]);

  const filteredCash = React.useMemo(() => {
    return cash.filter((t: any) => inSelectedPeriod(toMs(t.createdAt)));
  }, [cash, qPeriod, qFrom, qTo]);

  function openSale(s: Sale) {
    setSelected(s);
    setReturnMap({});
    setVoidOpen(false);
    setReturnOpen(false);
    setAdminPin("");
    setReturnReason("Xato kiritildi");
    setReturnNote("");
    setVoidReason("Xato kiritildi");
    setVoidNote("");
    setVoidConfirm("");
  }

  function openReturn() {
    if (!selected) return;
    setReturnOpen(true);
    setReturnReason("Xato kiritildi");
    setReturnNote("");

    // init qty=0 for each item
    const m: Record<string, number> = {};
    for (const it of selected.items) m[it.productId] = 0;
    setReturnMap(m);
  }

  function openVoid() {
    if (!selected) return;
    setVoidOpen(true);
    setAdminPin("");
    setVoidReason("Xato kiritildi");
    setVoidNote("");
    setVoidConfirm("");
  }

  async function verifyPin(): Promise<boolean> {
    // If functions not deployed, fallback: only allow admin role (weak, but MVP)
    if (role === "admin" && !import.meta.env.VITE_FIREBASE_REGION) return true;

    try {
      const call = httpsCallable(functions, "verifyAdminPin");
      const res: any = await call({ shopId, pin: adminPin });
      const ok = Boolean(res?.data?.ok);

      // custom claims are applied only after token refresh
      if (ok && user) {
        try {
          await user.getIdToken(true);
        } catch {
          // ignore
        }
      }
      return ok;
    } catch {
      // fallback: if no functions, allow only if role admin and pin non-empty
      return role === "admin" && adminPin.trim().length > 0;
    }
  }

    function makeOpId() {
    // iOS Safari'da crypto.randomUUID bo'lmasligi mumkin
    // Shuning uchun oddiy, lekin yetarlicha unik ID yasaymiz
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

async function submitReturn() {
    if (busyAction) return;
    if (!user || !selected) return;

    if ((selected as any).status === "voided") {
      toast.push("Bu savdo VOID qilingan. Qaytarish mumkin emas.", "error");
      return;
    }

    const items = Object.entries(returnMap)
      .filter(([, q]) => Number(q) > 0)
      .map(([productId, qty]) => ({ productId, qty: Number(qty) }));

    if (items.length === 0) {
      toast.push("Qaytarish uchun miqdor tanlanmadi", "error");
      return;
    }

    // TARIX: RETURN/VOID PIN bilan
    // Admin: PIN ixtiyoriy, Cashier: PIN majburiy.
    const mustPin = role !== "admin";

    if (mustPin) {
      if (!adminPin.trim()) {
        toast.push("Admin PIN majburiy", "error");
        return;
      }
      const ok = await verifyPin();
      if (!ok) {
        toast.push("PIN noto'g'ri yoki ruxsat yo'q", "error");
        return;
      }
    } else {
      // admin: pin optional
      if (adminPin.trim()) {
        const ok = await verifyPin();
        if (!ok) {
          toast.push("PIN noto'g'ri yoki ruxsat yo'q", "error");
          return;
        }
      }
    }

    setBusyAction("return");
    try {
      const operationId = makeOpId();
      const res = await createReturn({
        operationId,
        shopId,
        actorId: user.uid,
        approvedBy: user.uid,
        saleId: selected.id,
        items,
        reason: returnReason,
        note: returnNote.trim() || undefined,
      });

      toast.push(`Qaytarish qilindi: ${formatMoney(res.totalRefund)}`, "success");
      setReturnOpen(false);
      setSelected(null);
      refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitVoid() {
    if (busyAction) return;
    if (!user || !selected) return;

    if ((selected as any).status === "voided") {
      toast.push("Bu savdo allaqachon VOID qilingan", "error");
      return;
    }

    if (voidConfirm.trim().toUpperCase() !== "VOID") {
      toast.push("Tasdiqlash uchun VOID deb yozing", "error");
      return;
    }

    const mustPin = role !== "admin";

    if (mustPin) {
      if (!adminPin.trim()) {
        toast.push("Admin PIN majburiy", "error");
        return;
      }
      const ok = await verifyPin();
      if (!ok) {
        toast.push("PIN noto'g'ri yoki ruxsat yo'q", "error");
        return;
      }
    } else {
      if (adminPin.trim()) {
        const ok = await verifyPin();
        if (!ok) {
          toast.push("PIN noto'g'ri yoki ruxsat yo'q", "error");
          return;
        }
      }
    }


    setBusyAction("void");
    try {
      await voidSale({
        shopId,
        actorId: user.uid,
        approvedBy: user.uid,
        saleId: selected.id,
        reason: voidReason,
        note: voidNote.trim() || undefined,
      });

      toast.push("Savdo VOID qilindi", "success");
      setVoidOpen(false);
      setSelected(null);
      refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      setBusyAction(null);
    }
  }

// ----------------------------
// Excel export helpers
// ----------------------------
function toLocalDateStr(v: any) {
  try {
    if (!v) return "";
    if (typeof v === "number") return new Date(v).toLocaleString();
    if (typeof v === "string") return new Date(v).toLocaleString();
    if (typeof v?.toDate === "function") return v.toDate().toLocaleString(); // Firestore Timestamp
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toLocaleString();
    return String(v);
  } catch {
    return String(v ?? "");
  }
}

function exportSalesExcel() {
  const rows = filteredSales.map((s: any) => ({
    Sana: toLocalDateStr(s.createdAt),
    Chek: String(s.saleNo ?? ""),
    Mijoz: String(s.customerNameSnapshot ?? ""),
    Telefon: String(s.customerPhoneSnapshot ?? ""),
    Jami: Number(s.total ?? 0),
    "To'landi": Number(s.paidAmount ?? 0),
    Qarz: Number(s.dueAmount ?? 0),
    "To'lov turi": s.paymentType === "cash" ? "Naqd" : s.paymentType === "card" ? "Karta" : String(s.paymentType ?? ""),
    Holat: (s as any).status === "voided" ? "VOID" : "OK",
  }));

  const fname = `sales_${shopId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  exportToExcel(rows, fname, "Sales");
}

function exportCashExcel() {
  const rows = filteredCash.map((t: any) => ({
    Sana: toLocalDateStr(t.createdAt),
    Tur: typeLabel(String(t.type ?? "")),
    Summa: Number(t.amount ?? 0),
    "To'lov turi": t.paymentType === "cash" ? "Naqd" : t.paymentType === "card" ? "Karta" : String(t.paymentType ?? ""),
    Ref: String(t.refId ?? ""),
  }));

  const fname = `cash_${shopId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  exportToExcel(rows, fname, "Cash");
}

  return (
    <div className="space-y-4">
      <Card title="Kassa tarixi (Savdolar)" right={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={exportSalesExcel} disabled={sales.length===0}>Sales Excel</Button>
            <Button variant="secondary" onClick={exportCashExcel} disabled={filteredCash.length===0}>Cash Excel</Button>
          </div>
        }>
        {sales.length === 0 ? (
          <div className="text-sm text-muted-foreground">Hozircha savdo yo'q.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1">
                <div className="text-xs text-muted-foreground mb-1">Qidirish (chek/mijoz/telefon)</div>
                <input
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                  placeholder="Masalan: 000123 yoki Ali yoki +998..."
                  value={qSearch}
                  onChange={(e) => setQSearch(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Holat</div>
                <select
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                  value={qStatus}
                  onChange={(e) => setQStatus(e.target.value as any)}
                >
                  <option value="all">Barchasi</option>
                  <option value="ok">OK</option>
                  <option value="voided">VOID</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">To'lov</div>
                <select
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                  value={qPay}
                  onChange={(e) => setQPay(e.target.value as any)}
                >
                  <option value="all">Barchasi</option>
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Davr</div>
                <select
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                  value={qPeriod}
                  onChange={(e) => setQPeriod(e.target.value as any)}
                >
                  <option value="all">Barchasi</option>
                  <option value="day">Kunlik</option>
                  <option value="week">Haftalik</option>
                  <option value="month">Oylik</option>
                </select>
              </div>

              <div>
                <Input
                  label="Boshlanish sana"
                  type="date"
                  value={qFrom}
                  onChange={(e) => setQFrom(e.target.value)}
                />
              </div>

              <div>
                <Input
                  label="Tugash sana"
                  type="date"
                  value={qTo}
                  onChange={(e) => setQTo(e.target.value)}
                />
              </div>


              <Button
                variant="ghost"
                onClick={() => {
                  setQSearch("");
                  setQStatus("all");
                  setQPay("all");
                  setQPeriod("all");
                }}
              >
                Tozalash
              </Button>
            </div>

            {filteredSales.length === 0 ? (
              <div className="text-sm text-muted-foreground">Filter bo'yicha natija topilmadi.</div>
            ) : null}

            <>
          <div className="hidden overflow-x-auto">
              <table className="ali-table table-fixed ali-gap-st">
              <thead>
                <tr className="hidden sm:table-row text-left text-xs text-muted-foreground">
                  <th className="py-2 w-40">Sana</th>
                  <th>Chek</th>
                  <th>Mijoz</th>
                  <th className="px-4 text-center">Jami</th>
                  <th className="px-4 text-center">To'landi</th>
                  <th className="px-4 text-center">Qarz</th>
                  <th className="px-4 text-center">To'lov</th>
                  <th className="px-4 text-center">Holat</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filteredSales.map((s) => (
                  <tr key={s.id} className="border-t border-border/40">
                    <td className="py-2">
                      <div className="text-xs">{new Date(s.createdAt).toLocaleString()}</div>
                    </td>

                    <td className="hidden sm:table-cell px-4 text-center text-xs text-muted-foreground">
                      {s.saleNo}
                    </td>

                    <td className="text-xs pr-4">
                      <div className="font-medium text-foreground">{s.customerNameSnapshot ?? "—"}</div>
                      <div className="sm:hidden mt-1 text-[11px] text-muted-foreground space-y-0.5">
                        <div>
                          <span className="font-medium text-foreground/80">Chek:</span> {s.saleNo}
                        </div>
                        <div>
                          <span className="font-medium text-foreground/80">To'lov:</span> {s.paymentType === "cash" ? "Naqd" : "Karta"}
                        </div>
                        <div>
                          <span className="font-medium text-foreground/80">Holat:</span> {(s as any).status ?? "completed"}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 text-center">
                      <div className="ali-mobile-label">Jami</div>
                      <div>{formatMoney(Number(s.total))}</div>
                    </td>

                    <td className="px-4 text-center">
                      <div className="ali-mobile-label">To'landi</div>
                      <div>{formatMoney(Number(s.paidAmount))}</div>
                    </td>

                    <td className={`px-4 text-center ${s.dueAmount > 0 ? "text-destructive font-semibold" : ""}`}>
                      <div className="ali-mobile-label">Qarz</div>
                      <div>{formatMoney(Number(s.dueAmount))}</div>
                    </td>

                    <td className="hidden sm:table-cell px-4 text-center text-xs text-muted-foreground">
                      {s.paymentType === "cash" ? "Naqd" : "Karta"}
                    </td>

                    <td className="hidden sm:table-cell px-4 text-center text-xs">
                      {(s as any).status === "voided" ? (
                        <span className="text-destructive font-semibold">VOID</span>
                      ) : (
                        <span className="text-success font-semibold">OK</span>
                      )}
                    </td>

                    <td className="text-right">
                      <Button variant="ghost" onClick={() => openSale(s)}>
                        Ko'rish
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredSales.length === 0 ? (
              <div className="text-sm text-muted-foreground">Filter bo'yicha savdo topilmadi.</div>
            ) : (
              filteredSales.map((x) => (
                <div key={x.id} className="h-full rounded-2xl border border-border/40 bg-muted/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{x.customerNameSnapshot || "—"}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{new Date(x.createdAt).toLocaleString()}</div>

                      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground/80">Chek:</span> {x.saleNo || `S-${x.id.slice(-4).toUpperCase()}`}
                        </div>
                        <div>
                          <span className="font-medium text-foreground/80">To'lov:</span> {x.paymentType === "cash" ? "Naqd" : x.paymentType === "card" ? "Karta" : x.paymentType}
                        </div>
                        <div>
                          <span className="font-medium text-foreground/80">Holat:</span> {x.status || "completed"}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Jami</div>
                      <div className="text-base font-semibold">{formatMoney(Number(x.total || 0))}</div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="text-muted-foreground">
                          To'landi: <span className="text-foreground">{formatMoney(Number(x.paidAmount || 0))}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Qarz: <span className={Number(x.dueAmount || 0) > 0 ? "text-destructive" : "text-foreground"}>{formatMoney(Number(x.dueAmount || 0))}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button variant="outline" className="h-9" onClick={() => openSale(x)}>
                      Ko'rish
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
          </div>
        )}
      </Card>

      <Card title="Cash transactions (kirim/chiqim log)">
        {filteredCash.length === 0 ? (
          <div className="text-sm text-muted-foreground">Hozircha transaction yo'q.</div>
        ) : (
          <>
          <div className="hidden overflow-x-auto">
            <table className="ali-table table-fixed ali-gap-st">
              <thead>
                <tr className="hidden sm:table-row text-left text-xs text-muted-foreground">
                  <th className="py-2 w-40">Sana</th>
                  <th className="w-44">Type</th>
                  <th className="px-2 text-right w-32 pr-8">Summa</th>
                  <th className="px-4 text-left w-24 pl-8">To'lov</th>
                  <th className="px-2 w-72">Ref</th>
                </tr>
              </thead>
              <tbody>
                {filteredCash.slice(0, 80).map((t) => (
                  <tr key={t.id} className="border-t border-border/40">
                    <td className="py-2">
                      <div className="text-xs">{new Date(t.createdAt).toLocaleString()}</div>
                    </td>
                    <td className="text-xs">
                      <div className="font-medium text-foreground">{typeLabel(t.type)}</div>
                      <div className="sm:hidden mt-1 text-[11px] text-muted-foreground space-y-0.5">
                        <div>
                          <span className="font-medium text-foreground/80">To'lov:</span> {t.paymentType === "cash" ? "Naqd" : "Karta"}
                        </div>
                        <div>
                          <span className="font-medium text-foreground/80">Ref:</span> {t.refId}
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 text-right ${t.amount < 0 ? "text-destructive" : ""}`}>
                      <div className="ali-mobile-label">Summa</div>
                      <div>{formatMoney(Number(t.amount))}</div>
                    </td>
                    <td className="hidden sm:table-cell px-4 text-left pl-8 text-xs text-muted-foreground">
                      {t.paymentType === "cash" ? "Naqd" : "Karta"}
                    </td>
                    <td className="hidden sm:table-cell px-2 text-left text-xs text-muted-foreground truncate">{t.refId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCash.slice(0, 80).map((t) => (
              <div key={t.id} className="h-full rounded-2xl border border-border/40 bg-muted/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{typeLabel(t.type)}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</div>

                    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground/80">To'lov:</span> {t.paymentType === "cash" ? "Naqd" : "Karta"}
                      </div>
                      <div className="break-words">
                        <span className="font-medium text-foreground/80">Ref:</span> {t.refId}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">Summa</div>
                    <div className={Number(t.amount) < 0 ? "text-destructive font-semibold" : "font-semibold"}>{formatMoney(Number(t.amount || 0))}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
        )}
      </Card>

      {/* SALE DETAIL */}
      <Modal open={!!selected} title="Savdo tafsiloti" onClose={() => setSelected(null)}>
        {selected ? (
          <div className="space-y-3">
            <div className="hidden sm:block text-xs text-muted-foreground">{new Date(selected.createdAt).toLocaleString()}</div>
            <div className="text-sm">
              <b>Chek:</b> {selected.saleNo}
            </div>
            <div className="text-sm">
              <b>Mijoz:</b> {selected.customerNameSnapshot ?? "—"} {selected.customerPhoneSnapshot ? `(${selected.customerPhoneSnapshot})` : ""}
            </div>

            <div className="rounded-[var(--radius-card)] bg-secondary/15 p-3 text-sm border border-border/40">
              <div>
                <b>Jami:</b> {formatMoney(selected.total)}
              </div>
              <div>
                <b>To'landi:</b> {formatMoney(selected.paidAmount)}
              </div>
              <div>
                <b>Qarz:</b> {formatMoney(selected.dueAmount)}
              </div>
              <div>
                <b>Holat:</b> {(selected as any).status ?? "completed"}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="ali-table table-fixed ali-gap-st">
                <thead>
                  <tr className="hidden sm:table-row text-left text-xs text-muted-foreground">
                    <th className="py-2">Tovar</th>
                    <th className="text-right">Miqdor</th>
                    <th className="text-right">Narx</th>
                    <th className="text-right">Summa</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((i) => (
                    <tr key={i.productId} className="border-t border-border/40">
                      <td className="py-2 text-xs font-medium">{i.nameSnapshot ?? i.productId}</td>
                      <td className="text-right">
                        <div className="ali-mobile-label">Miqdor</div>
                        <div>{i.qty}</div>
                      </td>
                      <td className="text-right">
                        <div className="ali-mobile-label">Narx</div>
                        <div>{formatMoney(Number(i.unitPrice))}</div>
                      </td>
                      <td className="text-right">
                        <div className="ali-mobile-label">Summa</div>
                        <div>{formatMoney(Number(i.lineTotal))}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" disabled={(selected as any).status === "voided"} onClick={openReturn}>
                {role === "admin" ? "RETURN" : "RETURN (PIN)"}
              </Button>

              <Button variant="danger" disabled={(selected as any).status === "voided"} onClick={openVoid}>
                {role === "admin" ? "VOID" : "VOID (PIN)"}
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  openReceiptPrint({
                    saleNo: String((selected as any).saleNo ?? ""),
                    items: (selected as any).items ?? [],
                    total: Number((selected as any).total ?? (selected as any).totalAmount ?? 0),
                    paidAmount: Number((selected as any).paidAmount ?? 0),
                    dueAmount: Number((selected as any).dueAmount ?? 0),
                    paymentType: String((selected as any).paymentType ?? "") as any,
                    createdAt: Number((selected as any).createdAt ?? Date.now()),
                  })
                }
              >
                Chek / PDF
              </Button>

              <Button variant="ghost" onClick={() => setSelected(null)}>
                Yopish
              </Button>
            </div>

            {(selected as any).status === "voided" ? (
              <div className="text-xs text-muted-foreground">Bu savdo VOID qilingan. Qaytarish/VOID qayta bajarilmaydi.</div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* VOID MODAL */}
      <Modal open={voidOpen} title="Savdoni VOID qilish" onClose={() => setVoidOpen(false)}>
        {selected ? (
          <div className="space-y-3">
            <div className="text-sm">Ushbu savdo bekor qilinadi va omborga tovarlar qaytadi.</div>

            <div className="rounded-[var(--radius-card)] bg-secondary/15 p-3 text-sm border border-border/40">
              <div>
                <b>Chek:</b> {selected.saleNo}
              </div>
              <div>
                <b>Qaytadigan pul:</b> {formatMoney(Number(selected.paidAmount))}
              </div>
              <div>
                <b>Qaytadigan qarz:</b> {formatMoney(Number(selected.dueAmount))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Sabab</div>
                <select
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                >
                  <option value="Xato kiritildi">Xato kiritildi</option>
                  <option value="Mijoz qaytardi">Mijoz qaytardi</option>
                  <option value="Noto'g'ri narx">Noto'g'ri narx</option>
                  <option value="Boshqa">Boshqa</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Izoh (ixtiyoriy)</div>
                <input
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                  placeholder="Masalan: chek xato bosildi"
                  value={voidNote}
                  onChange={(e) => setVoidNote(e.target.value)}
                />
              </div>
            </div>

            <Input
              label="Tasdiqlash (VOID deb yozing)"
              value={voidConfirm}
              onChange={(e) => setVoidConfirm(e.target.value)}
            />

            {role !== "admin" ? (
              <Input label="Admin PIN (majburiy)" type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} />
            ) : (
              <Input label="PIN (ixtiyoriy)" type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} />
            )}

            <div className="flex gap-2">
              <Button variant="danger" onClick={submitVoid} disabled={voidConfirm.trim().toUpperCase() !== "VOID"}>
                VOID qilish
              </Button>
              <Button variant="ghost" onClick={() => setVoidOpen(false)}>
                Bekor
              </Button>
            </div>

            <div className="hidden sm:block text-xs text-muted-foreground">Eslatma: VOID/RETURN PIN gating uchun Cloud Functions deploy bo'lishi kerak.</div>
          </div>
        ) : null}
      </Modal>

      {/* RETURN MODAL */}
      <Modal open={returnOpen} title="Qaytarish" onClose={() => setReturnOpen(false)}>
        {selected ? (
          <div className="space-y-3">
            <div className="hidden sm:block text-xs text-muted-foreground">Qaytariladigan miqdorni kiriting (0 = qaytarmaydi)</div>

            <div className="space-y-2">
              {selected.items.map((it) => (
                <div key={it.productId} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 p-2">
                  <div>
                    <div className="text-sm font-medium">{it.nameSnapshot}</div>
                    <div className="hidden sm:block text-xs text-muted-foreground">Sotilgan: {it.qty}</div>
                  </div>

                  <input
                    className="w-20 rounded-lg border border-border/40 px-2 py-1 text-right"
                    type="number"
                    min={0}
                    max={it.qty}
                    value={String(returnMap[it.productId] ?? 0)}
                    onChange={(e) => setReturnMap((m) => ({ ...m, [it.productId]: Number(e.target.value) }))}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Sabab</div>
                <select
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                >
                  <option value="Xato kiritildi">Xato kiritildi</option>
                  <option value="Mijoz qaytardi">Mijoz qaytardi</option>
                  <option value="Buzilgan / yaroqsiz">Buzilgan / yaroqsiz</option>
                  <option value="Boshqa">Boshqa</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Izoh (ixtiyoriy)</div>
                <input
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                  placeholder="Masalan: 1 dona qaytdi"
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                />
              </div>
            </div>

            {role !== "admin" ? (
              <Input label="Admin PIN (majburiy)" type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} />
            ) : (
              <Input label="PIN (ixtiyoriy)" type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} />
            )}

            <div className="flex gap-2">
              <Button onClick={submitReturn}>Tasdiqlash</Button>
              <Button variant="ghost" onClick={() => setReturnOpen(false)}>
                Bekor
              </Button>
            </div>

            <div className="hidden sm:block text-xs text-muted-foreground">Eslatma: PIN tekshiruvi uchun `functions` ni deploy qilish tavsiya etiladi.</div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

