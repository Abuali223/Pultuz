import React from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { useToast } from "@/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { formatMoney, round2 } from "@/lib/money";
import { generateEAN13 } from "@/lib/ean13";
import { listProducts } from "@/services/products";
import { MoneyInput } from "@/ui/MoneyInput";
import { createProduction, listProductions, summarizeByProduct } from "@/services/production";
import { invalidateProductCache } from "@/ui/GlobalSearch";
import type { Product, Production } from "@/types";

type Period = "day" | "week" | "month" | "all";
const PERIOD_LABELS: Record<Period, string> = { day: "Kunlik", week: "Haftalik", month: "Oylik", all: "Barchasi" };
function rangeFor(period: Period): [number, number] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86400000;
  if (period === "day") return [startOfToday, endOfToday];
  if (period === "week") return [startOfToday - 6 * 86400000, endOfToday];
  if (period === "month") return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), endOfToday];
  return [0, Number.MAX_SAFE_INTEGER];
}

type MatRow = { productId: string; qty: number };

export function ProductionPage() {
  const toast = useToast();
  const { user, shopId, role } = useAuth();
  const canEdit = role === "admin" || role === "warehouse";

  const [products, setProducts] = React.useState<Product[]>([]);
  const [history, setHistory] = React.useState<Production[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [period, setPeriod] = React.useState<Period>("month");

  // Forma
  const [finishedMode, setFinishedMode] = React.useState<"existing" | "new">("existing");
  const [finishedId, setFinishedId] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newBarcode, setNewBarcode] = React.useState("");
  const [newPrice, setNewPrice] = React.useState(0);
  const [qtyProduced, setQtyProduced] = React.useState(1);
  const [rows, setRows] = React.useState<MatRow[]>([{ productId: "", qty: 1 }]);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);

  const materials = React.useMemo(() => products.filter((p) => p.kind === "material"), [products]);
  const finishedList = React.useMemo(() => products.filter((p) => p.kind !== "material"), [products]);

  async function refresh() {
    setLoading(true);
    try {
      const [pl, hs] = await Promise.all([listProducts(shopId), listProductions(shopId)]);
      setProducts(pl);
      setHistory(hs);
    } catch (e: any) {
      toast.push(e?.message ?? "Yuklashda xatolik", "error");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!shopId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // Jonli tannarx hisobi (oldindan ko'rish)
  const totalCost = React.useMemo(() => {
    let t = 0;
    for (const r of rows) {
      const m = materials.find((x) => x.id === r.productId);
      if (m) t += Number(m.avgCost || 0) * Number(r.qty || 0);
    }
    return round2(t);
  }, [rows, materials]);
  const unitCost = qtyProduced > 0 ? round2(totalCost / qtyProduced) : 0;

  const [fromTs, toTs] = React.useMemo(() => rangeFor(period), [period]);
  const periodRows = React.useMemo(
    () => history.filter((h) => Number(h.createdAt) >= fromTs && Number(h.createdAt) < toTs),
    [history, fromTs, toTs]
  );
  const summary = React.useMemo(() => summarizeByProduct(periodRows), [periodRows]);

  async function save() {
    if (!user) return;
    if (savingRef.current) return;

    const mats = rows
      .map((r) => ({ productId: r.productId, qty: Number(r.qty) || 0 }))
      .filter((r) => r.productId && r.qty > 0);
    if (mats.length === 0) return toast.push("Kamida bitta detal (miqdori bilan) kiriting", "error");
    if (!(Number(qtyProduced) > 0)) return toast.push("Ishlab chiqarilgan miqdor > 0 bo'lsin", "error");

    let finished: any;
    if (finishedMode === "existing") {
      if (!finishedId) return toast.push("Tayyor mahsulotni tanlang", "error");
      finished = { productId: finishedId };
    } else {
      if (!newName.trim()) return toast.push("Yangi mahsulot nomini kiriting", "error");
      if (!(Number(newPrice) > 0)) return toast.push("Sotish narxini kiriting", "error");
      let bc = newBarcode.trim().replace(/\D/g, "");
      if (!bc) bc = generateEAN13("290");
      finished = { newProduct: { name: newName.trim(), barcode: bc, price: Number(newPrice), unit: "dona" } };
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const res = await createProduction({
        shopId,
        qtyProduced: Number(qtyProduced),
        materials: mats,
        finished,
        note: note.trim(),
        operationId: `mfg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      });
      invalidateProductCache();
      toast.push(`Yig'ildi ✅ 1 dona tannarx: ${formatMoney(res.unitCost)}`, "success");
      // formani tozalash
      setFinishedId("");
      setNewName("");
      setNewBarcode("");
      setNewPrice(0);
      setQtyProduced(1);
      setRows([{ productId: "", qty: 1 }]);
      setNote("");
      await refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xatolik", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* FORMA */}
      {canEdit ? (
        <Card title="Yangi ishlab chiqarish (yig'ish)">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Tayyor mahsulot */}
            <div className="space-y-3">
              <div className="text-sm font-semibold">Tayyor mahsulot</div>
              <div className="flex gap-2">
                <button
                  className={cn("flex-1 rounded-[var(--radius-card)] border p-2 text-sm font-semibold", finishedMode === "existing" ? "border-transparent bg-accent text-accent-foreground" : "border-border/60 hover:bg-muted")}
                  onClick={() => setFinishedMode("existing")}
                >
                  Mavjuddan tanlash
                </button>
                <button
                  className={cn("flex-1 rounded-[var(--radius-card)] border p-2 text-sm font-semibold", finishedMode === "new" ? "border-transparent bg-accent text-accent-foreground" : "border-border/60 hover:bg-muted")}
                  onClick={() => setFinishedMode("new")}
                >
                  Yangi mahsulot
                </button>
              </div>

              {finishedMode === "existing" ? (
                <select
                  className="h-11 w-full rounded-[var(--radius-input)] border border-border bg-card px-3 text-sm"
                  value={finishedId}
                  onChange={(e) => setFinishedId(e.target.value)}
                >
                  <option value="">— Tayyor mahsulotni tanlang —</option>
                  {finishedList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.barcode ? `(${p.barcode})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <Input label="Mahsulot nomi (masalan: Antena)" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Barcode (bo'sh = avtomatik)" value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} />
                    <MoneyInput label="Sotish narxi" value={newPrice} onValueChange={(n) => setNewPrice(n)} />
                  </div>
                </div>
              )}

              <Input label="Ishlab chiqarilgan miqdor (dona)" type="number" value={String(qtyProduced)} onChange={(e) => setQtyProduced(Number(e.target.value))} />
              <Input label="Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            {/* Detallar */}
            <div className="space-y-3">
              <div className="text-sm font-semibold">Ishlatilgan detallar (xomashyo)</div>
              {materials.length === 0 ? (
                <div className="rounded-[var(--radius-card)] border border-border/40 bg-secondary/10 p-3 text-xs text-muted-foreground">
                  Hali xomashyo yo'q. <b>Kirim</b> bo'limida yangi tovar qo'shishda <b>"Bu xomashyo/detal"</b> ni belgilang.
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map((r, i) => {
                    const m = materials.find((x) => x.id === r.productId);
                    const line = m ? round2(Number(m.avgCost || 0) * Number(r.qty || 0)) : 0;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          className="h-10 flex-1 rounded-[var(--radius-input)] border border-border/60 bg-background px-2 text-sm"
                          value={r.productId}
                          onChange={(e) => setRows((arr) => arr.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}
                        >
                          <option value="">— detal —</option>
                          {materials.map((mm) => (
                            <option key={mm.id} value={mm.id}>
                              {mm.name} • {formatMoney(Number(mm.avgCost || 0))}/{mm.unit || "dona"} • qoldiq {Number(mm.stock ?? 0)}
                            </option>
                          ))}
                        </select>
                        <input
                          className="h-10 w-20 rounded-[var(--radius-input)] border border-border/60 bg-background px-2 text-center text-sm"
                          type="number"
                          min={0}
                          step="any"
                          title="Miqdor"
                          value={r.qty}
                          onChange={(e) => setRows((arr) => arr.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))}
                        />
                        <div className="w-24 text-right text-xs font-semibold text-muted-foreground">{formatMoney(line)}</div>
                        <button
                          className="h-10 w-9 rounded-[var(--radius-icon)] border border-border/60 text-muted-foreground hover:bg-muted"
                          onClick={() => setRows((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== i) : arr))}
                          title="O'chirish"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="secondary" onClick={() => setRows((arr) => [...arr, { productId: "", qty: 1 }])}>
                    + Detal qo'shish
                  </Button>
                </div>
              )}

              {/* Tannarx preview */}
              <div className="rounded-[var(--radius-card)] border border-border/40 bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Jami detallar narxi</span>
                  <b>{formatMoney(totalCost)}</b>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">1 dona tannarxi</span>
                  <b className="text-success">{formatMoney(unitCost)}</b>
                </div>
              </div>

              <Button onClick={save} disabled={saving || materials.length === 0} className="w-full">
                {saving ? "Saqlanmoqda..." : "Yig'ish va omborga kiritish"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* HISOBOT / TARIX */}
      <Card title="Ishlab chiqarish hisoboti">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(["day", "week", "month", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "h-9 rounded-[var(--radius-btn)] border px-3 text-sm font-medium transition",
                  period === p ? "border-transparent bg-accent text-accent-foreground" : "border-border/60 text-muted-foreground hover:bg-muted"
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Mahsulot bo'yicha jamlash: necha dona + 1 dona o'rtacha tannarx */}
        {summary.length > 0 ? (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">Tayyor mahsulot</th>
                  <th className="py-1 pr-2 text-right">Ishlab chiqarildi</th>
                  <th className="py-1 pr-2 text-right">Jami tannarx</th>
                  <th className="py-1 text-right">1 dona o'rtacha</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="py-1.5 pr-2 font-medium">{s.name}</td>
                    <td className="py-1.5 pr-2 text-right">{s.qty} dona</td>
                    <td className="py-1.5 pr-2 text-right">{formatMoney(s.totalCost)}</td>
                    <td className="py-1.5 text-right font-semibold text-success">{formatMoney(s.avgUnitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : periodRows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Bu davrda yig'ish yo'q.</div>
        ) : (
          <div className="space-y-3">
            {periodRows.map((h) => (
              <div key={h.id} className="rounded-[var(--radius-card)] border border-border/40 bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold">{h.finishedNameSnapshot}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{h.productionNo}</span>
                  </div>
                  <div className="text-right text-sm">
                    <span className="font-semibold">{h.qtyProduced} dona</span>
                    <span className="ml-2 text-muted-foreground">1 dona: <b className="text-foreground">{formatMoney(h.unitCost)}</b></span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{new Date(Number(h.createdAt)).toLocaleString()}</div>
                <div className="mt-2 rounded-[var(--radius-card)] border border-border/40 bg-background/40 p-2 text-xs">
                  {(h.materials || []).map((m, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5">
                      <span className="truncate">{m.nameSnapshot} × {m.qty}</span>
                      <span className="shrink-0 text-muted-foreground">{formatMoney(m.lineCost)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex items-center justify-between border-t border-border/40 pt-1 font-semibold">
                    <span>Jami tannarx</span>
                    <span>{formatMoney(h.totalCost)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
