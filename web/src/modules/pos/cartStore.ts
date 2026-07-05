import { create } from "zustand";

export type CartLine = {
  productId: string;
  name: string;
  barcode: string;
  unitPrice: number;
  /** Katalogdagi standart narx — narx o'zgartirilganda taqqoslash uchun */
  listPrice: number;
  /** Kelgan narx (tan narx) — foyda ko'rsatkichi uchun */
  unitCost: number;
  qty: number;
  unit?: string;
};

type CartState = {
  lines: CartLine[];
  setQty: (productId: string, qty: number) => void;
  /** Savdo paytida narxni qo'lda o'zgartirish (chegirma / ulgurji / tanish mijoz) */
  setPrice: (productId: string, price: number) => void;
  addOrInc: (line: Omit<CartLine, "qty">, qty?: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  // qty <= 0 bo'lsa item savatdan o'chiriladi (minus bosganda 0 ga tushsa o'chib ketsin)
  setQty: (productId, qty) =>
    set((s) => {
      const n = Number(qty);
      if (!Number.isFinite(n) || n <= 0) {
        return { lines: s.lines.filter((l) => l.productId !== productId) };
      }
      return {
        lines: s.lines.map((l) => (l.productId === productId ? { ...l, qty: Number(n.toFixed(3)) } : l)),
      };
    }),
  setPrice: (productId, price) =>
    set((s) => {
      const n = Number(price);
      if (!Number.isFinite(n) || n < 0) return s;
      return {
        lines: s.lines.map((l) => (l.productId === productId ? { ...l, unitPrice: Number(n.toFixed(2)) } : l)),
      };
    }),
  addOrInc: (line, qty = 1) =>
    set((s) => {
      const existing = s.lines.find((l) => l.productId === line.productId);
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.productId === line.productId ? { ...l, qty: l.qty + qty } : l
          ),
        };
      }
      return { lines: [{ ...line, qty }, ...s.lines] };
    }),
  remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
  clear: () => set({ lines: [] }),
}));

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
}
