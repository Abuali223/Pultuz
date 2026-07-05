import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

export type StaffRequestStatus = "pending" | "approved" | "rejected";

export type StaffRequest = {
  id: string;
  uid: string;
  email?: string;
  shopId: string;
  note?: string;
  status: StaffRequestStatus;
  createdAt?: any;
  updatedAt?: any;
  approvedAt?: any;
  approvedBy?: string;
};

function sortNewestFirst(rows: StaffRequest[]) {
  rows.sort((a: any, b: any) => {
    const av = a?.createdAt?.seconds
      ? a.createdAt.seconds
      : typeof a?.createdAt === "number"
        ? a.createdAt / 1000
        : 0;
    const bv = b?.createdAt?.seconds
      ? b.createdAt.seconds
      : typeof b?.createdAt === "number"
        ? b.createdAt / 1000
        : 0;
    return bv - av;
  });
  return rows;
}

export async function submitStaffRequest(params: { uid: string; email?: string; shopId: string; note?: string }) {
  await addDoc(collection(db, "staff_requests"), {
    uid: params.uid,
    email: params.email || "",
    shopId: params.shopId,
    note: params.note || "",
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * SuperAdmin uchun: barcha PENDING hodim so‘rovlarini ko‘rish
 * (orderBy ishlatmaymiz — index kerak bo‘lib qolmasin, sortni client qilamiz)
 */
export function watchPendingStaffRequests(onChange: (rows: StaffRequest[]) => void): Unsubscribe {
  const qy = query(collection(db, "staff_requests"), where("status", "==", "pending"));
  return onSnapshot(qy, (snap) => {
    const rows: StaffRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    onChange(sortNewestFirst(rows));
  });
}

/**
 * Hodim o‘zi yuborgan so‘rovlarini ko‘radi
 */
export function watchMyStaffRequests(uid: string, onChange: (rows: StaffRequest[]) => void): Unsubscribe {
  const qy = query(collection(db, "staff_requests"), where("uid", "==", uid));
  return onSnapshot(qy, (snap) => {
    const rows: StaffRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    onChange(sortNewestFirst(rows));
  });
}

/**
 * Admin o‘z shopidagi so‘rovlarni ko‘radi
 */
export function watchShopStaffRequests(shopId: string, onChange: (rows: StaffRequest[]) => void): Unsubscribe {
  const qy = query(collection(db, "staff_requests"), where("shopId", "==", shopId));
  return onSnapshot(qy, (snap) => {
    const rows: StaffRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    onChange(sortNewestFirst(rows));
  });
}

/** Hodim rollari: sotuvchi / omborchi / faqat ko'ruvchi */
export type StaffRole = "cashier" | "warehouse" | "viewer";

export const STAFF_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  cashier: "Sotuvchi",
  warehouse: "Omborchi",
  viewer: "Faqat ko'ruvchi",
  accountant: "Faqat ko'ruvchi (hisobchi)",
  pending: "Kutilmoqda",
};

export async function approveStaffRequest(requestId: string, role: StaffRole = "cashier") {
  const fn = httpsCallable(functions, "approveStaff");
  const res = await fn({ requestId, role });
  return res.data as any;
}

/** Admin: mavjud hodimning rolini o'zgartirish */
export async function setStaffRole(staffUid: string, role: StaffRole) {
  const fn = httpsCallable(functions, "setStaffRole");
  const res = await fn({ staffUid, role });
  return res.data as any;
}

export async function listUsersInShop(shopId: string) {
  const snap = await getDocs(query(collection(db, "users"), where("shopId", "==", shopId)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}
