import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, Unsubscribe, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

export type OwnerRequestStatus = "pending" | "approved" | "rejected";

export type OwnerRequest = {
  id: string;
  uid: string;
  email?: string;
  name: string; // business/shop name
  status: OwnerRequestStatus;
  createdAt?: any;
  approvedAt?: any;
  approvedBy?: string;
  shopId?: string;
};

export function createOwnerRequest(name: string) {
  return addDoc(collection(db, "owner_requests"), {
    uid: (functions.app.options as any)?.auth?.currentUser?.uid, // fallback (won't exist) - UI should pass uid
    name,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

// Better: UI should pass uid/email to avoid relying on internal
export async function createOwnerRequestSafe(params: { uid: string; email?: string | null; name: string }) {
  const { uid, email, name } = params;
  return addDoc(collection(db, "owner_requests"), {
    uid,
    email: email ?? "",
    name,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function watchOwnerRequests(setter: (rows: OwnerRequest[]) => void): Unsubscribe {
  const q = query(collection(db, "owner_requests"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    setter(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
  });
}

export async function listShops() {
  const snap = await getDocs(query(collection(db, "shops"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function createShop(params: { name: string; ownerUid?: string; ownerEmail?: string }) {
  const fn = httpsCallable(functions, "createShop");
  const res = await fn(params);
  return res.data as any;
}

export async function approveOwnerRequest(params: { requestId: string; shopId?: string }) {
  const fn = httpsCallable(functions, "approveOwnerRequest");
  const res = await fn(params);
  return res.data as any;
}

export async function setSubscription(params: { shopId: string; type: "monthly" | "lifetime"; months?: number }) {
  const fn = httpsCallable(functions, "setSubscription");
  const res = await fn(params);
  return res.data as any;
}

export async function connectShopBot(params: { shopId: string; botToken: string }) {
  const fn = httpsCallable(functions, "connectShopBot");
  const res = await fn(params as any);
  return res.data as any;
}
