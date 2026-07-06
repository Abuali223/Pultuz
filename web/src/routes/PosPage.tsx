import React from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { CameraScannerModal } from "@/ui/CameraScannerModal";
import { ProductThumb } from "@/ui/ProductThumb";
import { useToast } from "@/ui/Toast";
import { IconPlus, IconScan, IconUser } from "@/ui/icons";

import { useAuth } from "@/auth/AuthProvider";
import { useCart, cartTotal } from "@/modules/pos/cartStore";
import { openReceiptPrint } from "@/modules/pos/receipt";
import { invalidateProductCache } from "@/ui/GlobalSearch";

import { listProducts, findProductByBarcode } from "@/services/products";

function isCutSmProduct(p: any) {
  const unit = String(p.unit ?? "").trim();
  return unit === "sm" && Number(p.cutWidthCm ?? 0) > 0;
}

function availableSm(p: any): number {
  const sheets = Number(p.stock ?? 0);
  const width = Number(p.cutWidthCm ?? 0);
  const rem = Number(p.cutRemainderCm ?? 0);
  return Math.max(0, sheets * width + rem);
}

function qtyStep(unitRaw?: string) {
  const u = String(unitRaw ?? "dona").trim().toLowerCase();
  if (u === "kg" || u === "litr" || u === "metr") return 0.5;
  if (u === "sm") return 1;
  return 1;
}

import { findCustomerByName, findCustomerByPhone, createCustomer, getCustomer, listCustomers } from "@/services/customers";
import { createSale } from "@/services/sales";
import { enqueueOfflineJob, shouldQueueByError } from "@/services/offlineQueue";

import type { Product } from "@/types";
import { cn } from "@/lib/cn";
import { formatMoney, round2 } from "@/lib/money";

function isLikelyBarcode(raw: string) {
  const s = String(raw || "").trim().replace(/\D/g, "");
  return /^[0-9]{8}$/.test(s) || /^[0-9]{12}$/.test(s) || /^[0-9]{13}$/.test(s);
}

/**
 * Narx inputi — local string holati bilan (maydonni tozalab qayta yozish mumkin).
 * Bo'sh yoki noto'g'ri qiymatda savatga tegmaydi; blur/valid qiymatda commit qiladi.
 */
function PriceInput({
  value,
  highlight,
  onCommit,
}: {
  value: number;
  highlight: boolean;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = React.useState<string>(String(value));
  const [editing, setEditing] = React.useState(false);

  // Tashqi qiymat o'zgarsa (masalan ↺ tugmasi) va tahrirlanmayotgan bo'lsa — sinxron
  React.useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  return (
    <input
      className={cn(
        "h-8 w-24 rounded-[var(--radius-input)] border bg-background px-2 text-sm font-semibold outline-none",
        highlight ? "border-warning text-warning" : "border-border/60"
      )}
      type="number"
      min={0}
      step="any"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === "") return;
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) onCommit(n);
      }}
      onBlur={() => {
        setEditing(false);
        const n = Number(text);
        if (text === "" || !Number.isFinite(n) || n < 0) {
          setText(String(value)); // noto'g'ri qiymat — oldingisiga qaytar
        }
      }}
      title="Sotish narxi (qo'lda o'zgartirish mumkin)"
    />
  );
}

