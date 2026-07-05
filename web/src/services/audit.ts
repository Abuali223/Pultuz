import { addDoc } from "firebase/firestore";
import { col } from "./paths";
import type { Role } from "@/types";

export async function logAudit(params: {
  shopId: string;
  actorId: string;
  role: Role;
  actionType: string;
  entityType: string;
  entityId: string;
  meta?: Record<string, any>;
}) {
  const { shopId, actorId, ...rest } = params;
  // FIX #2: shopId va createdBy document ichiga yoziladi.
  // Avval shopId destructure qilinib doc'ga yozilmasdi, createdBy ham yo'q edi.
  // Firestore rules: inMyShop(shopId) va createdBy == request.auth.uid talab qiladi.
  await addDoc(col(shopId, "audit_logs"), {
    ...rest,
    shopId,
    createdBy: actorId,
    timestamp: Date.now(),
  });
}
