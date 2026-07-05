import { create } from "zustand";
import type { Role } from "@/types";

type AppState = {
  shopId: string;
  role: Role | null;
  setShopId: (shopId: string) => void;
  setRole: (role: Role | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  shopId: import.meta.env.VITE_DEFAULT_SHOP_ID || "default",
  role: null,
  setShopId: (shopId) => set({ shopId }),
  setRole: (role) => set({ role }),
}));
