import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { hashAdminPin } from "@/lib/security";

function securityDocRef(shopId: string) {
  return doc(db, "shops", shopId, "settings", "security");
}

export async function getAdminPinHash(shopId: string): Promise<string | null> {
  const snap = await getDoc(securityDocRef(shopId));
  if (!snap.exists()) return null;
  const d: any = snap.data();
  return typeof d.adminPinHash === "string" ? d.adminPinHash : null;
}

export async function setAdminPin(shopId: string, pin: string): Promise<void> {
  const adminPinHash = await hashAdminPin({ shopId, pin });
  await setDoc(securityDocRef(shopId), { adminPinHash }, { merge: true });
}

export async function verifyAdminPin(shopId: string, pin: string): Promise<boolean> {
  const current = await getAdminPinHash(shopId);
  if (!current) return false;
  const h = await hashAdminPin({ shopId, pin });
  return h === current;
}
