import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { listProducts } from "@/services/products";
import { formatMoney } from "@/lib/money";
import type { Product } from "@/types";
import { cn } from "@/lib/cn";

/**
 * GLOBAL QIDIRUV (YouTube uslubida)
 * ---------------------------------
 * Yozishni boshlaganda pastida o'xshash mahsulotlar jonli ravishda chiqadi.
 * Qidiruv maydonlari: nomi, modeli, turi (kategoriya), brendi, izohi, shtrix-kod.
 * Tanlansa — Ombor sahifasi shu qidiruv bilan ochiladi.
 */

// Mahsulotlar keshi: har safar serverdan tortmaslik uchun (tezlik).
let cache: { shopId: string; at: number; items: Product[] } | null = null;
const CACHE_TTL = 60_000; // 1 daqiqa

async function getProductsCached(shopId: string): Promise<Product[]> {
  if (cache && cache.shopId === shopId && Date.now() - cache.at < CACHE_TTL) return cache.items;
  const items = await listProducts(shopId);
  cache = { shopId, at: Date.now(), items };
  return items;
}

function matches(p: Product, s: string): boolean {
  return (
    (p.name || "").toLowerCase().includes(s) ||
    (p.model || "").toLowerCase().includes(s) ||
    (p.brand || "").toLowerCase().includes(s) ||
    (p.category || "").toLowerCase().includes(s) ||
    (p.note || "").toLowerCase().includes(s) ||
    (p.barcode || "").toLowerCase().includes(s)
  );
}

// Nomi mos kelganlar birinchi turadi (YouTube kabi eng yaqin taklif tepada)
function rank(p: Product, s: string): number {
  const name = (p.name || "").toLowerCase();
  if (name.startsWith(s)) return 0;
  if (name.includes(s)) return 1;
  const bm = `${p.brand || ""} ${p.model || ""}`.toLowerCase();
  if (bm.includes(s)) return 2;
  return 3;
}

export function GlobalSearch({ className }: { className?: string }) {
  const nav = useNavigate();
  const { shopId, role } = useAuth();

  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Product[]>([]);
  const [active, setActive] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<number | null>(null);

  const canSearch = !!shopId && !!role && role !== "pending";

  // Tashqariga bosilganda yopish
  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  React.useEffect(() => {
    if (!canSearch) return;
    const s = q.trim().toLowerCase();
    if (!s) {
      setItems([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const all = await getProductsCached(shopId);
        const found = all
          .filter((p) => matches(p, s))
          .sort((a, b) => rank(a, s) - rank(b, s))
          .slice(0, 8);
        setItems(found);
        setActive(0);
        setOpen(true);
      } catch {
        setItems([]);
      }
    }, 150);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, shopId, canSearch]);

  function goSearch(term: string) {
    setOpen(false);
    nav(`/inventory?q=${encodeURIComponent(term)}`);
  }

  function choose(p: Product) {
    setQ(p.name);
    goSearch(p.name);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || items.length === 0) {
      if (e.key === "Enter" && q.trim()) goSearch(q.trim());
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = items[active];
      if (p) choose(p);
      else if (q.trim()) goSearch(q.trim());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!canSearch) return null;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔎</span>
        <input
          className="h-10 w-full rounded-[var(--radius-input)] border border-border/60 bg-card pl-9 pr-3 text-sm outline-none focus:border-accent"
          placeholder="Qidiruv: nom / model / brend / barcode..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (items.length) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-[var(--radius-card)] border border-border/60 bg-card shadow-xl">
          {items.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Mos mahsulot topilmadi.</div>
          ) : (
            items.map((p, i) => (
              <button
                key={p.id}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
                  i === active ? "bg-muted" : "hover:bg-muted/60"
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {[p.brand, p.model, p.category, p.barcode].filter(Boolean).join(" • ")}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold">{formatMoney(Number(p.price) || 0)}</div>
                  <div
                    className={cn(
                      "text-[11px] font-semibold",
                      Number(p.stock ?? 0) <= 0
                        ? "text-destructive"
                        : p.minStock != null && Number(p.stock) <= Number(p.minStock)
                        ? "text-warning"
                        : "text-success"
                    )}
                  >
                    Qoldiq: {Number(p.stock ?? 0)}
                  </div>
                </div>
              </button>
            ))
          )}
          {q.trim() ? (
            <button
              className="w-full border-t border-border/40 px-3 py-2 text-left text-xs font-semibold text-accent-foreground hover:bg-muted/60"
              onClick={() => goSearch(q.trim())}
            >
              Barcha natijalar: “{q.trim()}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
