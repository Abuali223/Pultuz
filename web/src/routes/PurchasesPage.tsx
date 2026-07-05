import React from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { useToast } from "@/ui/Toast";
import { CameraScannerModal } from "@/ui/CameraScannerModal";
import { useAuth } from "@/auth/AuthProvider";
import { findProductByBarcode } from "@/services/products";
import { listSuppliers } from "@/services/suppliers";
import { createPurchase, listPurchases } from "@/services/purchases";
import type { PaymentType, Product, Supplier, Purchase } from "@/types";
import { formatMoney, round2 } from "@/lib/money";
import { generateEAN13 } from "@/lib/ean13";
import { ReceiptImportModal } from "@/modules/receiptImport/ReceiptImportModal";
import { listProducts } from "@/services/products";
import { enqueueOfflineJob, shouldQueueByError } from "@/services/offlineQueue";
import { getShopFeatures } from "@/services/features";

type DraftItem = {
  productId: string;
  name: string;
  barcode: string;
  qty: number;
  unitCost: number;
  newProduct?: NewProductForm;
};

const UNIT_OPTIONS = ["dona", "kg", "litr", "metr", "sm", "quti", "paket", "set"];

type NewProductForm = {
  barcode: string;
  name: string;
  category: string;
  /** Pult modeli (masalan: Artel smart, Yasin 007) */
  model: string;
  /** Brend (masalan: Artel, Yasin, Samsung) */
  brand: string;
  /** Izoh — qo'shimcha ma'lumot */
  note: string;
  unit: string;
  price: number;
  minStock: number;
  cutLengthCm?: number;
  cutWidthCm?: number;
};

