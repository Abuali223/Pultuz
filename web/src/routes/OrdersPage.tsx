import React from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { useToast } from "@/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { CameraScannerModal } from "@/ui/CameraScannerModal";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { listProducts } from "@/services/products";
import type { Order, OrderItem, OrderSource, OrderStatus, Product } from "@/types";
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  createOrder,
  listOrders,
  setOrderStatus,
  summarizeOrders,
} from "@/services/orders";

const STATUS_ORDER: OrderStatus[] = ["new", "preparing", "delivered", "cancelled"];

function statusTone(st: OrderStatus) {
  switch (st) {
    case "new":
      return "bg-accent/15 text-accent-foreground";
    case "preparing":
      return "bg-warning/15 text-warning";
    case "delivered":
      return "bg-success/10 text-success";
    case "cancelled":
      return "bg-destructive/10 text-destructive";
  }
}

type DraftItem = { name: string; qty: number; price: number };

export function OrdersPage() {
  const toast = useToast();
  const { user, shopId, role } = useAuth();

  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | OrderStatus>("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // "Faqat ko'ruvchi" buyurtma yarata olmaydi / holat o'zgartira olmaydi
  const canEdit = role === "admin" || role === "cashier" || role === "warehouse";

  // yangi buyurtma formasi
  const [createOpen, setCreateOpen] = React.useState(false);
  const [source, setSource] = React.useState<OrderSource>("offline");
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [note, setNote] = React.useState("");
  const [draftItems, setDraftItems] = React.useState<DraftItem[]>([{ name: "", qty: 1, price: 0 }]);
  const [saving, setSaving] = React.useState(false);

  // Mahsulotlar (barcode -> nom/narx avtomatik) va kamera skaner
  const [products, setProducts] = React.useState<Product[]>([]);
  const [barcodeInput, setBarcodeInput] = React.useState("");
  const [scanOpen, setScanOpen] = React.useState(false);
  const barcodeRef = React.useRef<HTMLInputElement>(null);

  // Oyna ochilganda barcode maydoniga fokus — USB/BT skaner darhol ishlashi uchun
  React.useEffect(() => {
    if (createOpen) {
      const t = setTimeout(() => barcodeRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [createOpen]);

  async function refresh() {
    setLoading(true);
    try {
      setOrders(await listOrders(shopId));
    } catch (e: any) {
      toast.push(e?.message ?? "Buyurtmalar yuklanmadi", "error");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!shopId) return;
    refresh();
    // Mahsulotlarni yuklaymiz — barcode/nom bo'yicha avtomatik to'ldirish uchun
    listProducts(shopId)
      .then(setProducts)
      .catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // Barcode -> mahsulotni topib, buyurtma qatoriga nom+narx bilan qo'shadi (yoki sonini oshiradi)
  function addByBarcode(codeRaw: string) {
    const code = String(codeRaw || "").trim();
    if (!code) return;
    const p = products.find((x) => String(x.barcode || "").trim() === code);
    if (!p) {
      toast.push("Bu barcode bo'yicha mahsulot topilmadi", "error");
      return;
    }
    setDraftItems((arr) => {
      // shu mahsulot allaqachon qatorlarda bo'lsa — sonini oshiramiz
      const idx = arr.findIndex((it) => it.name === p.name);
      if (idx >= 0) {
        return arr.map((it, j) => (j === idx ? { ...it, qty: Number(it.qty || 0) + 1 } : it));
      }
      // bo'sh birinchi qatorga joylashtiramiz, aks holda yangi qator qo'shamiz
      const emptyIdx = arr.findIndex((it) => !it.name.trim());
      const row = { name: p.name, qty: 1, price: Number(p.price || 0) };
      if (emptyIdx >= 0) return arr.map((it, j) => (j === emptyIdx ? row : it));
      return [...arr, row];
    });
    setBarcodeInput("");
    toast.push(`${p.name} qo'shildi`, "success");
  }

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  // Joriy oy hisobot
  const monthStart = React.useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);
  const monthly = React.useMemo(
    () => summarizeOrders(orders.filter((o) => Number(o.createdAt || 0) >= monthStart)),
    [orders, monthStart]
  );

  async function submitOrder() {
    if (!user) return;
    const name = customerName.trim();
    if (!name) return toast.push("Xaridor ismi shart", "error");
    const items = draftItems
      .map((it) => ({ name: it.name.trim(), qty: Number(it.qty) || 0, price: Number(it.price) || 0 }))
      .filter((it) => it.name && it.qty > 0);
    if (items.length === 0) return toast.push("Kamida bitta mahsulot kiriting", "error");

    setSaving(true);
    try {
      await createOrder({
        shopId,
        actorId: user.uid,
        source,
        customerName: name,
        customerPhone,
        address,
        items: items as OrderItem[],
        note,
      });
      toast.push("Buyurtma qo'shildi", "success");
      setCreateOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setAddress("");
      setNote("");
      setSource("offline");
      setDraftItems([{ name: "", qty: 1, price: 0 }]);
      await refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(o: Order, st: OrderStatus) {
    if (!user) return;
    setBusyId(o.id);
    try {
      await setOrderStatus({ shopId, orderId: o.id, actorId: user.uid, status: st, current: o });
      toast.push(`Holat: ${ORDER_STATUS_LABELS[st]}`, "success");
      await refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Oylik hisobot */}
      <Card title="Joriy oy — buyurtma hisobot">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-[var(--radius-card)] border border-border/40 bg-background/40 p-3">
            <div className="text-[11px] text-muted-foreground">Jami</div>
            <div className="text-lg font-bold">{monthly.count}</div>
          </div>
          {STATUS_ORDER.map((st) => (
            <div key={st} className="rounded-[var(--radius-card)] border border-border/40 bg-background/40 p-3">
              <div className="text-[11px] text-muted-foreground">{ORDER_STATUS_LABELS[st]}</div>
              <div className="text-lg font-bold">{monthly.byStatus[st].count}</div>
              <div className="text-[11px] text-muted-foreground">{formatMoney(monthly.byStatus[st].total)}</div>
            </div>
          ))}
          <div className="rounded-[var(--radius-card)] border border-border/40 bg-background/40 p-3">
            <div className="text-[11px] text-muted-foreground">Online / Offline</div>
            <div className="text-lg font-bold">
              {monthly.online} / {monthly.offline}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Buyurtmalar"
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={refresh}>
              Yangilash
            </Button>
            {canEdit ? <Button onClick={() => setCreateOpen(true)}>+ Yangi buyurtma</Button> : null}
          </div>
        }
      >
        {/* Holat filtrlari */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["all", ...STATUS_ORDER] as Array<"all" | OrderStatus>).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "h-9 rounded-[var(--radius-btn)] border px-3 text-sm font-medium transition",
                filter === f
                  ? "border-transparent bg-accent text-accent-foreground"
                  : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              {f === "all" ? "Barchasi" : ORDER_STATUS_LABELS[f]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">Buyurtma topilmadi.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((o) => (
              <div key={o.id} className="rounded-[var(--radius-card)] border border-border/40 bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{o.orderNo}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", statusTone(o.status))}>
                        {ORDER_STATUS_LABELS[o.status] ?? o.status}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {ORDER_SOURCE_LABELS[o.source] ?? o.source}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {o.customerName}
                      {o.customerPhone ? <span className="text-muted-foreground"> • {o.customerPhone}</span> : null}
                    </div>
                    {o.address ? <div className="text-xs text-muted-foreground">Manzil: {o.address}</div> : null}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(Number(o.createdAt || 0)).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Jami</div>
                    <div className="text-lg font-extrabold">{formatMoney(Number(o.total || 0))}</div>
                  </div>
                </div>

                {/* Mahsulotlar */}
                <div className="mt-2 rounded-[var(--radius-card)] border border-border/40 bg-background/40 p-2 text-sm">
                  {(o.items || []).map((it, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                      <span className="truncate">{it.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {it.qty} x {formatMoney(Number(it.price || 0))}
                      </span>
                    </div>
                  ))}
                  {o.note ? <div className="mt-1 text-xs text-muted-foreground">Izoh: {o.note}</div> : null}
                </div>

                {/* Holat o'zgartirish */}
                {canEdit && o.status !== "delivered" && o.status !== "cancelled" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {o.status === "new" ? (
                      <Button size="sm" variant="secondary" disabled={busyId === o.id} onClick={() => changeStatus(o, "preparing")}>
                        Tayyorlanmoqda
                      </Button>
                    ) : null}
                    <Button size="sm" disabled={busyId === o.id} onClick={() => changeStatus(o, "delivered")}>
                      Yetkazildi
                    </Button>
                    <Button size="sm" variant="danger" disabled={busyId === o.id} onClick={() => changeStatus(o, "cancelled")}>
                      Bekor qilish
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Yangi buyurtma modali */}
      <Modal open={createOpen} title="Yangi buyurtma" onClose={() => setCreateOpen(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              className={cn(
                "rounded-[var(--radius-card)] border p-3 text-left",
                source === "offline" ? "border-transparent bg-accent text-accent-foreground" : "border-border/60 bg-card hover:bg-muted"
              )}
              onClick={() => setSource("offline")}
            >
              <div className="text-sm font-bold">Offline</div>
              <div className="text-xs opacity-70">Do'konda / telefon orqali</div>
            </button>
            <button
              className={cn(
                "rounded-[var(--radius-card)] border p-3 text-left",
                source === "online" ? "border-transparent bg-accent text-accent-foreground" : "border-border/60 bg-card hover:bg-muted"
              )}
              onClick={() => setSource("online")}
            >
              <div className="text-sm font-bold">Online</div>
              <div className="text-xs opacity-70">Telegram / sayt orqali</div>
            </button>
          </div>

          <Input label="Xaridor ismi" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <Input label="Telefon (ixtiyoriy)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          <Input label="Manzil (ixtiyoriy)" value={address} onChange={(e) => setAddress(e.target.value)} />

          {/* Barcode bilan tez qo'shish: o'qitilganda nom va narx avtomatik chiqadi */}
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              Barcode bilan qo'shish (nom avtomatik chiqadi)
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={barcodeRef}
                className="h-10 flex-1 rounded-[var(--radius-input)] border border-border/60 bg-background px-2 text-sm"
                placeholder="🔎 Barcode kiriting yoki skaner o'qiting + Enter"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addByBarcode(barcodeInput);
                  }
                }}
              />
              <Button variant="secondary" onClick={() => addByBarcode(barcodeInput)}>
                Qo'shish
              </Button>
              <Button variant="secondary" title="Kamera bilan skan" onClick={() => setScanOpen(true)}>
                📷
              </Button>
            </div>
          </div>

          {/* Barcha mahsulot nomlari — nom yozganda avtomatik taklif chiqadi */}
          <datalist id="orders-product-names">
            {products.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>

          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Mahsulotlar</div>
            <div className="space-y-2">
              {draftItems.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="h-10 flex-1 rounded-[var(--radius-input)] border border-border/60 bg-background px-2 text-sm"
                    placeholder="Mahsulot nomi"
                    list="orders-product-names"
                    value={it.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      // Nom katalogdagi mahsulotga to'liq mos kelsa — narxni avtomatik qo'yamiz
                      const match = products.find((p) => p.name === name);
                      setDraftItems((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, name, price: match ? Number(match.price || 0) : x.price } : x
                        )
                      );
                    }}
                  />
                  <input
                    className="h-10 w-16 rounded-[var(--radius-input)] border border-border/60 bg-background px-2 text-center text-sm"
                    type="number"
                    min={1}
                    title="Soni"
                    value={it.qty}
                    onChange={(e) =>
                      setDraftItems((arr) => arr.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))
                    }
                  />
                  <input
                    className="h-10 w-24 rounded-[var(--radius-input)] border border-border/60 bg-background px-2 text-right text-sm"
                    type="number"
                    min={0}
                    title="Narx"
                    value={it.price}
                    onChange={(e) =>
                      setDraftItems((arr) => arr.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))
                    }
                  />
                  <button
                    className="h-10 w-10 rounded-[var(--radius-icon)] border border-border/60 text-muted-foreground hover:bg-muted"
                    onClick={() => setDraftItems((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== i) : arr))}
                    title="O'chirish"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => setDraftItems((arr) => [...arr, { name: "", qty: 1, price: 0 }])}
            >
              + Qator qo'shish
            </Button>
          </div>

          <Input label="Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />

          <div className="flex gap-2">
            <Button onClick={submitOrder} disabled={saving} className="flex-1">
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} className="flex-1">
              Bekor
            </Button>
          </div>
        </div>
      </Modal>

      {/* Kamera barcode skaneri — o'qilgan barcode buyurtmaga nom bilan qo'shiladi */}
      <CameraScannerModal
        open={scanOpen}
        title="Barcode skaner"
        description="Mahsulot barcode'ini o'qiting — nomi avtomatik qo'shiladi."
        mode="single"
        onClose={() => setScanOpen(false)}
        onDetected={(code) => {
          setScanOpen(false);
          addByBarcode(code);
        }}
      />
    </div>
  );
}
