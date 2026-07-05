import React from "react";
import { Modal } from "@/ui/Modal";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Card } from "@/ui/Card";
import type { Product } from "@/types";
import { storage, functions, db } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { round2 } from "@/lib/money";
import { generateEAN13 } from "@/lib/ean13";
import { findProductByBarcode } from "@/services/products";

type ExtractedItem = {
  name: string;
  qty: number;
  unit?: string | null;
  unitPrice?: number | null; // in receipt (cost)
  total?: number | null;
  barcode?: string | null;
  confidence?: number | null;
};

type ReceiptMeta = {
  storeName?: string | null;
  date?: string | null;
  currency?: string | null;
};

type ImportRow = {
  id: string;
  item: ExtractedItem;
  action: "link" | "new" | "skip";
  productId?: string;
  // new product fields
  newBarcode: string;
  newName: string;
  newCategory: string;
  newUnit: string;
  newSellPrice: number;
  newMinStock: number;
  // ui search
  search: string;
};

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function jaccard(a: string, b: string) {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}



// --- Helpers: compress image client-side for faster upload / OCR ---
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("FileReader error"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

function fitSize(w: number, h: number, maxSide: number) {
  const max = Math.max(w, h);
  if (max <= maxSide) return { w, h, scale: 1 };
  const scale = maxSide / max;
  return { w: Math.round(w * scale), h: Math.round(h * scale), scale };
}

async function maybeCompressImage(file: File, maxSide = 1600): Promise<{ blob: Blob; contentType: string; note?: string }> {
  // Compress only images and only if big enough to matter
  const isImage = (file.type || "").startsWith("image/");
  if (!isImage) return { blob: file, contentType: file.type || "application/octet-stream" };

  // If already small, keep as-is
  if (file.size <= 900_000) {
    return { blob: file, contentType: file.type || "image/jpeg" };
  }

  const dataUrl = await fileToDataURL(file);
  const img = await loadImage(dataUrl);
  const target = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, maxSide);

  const canvas = document.createElement("canvas");
  canvas.width = target.w;
  canvas.height = target.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: file, contentType: file.type || "image/jpeg" };

  ctx.drawImage(img, 0, 0, target.w, target.h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.86
    );
  });

  return {
    blob,
    contentType: "image/jpeg",
    note: target.scale < 1 ? `Compressed ${Math.round(file.size / 1024)}KB → ${Math.round(blob.size / 1024)}KB` : undefined,
  };
}
export function ReceiptImportModal(props: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  uid: string;
  products: Product[];
  onAddExisting: (p: Product, qty: number, unitCost: number) => void;
  onAddNew: (args: {
    barcode: string;
    name: string;
    category: string;
    unit: string;
    price: number;
    minStock: number;
    qty: number;
    unitCost: number;
  }) => void;
}) {
  const { open, onClose, shopId, uid, products, onAddExisting, onAddNew } = props;

  const [busy, setBusy] = React.useState(false);
  const [step, setStep] = React.useState<"upload" | "review">("upload");
  const [rows, setRows] = React.useState<ImportRow[]>([]);
  const [meta, setMeta] = React.useState<ReceiptMeta>({});
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    if (open) {
      setBusy(false);
      setStep("upload");
      setRows([]);
      setMeta({});
      setError("");
    }
  }, [open]);

  async function genUniqueBarcode(): Promise<string> {
    // Best-effort uniqueness check (few tries). If it fails, still return last candidate.
    let last = generateEAN13("290");
    for (let i = 0; i < 6; i++) {
      const candidate = generateEAN13("290");
      last = candidate;
      const ex = await findProductByBarcode(shopId, candidate);
      if (!ex) return candidate;
    }
    return last;
  }

  function buildAutoRows(items: ExtractedItem[]) {
    const out: ImportRow[] = items.map((it, idx) => {
      const qty = Number(it.qty || 1) || 1;
      const unitCost = Number(it.unitPrice ?? 0) || (Number(it.total ?? 0) && qty ? Number(it.total) / qty : 0);
      const barcode = (it.barcode ?? "").trim();
      // try match
      let matched: Product | null = null;
      if (barcode) {
        matched = products.find((p) => String(p.barcode || "").trim() === barcode) ?? null;
      }
      if (!matched) {
        let best: { p: Product; score: number } | null = null;
        for (const p of products) {
          const sc = jaccard(p.name || "", it.name || "");
          if (!best || sc > best.score) best = { p, score: sc };
        }
        if (best && best.score >= 0.62) matched = best.p;
      }

      const defaultSell = round2(Math.max(0, unitCost)); // safe default (admin can edit)
      return {
        id: `${Date.now()}_${idx}`,
        item: { ...it, qty, unitPrice: unitCost },
        action: matched ? "link" : "new",
        productId: matched ? matched.id : undefined,
        newBarcode: "",
        newName: (it.name || "").trim(),
        newCategory: "",
        newUnit: "dona",
        newSellPrice: defaultSell,
        newMinStock: 0,
        search: matched ? "" : norm(it.name || "").slice(0, 24),
      };
    });
    setRows(out);
  }

  async function onPickFile(file: File) {
    if (!shopId) return;
    setError("");
    setBusy(true);
    try {
      // 1) Create draft doc
      const importDoc = await addDoc(collection(db, "shops", shopId, "receipt_imports"), {
        shopId,
        createdBy: uid,
        createdAt: serverTimestamp(),
        status: "extracting",
        source: { pages: 1 },
      });

      const importId = importDoc.id;
      const storagePath = `shops/${shopId}/receipt_imports/${importId}/page1.jpg`;

      // 2) Upload to Storage
      const r = ref(storage, storagePath);
      const { blob, contentType } = await maybeCompressImage(file);
      await uploadBytes(r, blob, { contentType });

      // 3) Call extractor
      const extract = httpsCallable(functions, "receiptImportExtract");
      const res: any = await extract({ shopId, imagePaths: [storagePath] });

      const items: ExtractedItem[] = Array.isArray(res?.data?.items) ? res.data.items : [];
      const meta0: ReceiptMeta = res?.data?.meta ?? {};

      // 4) Save parsed into Firestore (nice-to-have)
      await updateDoc(doc(db, "shops", shopId, "receipt_imports", importId), {
        status: "ready",
        source: { pages: 1, images: [storagePath] },
        ocr: { engine: "openai-vision", rawText: res?.data?.rawText ?? null },
        parsed: { ...meta0, items },
        updatedAt: serverTimestamp(),
      });

      setMeta(meta0);
      buildAutoRows(items);
      setStep("review");
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || e?.code || String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function ensureNewBarcodes() {
    // Fill missing newBarcode for rows with action new
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      if (next[i].action === "new") {
        if (!next[i].newBarcode) {
          const bc = await genUniqueBarcode();
          next[i].newBarcode = bc;
        }
        if (!next[i].newName) next[i].newName = (next[i].item.name || "").trim();
      }
    }
    setRows(next);
  }

  React.useEffect(() => {
    if (open && step === "review") {
      // generate barcodes for new rows in background (awaited when needed)
      ensureNewBarcodes();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }
  }, [open, step]);

  function filteredProducts(query: string) {
    const q = norm(query);
    if (!q) return products.slice(0, 30);
    const scored = products
      .map((p) => ({ p, score: jaccard(p.name || "", q) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => x.p);
    return scored;
  }

  function updateRow(id: string, patch: Partial<ImportRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function addToDraft() {
    setError("");
    // basic validation
    for (const r of rows) {
      if (r.action === "skip") continue;
      const qty = Number(r.item.qty || 1) || 1;
      const unitCost = Number(r.item.unitPrice || 0) || 0;
      if (qty <= 0) return setError("Miqdor 0 dan katta bo‘lishi kerak");
      if (unitCost < 0) return setError("Kelish narxi xato");
      if (r.action === "link") {
        if (!r.productId) return setError("Ba’zi satrlar uchun tovar tanlanmagan");
      }
      if (r.action === "new") {
        if (!r.newName.trim()) return setError("Yangi tovar nomi bo‘sh");
        if (!r.newBarcode.trim()) return setError("Yangi tovar barcode bo‘sh");
      }
    }

    for (const r of rows) {
      if (r.action === "skip") continue;
      const qty = Number(r.item.qty || 1) || 1;
      const unitCost = round2(Number(r.item.unitPrice || 0) || 0);

      if (r.action === "link") {
        const p = products.find((x) => x.id === r.productId);
        if (p) onAddExisting(p, qty, unitCost);
      } else if (r.action === "new") {
        onAddNew({
          barcode: r.newBarcode.trim(),
          name: r.newName.trim(),
          category: r.newCategory.trim(),
          unit: (r.newUnit || "dona").trim() || "dona",
          price: Number(r.newSellPrice || 0) || 0,
          minStock: Number(r.newMinStock || 0) || 0,
          qty,
          unitCost,
        });
      }
    }

    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Chek rasmidan import (Beta)">
      <div className="space-y-3">
        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        {step === "upload" ? (
          <Card title="1) Chek rasmini tanlang">
            <div className="text-sm text-muted-foreground">
              Chekni tekis, yorug‘ joyda, butun kadrga tushiring. Bu funksiya faqat <b>admin</b> uchun.
            </div>
            <div className="mt-3">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickFile(f);
                }}
              />
            </div>
            {busy ? <div className="mt-3 text-sm">Chek o‘qilmoqda…</div> : null}
          </Card>
        ) : (
          <div className="space-y-3">
            <Card title="2) Tekshiring va moslang">
              <div className="text-sm text-muted-foreground">
                Avval ro‘yxatni tekshiring. Noto‘g‘ri o‘qilgan satrni <b>Skip</b> qiling.
                {meta?.storeName ? <> <span className="text-foreground/80">Do‘kon:</span> {meta.storeName}</> : null}
              </div>
            </Card>

            {rows.length === 0 ? (
              <Card title="Hech narsa topilmadi">
                <div className="text-sm text-muted-foreground">Chekdan tovarlar o‘qilmadi. Rasmni boshqa burchakdan oling.</div>
              </Card>
            ) : null}

            {rows.map((r) => {
              const qty = Number(r.item.qty || 1) || 1;
              const unitCost = Number(r.item.unitPrice || 0) || 0;
              const matches = filteredProducts(r.search || r.item.name || "");
              return (
                <div key={r.id} className="ali-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.item.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {r.item.barcode ? <>Barcode: <span className="text-foreground/80">{r.item.barcode}</span> • </> : null}
                        Qty: <span className="text-foreground/80">{qty}</span> • Cost: <span className="text-foreground/80">{unitCost}</span>
                      </div>
                    </div>
                    <select
                      className="h-9 rounded-[var(--radius-input)] border border-border bg-card px-2 text-sm"
                      value={r.action}
                      onChange={(e) => updateRow(r.id, { action: e.target.value as any })}
                    >
                      <option value="link">Ombordagi</option>
                      <option value="new">Yangi</option>
                      <option value="skip">Skip</option>
                    </select>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Miqdor</div>
                      <Input
                        type="number"
                        value={String(qty)}
                        onChange={(e) => updateRow(r.id, { item: { ...r.item, qty: Number(e.target.value) } })}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Kelish narxi</div>
                      <Input
                        type="number"
                        value={String(unitCost)}
                        onChange={(e) => updateRow(r.id, { item: { ...r.item, unitPrice: Number(e.target.value) } })}
                      />
                    </div>
                  </div>

                  {r.action === "link" ? (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground">Ombordagi tovar (qidirish)</div>
                      <Input value={r.search} onChange={(e) => updateRow(r.id, { search: e.target.value })} placeholder="Masalan: kola 1.5" />
                      <div className="mt-2">
                        <select
                          className="h-10 w-full rounded-[var(--radius-input)] border border-border bg-card px-3 text-sm"
                          value={r.productId || ""}
                          onChange={(e) => updateRow(r.id, { productId: e.target.value })}
                        >
                          <option value="">— Tanlang —</option>
                          {matches.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.barcode ? `• ${p.barcode}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">Tizim faqat taklif qiladi — siz tasdiqlang.</div>
                    </div>
                  ) : null}

                  {r.action === "new" ? (
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Yangi tovar nomi</div>
                        <Input value={r.newName} onChange={(e) => updateRow(r.id, { newName: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground">Barcode (ixtiyoriy)</div>
                          <Input value={r.newBarcode} onChange={(e) => updateRow(r.id, { newBarcode: e.target.value })} />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Sotish narxi</div>
                          <Input type="number" value={String(r.newSellPrice)} onChange={(e) => updateRow(r.id, { newSellPrice: Number(e.target.value) })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground">Kategoriya</div>
                          <Input value={r.newCategory} onChange={(e) => updateRow(r.id, { newCategory: e.target.value })} />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Birlik</div>
                          <Input value={r.newUnit} onChange={(e) => updateRow(r.id, { newUnit: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground">Min stock</div>
                          <Input type="number" value={String(r.newMinStock)} onChange={(e) => updateRow(r.id, { newMinStock: Number(e.target.value) })} />
                        </div>
                        <div className="flex items-end">
                          <Button
                            variant="ghost"
                            className="h-10"
                            onClick={async () => {
                              const bc = await genUniqueBarcode();
                              updateRow(r.id, { newBarcode: bc });
                            }}
                          >
                            Barcode yaratish
                          </Button>
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">Yangi tovar omborga kirim tasdiqlanganda yaratiladi.</div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
              <Button onClick={addToDraft}>Savatga qo‘shish</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
