import React from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { useToast } from "@/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { createExpense, listExpenses } from "@/services/expenses";
import { listUsersInShop } from "@/services/staff";
import { enqueueOfflineJob, shouldQueueByError } from "@/services/offlineQueue";
import type { Expense, PaymentType } from "@/types";
import { formatMoneyInput, parseMoneyInput, formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

type Period = "day" | "week" | "month" | "all";
const PERIOD_LABELS: Record<Period, string> = {
  day: "Kunlik",
  week: "Haftalik",
  month: "Oylik",
  all: "Barchasi",
};

// Tanlangan davr uchun [boshi, oxiri) diapazonni qaytaradi (ms)
function rangeFor(period: Period): [number, number] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86400000;
  if (period === "day") return [startOfToday, endOfToday];
  if (period === "week") return [startOfToday - 6 * 86400000, endOfToday];
  if (period === "month") return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), endOfToday];
  return [0, Number.MAX_SAFE_INTEGER];
}

export function ExpensesPage() {
  const toast = useToast();
  const { shopId, user } = useAuth();
  const [items, setItems] = React.useState<Expense[]>([]);
  const [open, setOpen] = React.useState(false);
  const [period, setPeriod] = React.useState<Period>("day");
  const [userNames, setUserNames] = React.useState<Record<string, string>>({});

  const [category, setCategory] = React.useState("Ijara");
  const [amountText, setAmountText] = React.useState("0");
  const [paymentType, setPaymentType] = React.useState<PaymentType>("cash");
  const [note, setNote] = React.useState("");
  // Saqlashni ikki marta bosishga qarshi
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);

  async function refresh() {
    try {
      setItems(await listExpenses(shopId));
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  React.useEffect(() => {
    refresh();
    // Sotuvchi/ishchi ismlarini yuklaymiz (harajatni kim qilganini ko'rsatish uchun)
    listUsersInShop(shopId)
      .then((users) => {
        const m: Record<string, string> = {};
        for (const u of users as any[]) m[u.id] = u.displayName || u.email || u.id;
        setUserNames(m);
      })
      .catch(() => setUserNames({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const [fromTs, toTs] = React.useMemo(() => rangeFor(period), [period]);
  const filtered = React.useMemo(
    () => items.filter((x) => Number(x.createdAt) >= fromTs && Number(x.createdAt) < toTs),
    [items, fromTs, toTs]
  );

  const whoLabel = (uid?: string) => (uid ? userNames[uid] || uid : "—");
  const total = React.useMemo(
    () => filtered.reduce((a, x) => a + Number(x.amount || 0), 0),
    [filtered]
  );

  // Kim nimaga qancha — jamlash (foydalanuvchi + kategoriya bo'yicha)
  function groupSum(keyFn: (x: Expense) => string) {
    const m = new Map<string, number>();
    for (const x of filtered) {
      const k = keyFn(x);
      m.set(k, (m.get(k) || 0) + Number(x.amount || 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }

  // PDF/Pechat — brauzer print oynasi (PDF sifatida ham saqlasa bo'ladi)
  function printReport() {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = filtered
      .slice()
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      .map(
        (x) => `<tr>
          <td>${esc(new Date(Number(x.createdAt)).toLocaleString())}</td>
          <td>${esc(whoLabel(x.createdBy))}</td>
          <td>${esc(x.category)}</td>
          <td>${esc(x.paymentType === "card" ? "Karta" : "Naqd")}</td>
          <td>${esc(x.note || "")}</td>
          <td style="text-align:right">${formatMoney(Number(x.amount || 0))}</td>
        </tr>`
      )
      .join("");
    const byUser = groupSum((x) => whoLabel(x.createdBy))
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${formatMoney(v)}</td></tr>`)
      .join("");
    const byCat = groupSum((x) => x.category || "—")
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${formatMoney(v)}</td></tr>`)
      .join("");
    const periodLabel = PERIOD_LABELS[period];
    const rangeText =
      period === "all"
        ? "Barcha davr"
        : `${new Date(fromTs).toLocaleDateString()} — ${new Date(toTs - 1).toLocaleDateString()}`;

    w.document.write(`<html><head><meta charset="utf-8"><title>Harajatlar — ${periodLabel}</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto;padding:20px;color:#111}
      h1{font-size:18px;margin:0 0 4px} .muted{color:#666;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f5f5f5}
      .totals{display:flex;gap:24px;flex-wrap:wrap;margin-top:16px}
      .totals > div{flex:1;min-width:240px}
      .grand{margin-top:16px;font-size:16px;font-weight:800;text-align:right}
      @media print{button{display:none}}
    </style></head><body>
      <h1>PULT UZ — Harajatlar hisoboti (${periodLabel})</h1>
      <div class="muted">Davr: ${rangeText} • Chop etilgan: ${new Date().toLocaleString()}</div>

      <table>
        <thead><tr><th>Sana</th><th>Kim</th><th>Kategoriya</th><th>To'lov</th><th>Izoh</th><th style="text-align:right">Summa</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#888">Harajat yo\'q</td></tr>'}</tbody>
      </table>

      <div class="totals">
        <div>
          <h1 style="font-size:14px">Kim bo'yicha</h1>
          <table><thead><tr><th>Ishchi</th><th style="text-align:right">Jami</th></tr></thead><tbody>${byUser}</tbody></table>
        </div>
        <div>
          <h1 style="font-size:14px">Kategoriya bo'yicha</h1>
          <table><thead><tr><th>Kategoriya</th><th style="text-align:right">Jami</th></tr></thead><tbody>${byCat}</tbody></table>
        </div>
      </div>

      <div class="grand">Umumiy harajat: ${formatMoney(total)}</div>
      <button onclick="window.print()" style="margin-top:16px;padding:10px 16px;border:0;border-radius:8px;background:#284B59;color:#fff;font-weight:700">🖨️ Chop etish / PDF</button>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }


  async function save() {
    if (!user) return;
    if (savingRef.current) return; // ikki marta bosishga qarshi
    const amount = parseMoneyInput(amountText);
    if (!category.trim() || amount <= 0) {
      toast.push("Kategoriya va summa kerak", "error");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const payload = {
      id: "tmp",
      shopId,
      category: category.trim(),
      amount,
      paymentType,
      note: note.trim() || undefined,
      createdAt: Date.now(),
      createdBy: user.uid,
      // Barqaror ID — offline qayta yuborishda dublikat harajatning oldini oladi
      operationId: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    };

    const resetForm = () => {
      setOpen(false);
      setAmountText("0");
      setNote("");
    };

    try {
      // Internet yo'q — offline navbatga qo'shamiz (internet kelganda avtomatik yuklanadi)
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueueOfflineJob({ type: "expense.create", payload, shopId, userId: user.uid });
        toast.push("Internet yo'q — harajat offline navbatga qo'shildi", "warning");
        resetForm();
        return;
      }

      await createExpense(payload as any);
      toast.push("Harajat qo'shildi", "success");
      resetForm();
      refresh();
    } catch (e: any) {
      if (shouldQueueByError(e)) {
        enqueueOfflineJob({ type: "expense.create", payload, shopId, userId: user.uid });
        toast.push("Aloqa uzildi — harajat navbatga qo'shildi", "warning");
        resetForm();
        return;
      }
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="Harajatlar"
        right={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button variant="secondary" onClick={printReport} title="PDF / Chop etish">
              🖨️ PDF / Pechat
            </Button>
            <Button variant="ghost" onClick={() => setOpen(true)}>+ Harajat qo'shish</Button>
          </div>
        }
      >
        {/* Davr tanlash: kunlik / haftalik / oylik / barchasi */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(["day", "week", "month", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "h-9 rounded-[var(--radius-btn)] border px-3 text-sm font-medium transition",
                  period === p
                    ? "border-transparent bg-accent text-accent-foreground"
                    : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="text-sm">
            Jami: <b className="text-destructive">{formatMoney(total)}</b>
            <span className="ml-2 text-xs text-muted-foreground">({filtered.length} ta)</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">Bu davrda harajat yo'q.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((x) => (
              <div key={x.id} className="rounded-2xl border bg-muted/40 p-4 shadow-sm">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold truncate">{x.category}</div>
                    <div className="font-semibold text-destructive">{formatMoney(x.amount)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(Number(x.createdAt)).toLocaleString()}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Kim</div>
                      <div className="font-medium truncate" title={whoLabel(x.createdBy)}>{whoLabel(x.createdBy)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">To'lov</div>
                      <div className="font-medium">{x.paymentType === "card" ? "Karta" : "Naqd"}</div>
                    </div>
                  </div>
                  {x.note ? (
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Izoh: </span>
                      <span className="break-words">{x.note}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={open} title="Harajat qo'shish" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Input label="Kategoriya" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Input label="Summa" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(formatMoneyInput(e.target.value))} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant={paymentType === "cash" ? "primary" : "ghost"} onClick={() => setPaymentType("cash")}>
              Naqd
            </Button>
            <Button variant={paymentType === "card" ? "primary" : "ghost"} onClick={() => setPaymentType("card")}>
              Karta
            </Button>
          </div>
          <Input label="Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>{saving ? "Saqlanmoqda..." : "Saqlash"}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Bekor</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}