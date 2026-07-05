import React from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAppStore } from "@/state/appStore";
import type { Role } from "@/types";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  role: Role | null;
  shopId: string;
};

const Ctx = React.createContext<AuthCtx>({ user: null, loading: true, role: null, shopId: "" });

export function useAuth() {
  return React.useContext(Ctx);
}

const AUTH_BOOT_TIMEOUT_MS = 8000;
const USER_DOC_TIMEOUT_MS = 7000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const shopId = useAppStore((s) => s.shopId);
  const setRole = useAppStore((s) => s.setRole);
  const role = useAppStore((s) => s.role);

  React.useEffect(() => {
    let active = true;

    // Safari/private mode/network holatlarida auth init cho'zilib ketmasin
    const bootTimer = window.setTimeout(() => {
      if (!active) return;
      setLoading(false);
    }, AUTH_BOOT_TIMEOUT_MS);

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!active) return;
      setUser(u);

      if (!u) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        // fetch role & shopId from users/{uid}
        const userRef = doc(db, "users", u.uid);
        const ud = await withTimeout(getDoc(userRef), USER_DOC_TIMEOUT_MS);

        // Agar eski user doc bo'lmasa ham, minimal doc yaratib qo'yamiz.
        if (!ud.exists()) {
          try {
            await setDoc(
              userRef,
              {
                role: "pending",
                shopId: "",
                email: u.email ?? "",
                createdAt: Date.now(),
              },
              { merge: true }
            );
          } catch {
            // rules bloklab qo'ysa ham, UI baribir ishlaydi (role null bo'ladi)
          }
        }

        const data = ud.exists() ? ud.data() : null;
        const r = (data?.role as Role | undefined) ?? null;
        const sId = (data?.shopId as string | undefined) ?? "";

        // user doc bo'yicha shopId ni store ga har doim sync qilamiz (hatto bo'sh bo'lsa ham)
        if (sId !== shopId) {
          useAppStore.getState().setShopId(sId);
        }

        if (active) {
          setRole(r);
          setLoading(false);
        }
      } catch (e) {
        // Network/firestore timeout bo'lsa ham app oq ekran yoki endless loading bo'lib qolmasin
        console.warn("Auth bootstrap fallback", e);
        if (active) {
          setRole(null);
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      clearTimeout(bootTimer);
      unsub();
    };
  }, [shopId, setRole]);

  return <Ctx.Provider value={{ user, loading, role, shopId }}>{children}</Ctx.Provider>;
}
