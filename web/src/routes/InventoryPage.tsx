import React from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { ProductThumb } from "@/ui/ProductThumb";
import { useToast } from "@/ui/Toast";
import { CameraScannerModal } from "@/ui/CameraScannerModal";
import { useAuth } from "@/auth/AuthProvider";

function fmtStock(p: any) {
  const unit = String(p.unit ?? "dona").trim().toLowerCase();
  // Cutting sheet mode: stock = sheet-count, remainder stored in cutRemainderCm
  if (unit === "sm" && Number(p.cutWidthCm ?? 0) > 0) {
    const sheets = Number(p.stock ?? 0);
    const rem = Number(p.cutRemainderCm ?? 0);
    if (rem > 0) return `${sheets} ta + ${rem} sm`;
    return `${sheets} ta`;
  }
  return String(p.stock ?? 0);
}

import { listProducts } from "@/services/products";
import type { Product } from "@/types";
import { formatMoney } from "@/lib/money";

export function InventoryPage() {
  const toast = useToast();
  const { shopId } = useAuth();
  const [searchParams] = useSearchParams();

  const [items, setItems] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Global qidiruvdan kelganda ?q= parametri bilan ochiladi
  const [q, setQ] = React.useState(searchParams.get("q") ?? "");
  const [scanOpen, setScanOpen] = React.useState(false);

  React.useEffect(() => {
    const nq = searchParams.get("q");
    if (nq !== null) setQ(nq);
  }, [searchParams]);

  async function refresh() {
    setLoading(true);
    try {
      const list = await listProducts(shopId);
      setItems(list);
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((p) => {
      return (
        (p.name || "").toLowerCase().includes(s) ||
        (p.barcode || "").toLowerCase().includes(s) ||
        (p.category || "").toLowerCase().includes(s) ||
        (p.model || "").toLowerCase().includes(s) ||
        (p.brand || "").toLowerCase().includes(s) ||
        (p.note || "").toLowerCase().includes(s)
      );
    });
  }, [items, q]);

  return (
    <div className="space-y-4">
      <Card
        title="Omborxona"
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={refresh} title="Yangilash">
              Yangilash
            </Button>
            <Button variant="ghost" onClick={() => setScanOpen(true)} title="Kameradan barcode bilan qidirish">
              📷 Qidirish
            </Button>
          </div>
        }
      >
        <div className="mb-3">
          <Input
            placeholder="Qidirish: barcode / nom"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="hidden sm:block mt-1 text-xs text-muted-foreground">
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">Mos mahsulot topilmadi.</div>
        ) : (
          
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="rounded-[var(--radius-card)] border border-border/40 bg-card p-3 h-full"
              >
                <div className="flex items-center gap-3">
                  <ProductThumb
                    name={p.name ?? "?"}
                    category={p.category}
                    variant="circle"
                    className="h-12 w-12 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground/80">Barcode:</span>{" "}
                        {p.barcode || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground/80">Turi:</span>{" "}
                        {p.category ?? "—"}
                      </div>
                      {(p.brand || p.model) ? (
                        <div>
                          <span className="font-medium text-foreground/80">Brend/Model:</span>{" "}
                          {[p.brand, p.model].filter(Boolean).join(" • ")}
                        </div>
                      ) : null}
                      {p.note ? (
                        <div className="truncate" title={p.note}>
                          <span className="font-medium text-foreground/80">Izoh:</span> {p.note}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Qoldiq</div>
                    <div
                      className={`text-lg font-semibold ${
                        p.minStock && p.stock <= p.minStock ? "text-destructive" : ""
                      }`}
                    >
                      {fmtStock(p)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-[var(--radius-input)] border border-border/40 bg-background/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Kelish</div>
                    <div className="text-sm font-medium">{formatMoney(p.avgCost)}</div>
                  </div>
                  <div className="rounded-[var(--radius-input)] border border-border/40 bg-background/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Sotuv</div>
                    <div className="text-sm font-medium">{formatMoney(p.price)}</div>
                  </div>
                  <div className="rounded-[var(--radius-input)] border border-border/40 bg-background/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Min</div>
                    <div className="text-sm font-medium">{p.minStock ?? "-"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

        )}
      </Card>

      <CameraScannerModal
        open={scanOpen}
        title="Barcode skan (qidirish)"
        description="Barcode o'qilishi bilan qidiruv maydoni avtomatik to'ldiriladi."
        mode="single"
        onClose={() => setScanOpen(false)}
        onDetected={(barcode, _qty) => {
          setQ(barcode);
          setScanOpen(false);
        }}
      />
    </div>
  );
}