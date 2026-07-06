// Super admin — bitta joyda aniqlanadi (butun app shu yerdan foydalanadi).
// Eski loyihadagi UID (moslik uchun) YOKI tasdiqlangan email.
// email_verified talab qilinadi — server rules ham shuni majburlaydi.
import type { User } from "firebase/auth";

export const SUPER_ADMIN_UID = "M8WKl0BlBnPanTU6Hh60SumTpQu1";
export const SUPER_ADMIN_EMAIL = "hasanboyqobulov7@gmail.com";

export function isSuperAdminUser(user: Pick<User, "uid" | "email" | "emailVerified"> | null | undefined): boolean {
  if (!user) return false;
  if (user.uid === SUPER_ADMIN_UID) return true;
  const email = String(user.email || "").toLowerCase();
  return email === SUPER_ADMIN_EMAIL && user.emailVerified === true;
}