export function PurchasesPage() {
  const toast = useToast();
  const { shopId, user, role } = useAuth();

  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [history, setHistory] = React.useState<Purchase[]>([]);

  const [barcode, setBarcode] = React.useState("");
  const [qty, setQty] = React.useState(1);
  const [unitCost, setUnitCost] = React.useState(0);

  const [draft, setDraft] = React.useState<DraftItem[]>([]);
  const [supplierId, setSupplierId] = React.useState<string>("");
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [paidAmount, setPaidAmount] = React.useState(0);
  const [paymentType, setPaymentType] = React.useState<PaymentType>("cash");

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [scanOpen, setScanOpen] = React.useState(false);
  const [camMode, setCamMode] = React.useState<"single" | "multi">("single");

  // Chek rasmidan import (Beta)
  const [importOpen, setImportOpen] = React.useState(false);
  const [receiptImportEnabled, setReceiptImportEnabled] = React.useState<boolean>(false);
  const [productsAll, setProductsAll] = React.useState<Product[]>([]);

  const holdTimerRef = React.useRef<number | null>(null);
  const holdTriggeredRef = React.useRef(false);

  const [newOpen, setNewOpen] = React.useState(false);
  const [newForm, setNewForm] = React.useState<NewProductForm>({
    barcode: "",
    name: "",
    category: "",
    model: "",
    brand: "",
    note: "",
    unit: "dona",
    price: 0,
    minStock: 0,
    cutLengthCm: 0,
    cutWidthCm: 0,
  });

  const total = round2(draft.reduce((a, d) => a + round2(d.qty * d.unitCost), 0));
  const due = round2(total - Math.min(total, Math.max(0, Number(paidAmount || 0))));

  async function refresh() {
    const ss = await listSuppliers(shopId);
    setSuppliers(ss);
    const h = await listPurchases(shopId, 50);
    setHistory(h);
  }

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  React.useEffect(() => {
    if (!shopId) return;
    let mounted = true;
    (async () => {
      try {
        const [features, allProducts] = await Promise.all([
          getShopFeatures(shopId),
          listProducts(shopId),
        ]);
        if (!mounted) return;
        setReceiptImportEnabled(!!features.receiptImportEnabled);
        setProductsAll(allProducts);
      } catch {
        if (!mounted) return;
        setReceiptImportEnabled(false);
        setProductsAll([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [shopId]);

  function addToDraft(
    p: { id: string; name: string; barcode: string; avgCost?: number },
    addQty: number,
    cost: number,
    newProduct?: NewProductForm
  ) {
    const item: DraftItem = {
      productId: p.id,
      name: p.name,
      barcode: p.barcode,
      qty: Number(addQty || 1),
      unitCost: round2(Number(cost || p.avgCost || 0)),
      ...(newProduct ? { newProduct } : {}),
    };

    setDraft((prev) => {
      const idx = prev.findIndex((x) => x.productId === item.productId);
      if (idx >= 0) {
        const cp = [...prev];
        cp[idx] = { ...cp[idx], qty: cp[idx].qty + item.qty, unitCost: item.unitCost };
        return cp;
      }
      return [item, ...prev];
    });
  }

  async function addByBarcode(overrideBarcode?: string) {
    try {
      const bc = (overrideBarcode ?? barcode).trim();
      if (!bc) return;
      if (!user) return;

      const p = await findProductByBarcode(shopId, bc);

      if (!p) {
        // yangi tovar yaratish (faqat Kirim oynasidan)
        setNewForm((s) => ({ ...s, barcode: bc }));
        setNewOpen(true);
        return;
      }

      addToDraft(p, Number(qty || 1), Number(unitCost || 0));
      setBarcode("");
      setQty(1);
      setUnitCost(0);
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }


async function generateIntoBarcodeField() {
  try {
    let bc = "";
    for (let i = 0; i < 8; i++) {
      const candidate = generateEAN13("290");
      const ex = await findProductByBarcode(shopId, candidate);
      if (!ex) {
        bc = candidate;
        break;
      }
    }
    if (!bc) return toast.push("Barcode generatsiya qilinmadi", "error");
    setBarcode(bc);
    toast.push("Ichki barcode yaratildi", "success");
  } catch (e: any) {
    toast.push(e?.message ?? "Xato", "error");
  }
}

  function updateLine(productId: string, patch: Partial<DraftItem>) {
    setDraft((prev) => prev.map((x) => (x.productId === productId ? { ...x, ...patch } : x)));
  }

  function removeLine(productId: string) {
    setDraft((prev) => prev.filter((x) => x.productId !== productId));
  }

  async function createNewAndAdd() {
    if (!user) return;
    try {
      let bc = (newForm.barcode || "").trim();
      const nm = (newForm.name || "").trim();
      if (!bc) {
  // barkodsiz tovar uchun ichki EAN-13 yaratamiz (290-prefiks, standard checksum bilan)
  for (let i = 0; i < 8; i++) {
    const candidate = generateEAN13("290");
    const ex = await findProductByBarcode(shopId, candidate);
    if (!ex) {
      bc = candidate;
      break;
    }
  }
  if (!bc) return toast.push("Barcode generatsiya qilinmadi", "error");
}
      if (!nm) return toast.push("Tovar nomi shart", "error");
      if (Number(newForm.price || 0) <= 0) return toast.push("Sotish narxi shart", "error");

      const unitRaw = (newForm.unit || "dona").trim() || "dona";
      if (unitRaw === "sm") {
        const L = Number(newForm.cutLengthCm ?? 0);
        const W = Number(newForm.cutWidthCm ?? 0);
        if (!Number.isFinite(L) || !Number.isFinite(W) || L <= 0 || W <= 0) {
          return toast.push("sm birlikda: Bo\'yi va Eni (sm) majburiy", "error");
        }
      }


      // duplicate check
      const exists = await findProductByBarcode(shopId, bc);
      if (exists) {
        toast.push("Bu barcode allaqachon mavjud", "error");
        return;
      }

      // IMPORTANT:
      // New product should ONLY be added to the purchase cart. It will be created in Firestore
      // only when the user presses "Saqlash" (purchase finalization).
      addToDraft(
        { id: `NEW:${bc}`, name: nm, barcode: bc, avgCost: 0 },
        Number(qty || 1),
        Number(unitCost || 0),
        {
          barcode: bc,
          name: nm,
          category: (newForm.category || "").trim(),
          model: (newForm.model || "").trim(),
          brand: (newForm.brand || "").trim(),
          note: (newForm.note || "").trim(),
          unit: (newForm.unit || "dona").trim() || "dona",
           price: Number(newForm.price || 0),
          minStock: Number(newForm.minStock || 0) || 0,
          cutLengthCm: Number(newForm.cutLengthCm ?? 0) || 0,
          cutWidthCm: Number(newForm.cutWidthCm ?? 0) || 0,
        }
      );

      toast.push("Yangi tovar savatga qo'shildi. Omborga faqat \"Saqlash\" bosilganda kiradi.", "success");
      setNewOpen(false);
      setNewForm({ barcode: "", name: "", category: "", model: "", brand: "", note: "", unit: "dona", price: 0, minStock: 0, cutLengthCm: 0, cutWidthCm: 0 });

      setBarcode("");
      setQty(1);
      setUnitCost(0);
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  async function submit() {
    if (!user) return;

    if (draft.length === 0) {
      toast.push("Kirim savati bo'sh", "error");
      return;
    }

    const s = supplierId ? suppliers.find((x) => x.id === supplierId) : null;
    const payload = {
      shopId,
      actorId: user.uid,
      supplier: s ? { id: s.id, name: s.name } : null,
      invoiceNo: invoiceNo.trim() || undefined,
      note: note.trim() || undefined,
      items: draft.map((d) => ({
        productId: d.productId,
        qty: Number(d.qty),
        unitCost: Number(d.unitCost),
        newProduct: d.newProduct,
      })),
      paidAmount: Number(paidAmount || 0),
      paymentType: Number(paidAmount || 0) > 0 ? paymentType : null,
    };

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueueOfflineJob({ type: "purchase.create", payload, shopId, userId: user.uid });
        toast.push("Internet yo'q — kirim offline navbatga qo'shildi", "warning");
        setDraft([]);
        setSupplierId("");
        setInvoiceNo("");
        setNote("");
        setPaidAmount(0);
        setPaymentType("cash");
        return;
      }

      await createPurchase(payload as any);

      toast.push("Kirim saqlandi. Ombor avtomatik yangilandi.", "success");
      setDraft([]);
      setSupplierId("");
      setInvoiceNo("");
      setNote("");
      setPaidAmount(0);
      setPaymentType("cash");
      refresh();
    } catch (e: any) {
      if (shouldQueueByError(e)) {
        enqueueOfflineJob({ type: "purchase.create", payload, shopId, userId: user.uid });
        toast.push("Aloqa uzildi — kirim navbatga qo'shildi", "warning");
        setDraft([]);
        setSupplierId("");
        setInvoiceNo("");
        setNote("");
        setPaidAmount(0);
        setPaymentType("cash");
        return;
      }
      toast.push(e?.message ?? "Xato", "error");
    }
  }


  // Access control: Kirim faqat admin
  if (role !== "admin") {
    return (
      <div className="space-y-4">
        <Card title="Kirim (tovar kelishi)">
          <div className="text-sm text-foreground">
            Bu bo'lim faqat <b>admin</b> uchun. Kirim orqali yangi tovarlar yaratiladi va omborga avtomatik qo'shiladi.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Kirim (tovar kelishi)">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="ali-card p-4">
            <div className="font-medium">Barcode orqali qo'shish</div>
            <div className="mt-3 space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Barcode skan qiling va Enter"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addByBarcode();
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  className="h-10"
                  title="Kameradan barcode o‘qish"
                  onPointerDown={() => {
                    holdTriggeredRef.current = false;
                    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
                    holdTimerRef.current = window.setTimeout(() => {
                      holdTriggeredRef.current = true;
                      setCamMode("multi");
                      setScanOpen(true);
                    }, 700);
                  }}
                  onPointerUp={() => {
                    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
                    if (!holdTriggeredRef.current) {
                      setCamMode("single");
                      setScanOpen(true);
                    }
                  }}
                  onPointerLeave={() => {
                    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
                  }}
                >
                  📷
                </Button>

                {role === "admin" && receiptImportEnabled ? (
                  <Button
                    variant="outline"
                    className="h-10"
                    title="Chek rasmidan import (Beta)"
                    onClick={() => setImportOpen(true)}
                  >
                    🧾
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="hidden sm:block text-xs text-muted-foreground">Miqdor</div>
                  <Input type="number" value={String(qty)} onChange={(e) => setQty(Number(e.target.value))} />
                </div>
                <div>
                  <div className="hidden sm:block text-xs text-muted-foreground">Kelish narxi</div>
                  <Input type="number" value={String(unitCost)} onChange={(e) => setUnitCost(Number(e.target.value))} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
  <Button onClick={() => void addByBarcode()}>Savatga qo'shish</Button>
  <Button variant="secondary" onClick={() => void generateIntoBarcodeField()}>Barcode yaratish</Button>
  <Button variant="secondary" onClick={() => { setNewForm({ barcode, name: "", category: "", model: "", brand: "", note: "", unit: "dona", price: 0, minStock: 0 }); setNewOpen(true); }}>
    Yangi tovar
  </Button>
  <Button variant="ghost" onClick={() => setDraft([])}>Tozalash</Button>
</div>

            </div>
          </div>

          <div className="ali-card p-4 lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">Kirim savati</div>
                <div className="hidden sm:block text-xs text-muted-foreground">Jami: <b>{formatMoney(total)}</b> • Qarz: <b className="text-destructive">{formatMoney(due)}</b></div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setPreviewOpen(true)}>Ko'rish</Button>
                <Button onClick={submit}>Saqlash</Button>
              </div>
            </div>

            {draft.length === 0 ? (
              <div className="mt-4 text-sm text-muted-foreground">Hozircha savat bo'sh.</div>
            ) : (
              <div className="mt-4">
                
              <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
          {draft.map((d) => (
                  <div
                    key={d.productId}
                    className="rounded-[var(--radius-card)] border border-border/40 bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold leading-tight">{d.name}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Barcode: {d.barcode || "—"}
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeLine(d.productId)}
                        title="O'chirish"
                        className="shrink-0"
                      >
                        O'chirish
                      </Button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Miqdor</div>
                        <Input
                          value={d.qty}
                          onChange={(e) =>
                            updateLine(d.productId, { qty: Number(e.target.value || 0) })
                          }
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                        />
                      </div>

                      <div>
                        <div className="text-[11px] text-muted-foreground">Kelish narxi</div>
                        <Input
                          value={d.unitCost}
                          onChange={(e) =>
                            updateLine(d.productId, { unitCost: Number(e.target.value || 0) })
                          }
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                        />
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">Jami</div>
                      <div className="font-semibold">{formatMoney(round2(d.qty * d.unitCost))}</div>
                    </div>
                  </div>
                ))}
              </div>


                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <div className="hidden sm:block text-xs text-muted-foreground">Ta'minotchi (ixtiyoriy)</div>
                    <select
                      className="h-11 w-full rounded-[var(--radius-input)] border border-border bg-card px-3 text-sm focus:ring-2 focus:ring-accent/30 outline-none"
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                    >
                      <option value="">Bir martalik / noma'lum</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="hidden sm:block text-xs text-muted-foreground">Invoice / Chek raqami (ixtiyoriy)</div>
                    <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                  </div>

                  <div>
                    <div className="hidden sm:block text-xs text-muted-foreground">Izoh (ixtiyoriy)</div>
                    <Input value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>

                  <div>
                    <div className="hidden sm:block text-xs text-muted-foreground">Hozir to'landi</div>
                    <Input type="number" value={String(paidAmount)} onChange={(e) => setPaidAmount(Number(e.target.value))} />
                    <div className="hidden sm:block text-xs text-muted-foreground mt-1">0 bo'lsa — nasiya (qarz) bo'ladi.</div>
                  </div>

                  <div>
                    <div className="hidden sm:block text-xs text-muted-foreground">To'lov turi</div>
                    <select
                      className="h-11 w-full rounded-[var(--radius-input)] border border-border bg-card px-3 text-sm focus:ring-2 focus:ring-accent/30 outline-none"
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                      disabled={Number(paidAmount || 0) <= 0}
                    >
                      <option value="cash">Naqd</option>
                      <option value="card">Karta</option>
                    </select>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Kirim tarixi (so'nggi 50)">
        {history.length === 0 ? (
          <div className="text-sm text-muted-foreground">Hozircha kirim yo'q.</div>
        ) : (
          
        <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
          {history.map((p) => (
            <div
              key={p.id}
              className="rounded-[var(--radius-card)] border border-border/40 bg-card p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold leading-tight">
                    {p.supplierNameSnapshot || "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(p.createdAt).toLocaleString()} · {p.purchaseNo}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Jami</div>
                  <div className="text-base font-semibold">{formatMoney(p.total)}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-[var(--radius-input)] border border-border/40 bg-background/40 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">To'landi</div>
                    <div className="text-sm font-medium">{formatMoney(p.paidAmount)}</div>
                </div>

                <div className="rounded-[var(--radius-input)] border border-border/40 bg-background/40 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">Qarz</div>
                  <div className="text-sm font-medium text-destructive">
                    {formatMoney(p.dueAmount)}
                  </div>
                </div>

                <div className="rounded-[var(--radius-input)] border border-border/40 bg-background/40 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">Tovarlar</div>
                  <div className="text-sm font-medium">{p.items?.length ?? 0}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        )}
      </Card>

      <Modal open={previewOpen} title="Kirim savati" onClose={() => setPreviewOpen(false)}>
        <div className="space-y-3">
          <div className="text-sm">Jami: <b>{formatMoney(total)}</b></div>
          <div className="text-sm">Hozir to'landi: <b>{formatMoney(paidAmount)}</b></div>
          <div className="text-sm">Qarz: <b className="text-destructive">{formatMoney(due)}</b></div>
          <div className="hidden sm:block text-xs text-muted-foreground">
            paidAmount 0 bo'lsa — to'liq qarz, qisman bo'lsa — qisman qarz.
          </div>
        </div>
      </Modal>

      <CameraScannerModal
        open={scanOpen}
        title="Barcode skan (Kirim)"
        description="Barcode o'qilishi bilan maydon avtomatik to'ldiriladi. Enter bosish shart emas."
        mode={camMode}
        onClose={() => setScanOpen(false)}
        onDetected={(bc, _q) => {
          setBarcode(bc);
          if (camMode === "single") setScanOpen(false);
          // darhol qo'shib yuborish uchun:
          void addByBarcode(bc);
        }}
      />
      <ReceiptImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        shopId={shopId}
        uid={user?.uid || ""}
        products={productsAll}
        onAddExisting={(p, q, c) => addToDraft({ id: p.id, name: p.name, barcode: p.barcode, avgCost: p.avgCost }, q, c)}
        onAddNew={(args) =>
          addToDraft(
            { id: `NEW:${args.barcode}`, name: args.name, barcode: args.barcode, avgCost: 0 },
            args.qty,
            args.unitCost,
            {
              barcode: args.barcode,
              name: args.name,
              category: args.category,
              model: "",
              brand: "",
              note: "",
              unit: args.unit,
              price: Number(args.price || 0),
              minStock: Number(args.minStock || 0),
              cutLengthCm: 0,
              cutWidthCm: 0,
            }
          )
        }
      />


      <Modal
        open={newOpen}
        title="Yangi tovar (Kirim orqali)"
        onClose={() => setNewOpen(false)}
      >
        <div className="space-y-3">
          <div className="rounded-[var(--radius-card)] border border-border/40 bg-secondary/15 p-3 text-xs text-foreground">
            Eslatma: Yangi tovarlar faqat shu oynadan yaratiladi. Keyin omborga avtomatik qo'shiladi.
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Barcode (unique)"
                value={newForm.barcode}
                onChange={(e) => setNewForm((s) => ({ ...s, barcode: e.target.value }))}
              />
            </div>
            <Button
              variant="ghost"
              className="h-10"
              title="Barcode generatsiya qilish"
              onClick={() => setNewForm((s) => ({ ...s, barcode: generateEAN13() }))}
            >
              🎲
            </Button>
          </div>

          <Input
            label="Tovar nomi"
            value={newForm.name}
            onChange={(e) => setNewForm((s) => ({ ...s, name: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Brend (masalan: Artel, Yasin)"
              value={newForm.brand}
              onChange={(e) => setNewForm((s) => ({ ...s, brand: e.target.value }))}
            />
            <Input
              label="Pult modeli (masalan: Yasin 007)"
              value={newForm.model}
              onChange={(e) => setNewForm((s) => ({ ...s, model: e.target.value }))}
            />
          </div>

          <Input
            label="Izoh (ixtiyoriy)"
            value={newForm.note}
            onChange={(e) => setNewForm((s) => ({ ...s, note: e.target.value }))}
            placeholder="Masalan: universal pult, 2 ta batareya bilan"
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Mahsulot turi (masalan: smart, oddiy, universal)"
              value={newForm.category}
              onChange={(e) => setNewForm((s) => ({ ...s, category: e.target.value }))}
            />
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Birlik</div>
              <select
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                value={newForm.unit}
                onChange={(e) => setNewForm((s) => ({ ...s, unit: e.target.value }))}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
{((newForm.unit || "").trim() === "sm") ? (
  <>
    <Input
      label="Bo'yi (sm) (masalan 244)"
      type="number"
      value={String(newForm.cutLengthCm ?? 0)}
      onChange={(e) => setNewForm((s) => ({ ...s, cutLengthCm: Number(e.target.value) }))}
    />
    <Input
      label="Eni (sm) (masalan 122)"
      type="number"
      value={String(newForm.cutWidthCm ?? 0)}
      onChange={(e) => setNewForm((s) => ({ ...s, cutWidthCm: Number(e.target.value) }))}
    />
  </>
) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Sotish narxi (majburiy)"
              type="number"
              value={String(newForm.price)}
              onChange={(e) => setNewForm((s) => ({ ...s, price: Number(e.target.value) }))}
            />
            <Input
              label="Min qoldiq (alert)"
              type="number"
              value={String(newForm.minStock)}
              onChange={(e) => setNewForm((s) => ({ ...s, minStock: Number(e.target.value) }))}
            />
          </div>

          <div className="rounded-xl border border-border/40 bg-card p-3 text-sm">
            Kirim: <b>{qty}</b> dona • Kelish narxi: <b>{formatMoney(unitCost || 0)}</b>
          </div>

          <div className="flex gap-2">
            <Button onClick={createNewAndAdd}>Yaratish va savatga qo'shish</Button>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Bekor</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}