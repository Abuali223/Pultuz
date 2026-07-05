import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export type ShopFeatures = {
  receiptImportEnabled?: boolean;
};

function featuresRef(shopId: string) {
  return doc(db, "shops", shopId, "settings", "features");
}

export async function getShopFeatures(shopId: string): Promise<ShopFeatures> {
  if (!shopId) return { receiptImportEnabled: false };
  const snap = await getDoc(featuresRef(shopId));
  if (!snap.exists()) {
    // Default: OFF
    return { receiptImportEnabled: false };
  }
  const d: any = snap.data();
  return {
    receiptImportEnabled: typeof d.receiptImportEnabled === "boolean" ? d.receiptImportEnabled : false,
  };
}

export async function setShopFeatures(shopId: string, patch: ShopFeatures): Promise<void> {
  if (!shopId) throw new Error("shopId required");
  await setDoc(featuresRef(shopId), { ...patch, updatedAt: Date.now() }, { merge: true });
}
