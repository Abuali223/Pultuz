import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function shopRoot(shopId: string) {
  return doc(db, "shops", shopId);
}

export function col(shopId: string, name: string) {
  return collection(db, "shops", shopId, name);
}
