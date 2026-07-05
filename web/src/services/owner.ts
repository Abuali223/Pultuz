import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  orderBy,
  Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

export type OwnerRequestStatus = "pending" | "approved" | "rejected";

export type OwnerRequest = {
  id: string;
  uid: string;
  email?: string;
  businessName?: string;
  note?: string;
  status: OwnerRequestStatus;
  createdAt?: any;
  updatedAt?: any;
  approvedAt?: any;
  approvedBy?: string;
  shopId?: string;
};

export function submitOwnerRequest(args: {
  uid: string;
  email?: string;
  businessName?: string;
  note?: string;
}) {
  const { uid, email, businessName, note } = args;
  return addDoc(collection(db, "owner_requests"), {
    uid,
    email: email ?? null,
    businessName: businessName ?? null,
    note: note ?? null,
    status: "pending" as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function watchMyOwnerRequests(uid: string, onChange: (rows: OwnerRequest[]) => void): Unsubscribe {
  const qy = query(
    collection(db, "owner_requests"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(qy, (snap) => {
    const rows: OwnerRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    onChange(rows);
  });
}

export function watchAllOwnerRequests(onChange: (rows: OwnerRequest[]) => void): Unsubscribe {
  const qy = query(collection(db, "owner_requests"), orderBy("createdAt", "desc"));
  return onSnapshot(qy, (snap) => {
    const rows: OwnerRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    onChange(rows);
  });
}

export async function approveOwnerRequest(args: {
  requestId: string;
  plan: "month" | "lifetime";
}) {
  const fn = httpsCallable(functions, "approveOwner");
  const res = await fn(args);
  return res.data as any;
}