export function PosPage() {
  const toast = useToast();
  const nav = useNavigate();
  const { user, shopId } = useAuth();

  // cart
  const lines = useCart((s) => s.lines);
  const addOrInc = useCart((s) => s.addOrInc);
  const setQty = useCart((s) => s.setQty);
  const setPrice = useCart((s) => s.setPrice);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const total = round2(cartTotal(lines));

  // top search (name/barcode)
  const [q, setQ] = React.useState("");
  const qRef = React.useRef<HTMLInputElement>(null);

  // qty for barcode/scanner add
  const [qtyInput, setQtyInput] = React.useState<number>(1);

  // products
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = React.useState(true);
  const [cat, setCat] = React.useState<string>("all");

  // customer
  const [customer, setCustomer] = React.useState<{ id: string; name: string; phone: string } | null>(null);
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [createCustomerOpen, setCreateCustomerOpen] = React.useState(false);
  const [customerListOpen, setCustomerListOpen] = React.useState(false);
  const [customerList, setCustomerList] = React.useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [customerListLoading, setCustomerListLoading] = React.useState(false);
  const [customerListQuery, setCustomerListQuery] = React.useState("");

  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);

  // checkout
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [paidAmount, setPaidAmount] = React.useState<number>(0);
  const [paymentNote, setPaymentNote] = React.useState<string>("");

  // camera scanner
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [cameraMode, setCameraMode] = React.useState<"single" | "multi">("single");
  const holdTimerRef = React.useRef<number | null>(null);
  const holdTriggeredRef = React.useRef<boolean>(false);

  async function refreshProducts() {
    setLoadingProducts(true);
    try {
      const list = await listProducts(shopId);
      setProducts(list);
    } catch (e: any) {
      toast.push(e?.message ?? "Mahsulotlar yuklanmadi", "error");
    } finally {
      setLoadingProducts(false);
    }
  }

  async function openCustomerList() {
    setCustomerListOpen(true);
    if (customerList.length) return;
    setCustomerListLoading(true);
    try {
      const list = await listCustomers(shopId);
      // show newest first when possible
      const sorted = [...list].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setCustomerList(sorted.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? "" })));
    } catch (e: any) {
      toast.push(e?.message ?? "Mijozlar yuklanmadi", "error");
    } finally {
      setCustomerListLoading(false);
    }
  }

  React.useEffect(() => {
    refreshProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  React.useEffect(() => {
    // scanner usability: focus search box by default
    qRef.current?.focus();
  }, []);

React.useEffect(() => {
  return () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
  };
}, []);

  // ESC: savat bo'sh bo'lmasa "tozalash" confirmini ochish
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmClearOpen) {
        setConfirmClearOpen(false);
        return;
      }
      if (lines.length > 0) {
        setConfirmClearOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines.length, confirmClearOpen]);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const c = (p.category ?? "").trim();
      if (c) set.add(c);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== "all" && (p.category ?? "") !== cat) return false;
      if (!s) return true;
      return (
        (p.name ?? "").toLowerCase().includes(s) ||
        (p.barcode ?? "").toLowerCase().includes(s) ||
        (p.category ?? "").toLowerCase().includes(s) ||
        ((p as any).model ?? "").toLowerCase().includes(s) ||
        ((p as any).brand ?? "").toLowerCase().includes(s) ||
        ((p as any).note ?? "").toLowerCase().includes(s)
      );
    });
  }, [products, q, cat]);

  function addProduct(p: Product, qty = 1) {
    const q = Math.max(0.01, Number(qty) || 0.01);
    if (isCutSmProduct(p)) {
      if (availableSm(p) <= 0) {
        toast.push("Omborda qoldiq yo\'q", "error");
        return;
      }
    } else {
      if (Number(p.stock ?? 0) <= 0) {
        toast.push("Omborda qoldiq yo\'q", "error");
        return;
      }
    }
    // Cut-sm mahsulotda avgCost bir list (sheet) uchun, narx esa 1 sm uchun.
    // Foyda badge'i to'g'ri chiqishi uchun tan narxni 1 sm ga keltiramiz
    // (server ham cutUnitCostPerSm = avgCost/cutWidthCm bilan hisoblaydi).
    const perUnitCost = isCutSmProduct(p)
      ? Number(p.avgCost ?? 0) / Math.max(1, Number(p.cutWidthCm ?? 1))
      : Number(p.avgCost ?? 0);
    addOrInc(
      {
        productId: p.id,
        name: p.name,
        barcode: p.barcode,
        unitPrice: p.price,
        listPrice: p.price,
        unitCost: round2(perUnitCost),
        unit: String(p.unit ?? "dona"),
      },
      q
    );
  }

  async function addByBarcode(codeRaw: string, qty = 1) {
    const code = (codeRaw ?? "").trim();
    if (!code) return;
    try {
      const p = await findProductByBarcode(shopId, code);
      if (!p) {
        toast.push("Barcode topilmadi (ombor)", "error");
        return;
      }
      addProduct(p, qty);
      setQ("");
      setQtyInput(1);
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      qRef.current?.focus();
    }
  }

  async function searchCustomer() {
    const raw = customerQuery.trim();
    if (!raw) return;
    try {
      // Try phone first (common), then name.
      const byPhone = /^[+0-9\-\s]{6,}$/.test(raw) ? await findCustomerByPhone(shopId, raw) : null;
      const byName = byPhone ? null : await findCustomerByName(shopId, raw);
      const c = byPhone ?? byName;

      if (!c) {
        toast.push("Mijoz topilmadi. Yangi qo'shing.", "info");
        setCustomer(null);
        setCustomerName(raw);
        setCustomerPhone("");
        setCreateCustomerOpen(true);
        return;
      }

      setCustomer({ id: c.id, name: c.name, phone: c.phone });
      toast.push("Mijoz tanlandi", "success");
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  async function createNewCustomer() {
    const name = customerName.trim();
    const phone = customerPhone.trim();
    if (!name || !phone) {
      toast.push("Ism va telefon kerak", "error");
      return;
    }
    try {
      const id = await createCustomer(shopId, { name, phone });
      // If rules allow, fetch full doc (future-proof)
      const full = await getCustomer(shopId, id);
      setCustomer({ id, name: full?.name ?? name, phone: full?.phone ?? phone });
      setCustomerQuery("");
      setCreateCustomerOpen(false);
      toast.push("Mijoz yaratildi", "success");
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  function openCheckout() {
    if (lines.length === 0) {
      toast.push("Savat bo'sh", "error");
      return;
    }
    setPaidAmount(total);
    setPaymentNote("");
    setCheckoutOpen(true);
  }

  async function finalize(paymentType: "cash" | "card", opts?: { asDebt?: boolean }) {
    if (!user) return;

    // TAN NARXDAN PAST SOTIB BO'LMAYDI — offline holatda ham client bloklaydi
    // (server ham tekshiradi, bu shunchaki tez va tushunarli xabar uchun).
    const belowCost = lines.find((l) => l.unitCost > 0 && l.unitPrice < l.unitCost - 0.001);
    if (belowCost) {
      toast.push(
        `${belowCost.name}: narx tan narxdan (${formatMoney(belowCost.unitCost)}) past bo'la olmaydi`,
        "error"
      );
      return;
    }

    if (!confirm("Savdo yakunlansinmi?")) return;

    // FIX: "Qarz" tugmasi bosilganda, summa kamaytirilmagan bo'lsa, to'langan=0 (to'liq qarz).
    let paidValue = Number(paidAmount) || 0;
    if (opts?.asDebt && paidValue >= total) paidValue = 0;

    // FIX: barqaror operationId — offline qayta yuborishda dublikat savdoning oldini oladi.
    const operationId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const salePayload = {
      shopId,
      actorId: user.uid,
      paymentType,
      customer,
      // Narx qo'lda o'zgartirilgan bo'lishi mumkin — serverga yuboriladi,
      // server foydani kelgan narxdan (avgCost) avtomatik hisoblaydi.
      items: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })),
      paidAmount: paidValue,
      note: paymentNote.trim(),
      operationId,
    };

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueueOfflineJob({ type: "sale.create", payload: salePayload, shopId, userId: user.uid });
        toast.push("Internet yo'q — savdo offline navbatga qo'shildi", "warning");
        clear();
        setCheckoutOpen(false);
        setCustomer(null);
        setCustomerQuery("");
        return;
      }

      const res = await createSale(salePayload);

      // Ombor o'zgardi — global qidiruv keshini yangilaymiz (qoldiq to'g'ri chiqsin)
      invalidateProductCache();
      refreshProducts();

      toast.push("Savdo yakunlandi", "success");

      openReceiptPrint({
        saleNo: res.saleNo,
        items: lines.map((l) => ({
          productId: l.productId,
          nameSnapshot: l.name,
          barcodeSnapshot: l.barcode,
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitCostSnapshot: 0,
          lineTotal: round2(l.unitPrice * l.qty),
          profit: 0,
        })),
        total: res.total,
        paidAmount: res.paidAmount,
        dueAmount: res.dueAmount,
        paymentType,
        note: paymentNote.trim(),
        sellerName: user.displayName || user.email || "",
        createdAt: Date.now(),
        createdBy: user.uid,
        shopId,
        id: "temp",
        status: "completed",
      } as any);

      clear();
      setCheckoutOpen(false);
      setCustomer(null);
      setCustomerQuery("");
    } catch (e: any) {
      if (shouldQueueByError(e)) {
        enqueueOfflineJob({ type: "sale.create", payload: salePayload, shopId, userId: user.uid });
        toast.push("Aloqa uzildi — savdo navbatga qo'shildi", "warning");
        clear();
        setCheckoutOpen(false);
        setCustomer(null);
        setCustomerQuery("");
        return;
      }
      toast.push(e?.message ?? "Xato", "error");
    }
  }


  return (
    <div className="space-y-4">
      <CameraScannerModal
        open={cameraOpen}
        title="Barcode skaneri"
        mode={cameraMode}
        defaultQty={cameraMode === "single" ? qtyInput : 1}
        description="Kameradan barcode skan qiling (telefon/iPad uchun qulay)."
        onClose={() => setCameraOpen(false)}
        onDetected={(code, detectedQty) => {
          setCameraOpen(false);
          void addByBarcode(code, detectedQty || 1);
        }}
      />

      {/* 2-rasm uslubidagi 3-ustunli POS: mahsulotlar + savat */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* LEFT: products */}
        <section className="lg:col-span-9 space-y-4">
          {/* Top bar */}
          <div className="ali-card p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Dashboard / Savdo</div>
              </div>

              <div className="flex flex-1 items-center gap-2 md:mx-auto md:max-w-[680px]">
                <div className="relative flex-1">
                  <Input
                    ref={qRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const code = q.trim();
                        if (isLikelyBarcode(code)) {
                          e.preventDefault();
                          void addByBarcode(code, qtyInput);
                        }
                      }
                    }}
                    placeholder="🔎 Mahsulot nomi yoki barcode..."
                  />
                </div>

                <div className="w-[120px] hidden sm:block">
                  <Input
                    type="number"
                    step="0.5"
                    value={String(qtyInput)}
                    onChange={(e) => setQtyInput(Math.max(0.01, Number(e.target.value) || 0.01))}
                    placeholder="Miqdor"
                  />
                </div>

                <Button
                  variant="secondary"
                  className="w-12 px-0 justify-center"
                  title="Kamera orqali skan (1 marta bosish = 1 ta, uzoq bosish = uzluksiz)"
                  onPointerDown={() => {
                    // long-press => continuous scan (multi)
                    holdTriggeredRef.current = false;
                    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
                    holdTimerRef.current = window.setTimeout(() => {
                      holdTriggeredRef.current = true;
                      setCameraMode("multi");
                      setCameraOpen(true);
                    }, 700);
                  }}
                  onPointerUp={() => {
                    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
                    // short-press => single scan
                    if (!holdTriggeredRef.current) {
                      setCameraMode("single");
                      setCameraOpen(true);
                    }
                  }}
                  onPointerLeave={() => {
                    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
                  }}
                >
                  <IconScan size={18} />
                </Button>
              </div>

              <div className="hidden md:block text-xs text-muted-foreground">
                Barcode: kiriting + Enter
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="ali-card p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {categories.map((c) => {
                  const active = cat === c;
                  return (
                    <button
                      key={c}
                      onClick={() => setCat(c)}
                      className={cn(
                        "h-9 rounded-[var(--radius-btn)] border px-3 text-sm font-medium transition",
                        active
                          ? "border-transparent bg-accent text-accent-foreground"
                          : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted"
                      )}
                      title={c === "all" ? "Barchasi" : c}
                    >
                      {c === "all" ? "Barchasi" : c}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={refreshProducts} title="Yangilash">
                  Yangilash
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ("");
                    setCat("all");
                    qRef.current?.focus();
                  }}
                >
                  Tozalash
                </Button>
              </div>
            </div>
          </div>

          {/* Product grid */}
          <div className="ali-card p-4">
            {loadingProducts ? (
              <div className="text-sm text-muted-foreground">Mahsulotlar yuklanmoqda...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-sm text-muted-foreground">Mos mahsulot topilmadi.</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredProducts.map((p) => {
                  const stock = Number((p as any).stock ?? 0);
                  const isCut = isCutSmProduct(p as any);
                  const width = Number((p as any).cutWidthCm ?? 0);
                  const rem = Number((p as any).cutRemainderCm ?? 0);
                  const displayStock = isCut && width > 0 ? stock * width + rem : stock;
                  const low = p.minStock != null && displayStock <= Number(p.minStock);

                  return (
                    <div
                      key={p.id}
                      className="ali-card p-3"
                    >
                      <ProductThumb
                        name={p.name ?? "?"}
                        category={p.category}
                        className="h-32 w-full"
                      />

                      <div className="mt-3 space-y-2">
                        <div className="truncate text-sm font-semibold">{p.name}</div>
                        {(p.brand || p.model) ? (
                          <div className="truncate text-[11px] text-muted-foreground">
                            {[p.brand, p.model].filter(Boolean).join(" • ")}
                          </div>
                        ) : null}

                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold">{formatMoney(Number(p.price) || 0)}</div>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold",
                              displayStock <= 0
                                ? "bg-destructive/10 text-destructive"
                                : low
                                ? "bg-warning/15 text-warning"
                                : "bg-success/10 text-success"
                            )}
                            title="Qoldiq"
                          >
                            {displayStock <= 0 ? "Tugagan" : low ? `Kam • ${stock}` : `Bor • ${stock}`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-[11px] text-muted-foreground">{p.barcode}</div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => addProduct(p, 1)}
                            disabled={displayStock <= 0}
                            className="h-9 w-9 px-0 justify-center"
                            title="Savatga qo'shish"
                          >
                            <IconPlus size={18} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: cart */}
        <aside className="lg:col-span-3 space-y-4">
          {/* Customer block (ixtiyoriy) */}
          <div className="ali-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Mijoz</div>
              <button
                className="text-xs font-semibold text-accent-foreground hover:underline"
                onClick={() => {
                  setCustomer(null);
                  setCustomerQuery("");
                }}
                title="Mijozni olib tashlash"
              >
                Tozalash
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <Input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" ? searchCustomer() : null)}
                placeholder="Ism yoki telefon..."
              />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={searchCustomer} className="flex-1">
                  Topish
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setCustomerName(customerQuery.trim());
                    setCustomerPhone("");
                    setCreateCustomerOpen(true);
                  }}
                  className="flex-1"
                >
                  Yangi
                </Button>
              </div>

              <Button size="sm" variant="outline" onClick={openCustomerList}>
                <IconUser />
                Mijozlar ro'yxati
              </Button>

              <div className="rounded-[var(--radius-card)] border border-border/60 bg-muted p-3 text-sm">
                <div className="text-xs font-semibold text-muted-foreground">Tanlangan</div>
                <div className="font-semibold">
                  {customer ? `${customer.name} (${customer.phone})` : "Bir martalik savdo"}
                </div>
              </div>
            </div>
          </div>

          {/* Cart block */}
          <div className="ali-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Savat</div>
              <Button
                size="sm"
                variant="danger"
                onClick={lines.length ? () => setConfirmClearOpen(true) : undefined}
                disabled={!lines.length}
              >
                Tozalash
              </Button>
            </div>

            <div className="mt-3 rounded-[var(--radius-card)] border border-border/60 bg-background p-2">
              {lines.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">Savat bo'sh.</div>
              ) : (
                <div className="max-h-[46vh] overflow-auto no-scrollbar">
                  {lines.map((l) => (
                    <div
                      key={l.productId}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border/60 bg-card p-3 mb-2 last:mb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{l.name}</div>
                        {/* Narxni qo'lda o'zgartirish: har bir savdoda alohida narx qo'yish mumkin.
                            Foyda serverda kelgan narxdan avtomatik hisoblanadi. */}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Narx:</span>
                          <PriceInput
                            value={l.unitPrice}
                            highlight={l.unitPrice !== l.listPrice}
                            onCommit={(n) => setPrice(l.productId, n)}
                          />
                          {l.unitPrice !== l.listPrice ? (
                            <button
                              className="text-[11px] font-semibold text-muted-foreground underline"
                              onClick={() => setPrice(l.productId, l.listPrice)}
                              title={`Standart narxga qaytarish: ${formatMoney(l.listPrice)}`}
                            >
                              <s>{formatMoney(l.listPrice)}</s> ↺
                            </button>
                          ) : null}
                          {l.unitCost > 0 && l.unitPrice < l.unitCost - 0.001 ? (
                            <span
                              className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive"
                              title={`Tan narx: ${formatMoney(l.unitCost)}. Undan past sotib bo'lmaydi.`}
                            >
                              ⚠ Tan narxdan past!
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                l.unitPrice - l.unitCost > 0 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                              )}
                              title={`Kelgan narx: ${formatMoney(l.unitCost)}. Foyda avtomatik hisoblanadi.`}
                            >
                              {l.unitPrice - l.unitCost >= 0 ? "+" : ""}
                              {formatMoney(round2((l.unitPrice - l.unitCost) * l.qty))}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center rounded-[var(--radius-card)] border border-border/60 bg-muted">
                          <button
                            className="h-9 w-9 rounded-[var(--radius-icon)] text-sm font-bold hover:bg-muted/70"
                            onClick={() => {
                              const step = qtyStep(l.unit);
                              setQty(l.productId, Number((l.qty - step).toFixed(3)));
                            }}
                            title="-"
                          >
                            −
                          </button>
                          <input
                            className="h-9 w-12 bg-transparent text-center text-sm font-semibold outline-none"
                            type="number"
                            step={qtyStep(l.unit)}
                            value={l.qty}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "") return;
                              const n = Number(raw);
                              if (!Number.isFinite(n)) return;
                              setQty(l.productId, n);
}}
                          />
                          <div className="ml-1 min-w-[24px] text-xs font-semibold text-muted-foreground">{l.unit ?? ""}</div>
                          <button
                            className="h-9 w-9 rounded-[var(--radius-icon)] text-sm font-bold hover:bg-muted/70"
                            onClick={() => {
                              const step = qtyStep(l.unit);
                              setQty(l.productId, Number((l.qty + step).toFixed(3)));
                            }}
                            title="+"
                          >
                            +
                          </button>
                        </div>

                        <div className="w-20 text-right text-sm font-bold">
                          {formatMoney(round2(l.unitPrice * l.qty))}
                        </div>

                        <button
                          className="h-9 w-9 rounded-[var(--radius-icon)] border border-border/60 text-muted-foreground hover:bg-muted"
                          onClick={() => remove(l.productId)}
                          title="O'chirish"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Jami</div>
              <div className="text-lg font-extrabold">{formatMoney(total)}</div>
            </div>

            {/* Payment buttons (2-rasm uslubida) */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="rounded-[var(--radius-card)] border border-border/60 bg-card p-3 text-left hover:bg-muted"
                onClick={() => {
                  setPaidAmount(total);
                  setCheckoutOpen(true);
                }}
                title="Naqd"
              >
                <div className="text-sm font-bold">Naqd</div>
                <div className="text-xs text-muted-foreground">Tez to'lov</div>
              </button>
              <button
                className="rounded-[var(--radius-card)] border border-border/60 bg-card p-3 text-left hover:bg-muted"
                onClick={() => {
                  setPaidAmount(total);
                  setCheckoutOpen(true);
                }}
                title="Karta"
              >
                <div className="text-sm font-bold">Karta</div>
                <div className="text-xs text-muted-foreground">Terminal</div>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => nav("/cash-history")}
                disabled={!lines.length}
                className="w-full"
              >
                Qaytarish
              </Button>
              <Button onClick={openCheckout} disabled={!lines.length} className="w-full">
                To'lov
              </Button>
            </div>

            <div className="mt-2 text-xs text-muted-foreground">
              USB/BT skaner: barcode + Enter. Kamera: 📷.
            </div>
          </div>
        </aside>
      </div>

      {/* Customer list modal */}
      <Modal open={customerListOpen} title="Mijozlar" onClose={() => setCustomerListOpen(false)}>
        <div className="space-y-3">
          <Input
            label="Qidiruv"
            placeholder="Ism yoki telefon..."
            value={customerListQuery}
            onChange={(e) => setCustomerListQuery(e.target.value)}
          />

          {customerListLoading ? (
            <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
          ) : (
            <div className="max-h-[50vh] overflow-auto rounded-[var(--radius-card)] border border-border/60">
              {(customerListQuery
                ? customerList.filter((c) =>
                    `${c.name} ${c.phone}`.toLowerCase().includes(customerListQuery.toLowerCase())
                  )
                : customerList
              ).slice(0, 80).map((c) => (
                <button
                  key={c.id}
                  className="flex w-full items-center justify-between gap-3 border-b border-border/40 bg-card px-3 py-2 text-left hover:bg-muted"
                  onClick={() => {
                    setCustomer({ id: c.id, name: c.name, phone: c.phone });
                    setCustomerListOpen(false);
                    setCustomerQuery(c.name);
                  }}
                >
                  <div>
                    <div className="text-sm font-semibold">{c.name || "(Nomsiz)"}</div>
                    <div className="text-xs text-muted-foreground">{c.phone}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">Tanlash</div>
                </button>
              ))}
              {!customerList.length && (
                <div className="p-4 text-sm text-muted-foreground">Mijozlar topilmadi.</div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCustomerListOpen(false)} className="flex-1">
              Yopish
            </Button>
            <Button onClick={() => { setCustomerListOpen(false); setCreateCustomerOpen(true); }} className="flex-1">
              Yangi mijoz
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create customer modal */}
      <Modal open={createCustomerOpen} title="Mijoz qo'shish" onClose={() => setCreateCustomerOpen(false)}>
        <div className="space-y-3">
          <Input label="Ism" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <Input label="Telefon" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={createNewCustomer} className="flex-1">
              Saqlash
            </Button>
            <Button variant="secondary" onClick={() => setCreateCustomerOpen(false)} className="flex-1">
              Bekor
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm clear cart */}
      <Modal
        open={confirmClearOpen}
        title="Savatni tozalash?"
        onClose={() => setConfirmClearOpen(false)}
      >
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Savatdagi barcha mahsulotlar o'chiriladi. Davom etamizmi?
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmClearOpen(false)}
              className="flex-1"
            >
              Bekor
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clear();
                setConfirmClearOpen(false);
              }}
              className="flex-1"
            >
              Tozalash
            </Button>
          </div>
        </div>
      </Modal>

      {/* Checkout modal */}
      <Modal open={checkoutOpen} title="To'lov" onClose={() => setCheckoutOpen(false)}>
        <div className="space-y-3">
          <div className="rounded-[var(--radius-card)] bg-muted p-3">
            <div className="text-xs font-semibold text-muted-foreground">Jami summa</div>
            <div className="text-2xl font-extrabold">{formatMoney(total)}</div>
          </div>

          <Input
            label="To'langan summa (ixtiyoriy, default jami)"
            type="number"
            value={String(paidAmount)}
            onChange={(e) => setPaidAmount(Number(e.target.value))}
          />

          <Input
            label="Izoh (ixtiyoriy) — To\'lov eslatmasi"
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
            placeholder="Masalan: 2 ta chek birga, skidka, qarz yopildi..."
          />

          <div className="grid grid-cols-3 gap-2">
            <Button onClick={() => finalize("cash")}>Naqd</Button>
            <Button onClick={() => finalize("card")} variant="secondary">
              Karta
            </Button>
            <Button
              onClick={() => finalize("cash", { asDebt: true })}
              variant="outline"
              disabled={!customer}
              title={!customer ? "Qarz uchun avval mijoz tanlang" : undefined}
            >
              Qarz
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Agar to'langan summa jami summadan kam bo'lsa, qolgan qismi mijoz qarziga yoziladi (mijoz tanlangan bo'lsa).
          </div>
        </div>
      </Modal>
    </div>
  );
}