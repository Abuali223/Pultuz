import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/ui/Button";
import { useAuth } from "@/auth/useAuth";
import {
  getAppLockConfig,
  isAppLocked,
  isBiometricAvailable,
  markAppUnlocked,
  verifyAppLockPin,
  verifyBiometric,
  verifyRecoveryCode,
} from "@/services/appLock";
import { toast } from "sonner";

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid || "";

  const [booted, setBooted] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [recovery, setRecovery] = React.useState("");
  const [showRecovery, setShowRecovery] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [bioAvailable, setBioAvailable] = React.useState(false);

  const cfg = React.useMemo(() => (uid ? getAppLockConfig(uid) : null), [uid, locked, booted]);

  const evaluateLock = React.useCallback(async () => {
    if (!uid) {
      setLocked(false);
      setBooted(true);
      return;
    }
    const c = getAppLockConfig(uid);
    if (!c.enabled) {
      setLocked(false);
      setBooted(true);
      return;
    }
    setLocked(isAppLocked(uid));
    setBooted(true);
  }, [uid]);

  React.useEffect(() => {
    let mounted = true;
    evaluateLock();
    isBiometricAvailable().then((ok) => {
      if (mounted) setBioAvailable(ok);
    });
    return () => {
      mounted = false;
    };
  }, [evaluateLock]);

  // Safari/print/camera holatlarida blur event juda ko'p trigger bo'ladi,
  // shu sabab darhol force lock qilmaymiz. Lock faqat timeout bo'yicha baholanadi.
  React.useEffect(() => {
    if (!uid) return;

    const onVisibility = () => {
      if (!document.hidden) {
        void evaluateLock();
      }
    };

    const onFocus = () => {
      void evaluateLock();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [uid, evaluateLock]);

  async function unlockWithPin() {
    if (!uid) return;
    if (!pin.trim()) {
      toast.error("PIN kiriting");
      return;
    }
    try {
      setBusy(true);
      const ok = await verifyAppLockPin(uid, pin.trim());
      if (!ok) {
        toast.error("PIN noto'g'ri");
        return;
      }
      markAppUnlocked(uid);
      setLocked(false);
      setPin("");
      setRecovery("");
      setShowRecovery(false);
      toast.success("Qulfdan ochildi");
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithBiometric() {
    if (!uid) return;
    try {
      setBusy(true);
      const ok = await verifyBiometric(uid);
      if (!ok) {
        toast.error("Biometrik tasdiqlanmadi");
        return;
      }
      markAppUnlocked(uid);
      setLocked(false);
      setPin("");
      setRecovery("");
      setShowRecovery(false);
      toast.success("Biometrik orqali ochildi");
    } catch (e: any) {
      toast.error(e?.message || "Biometrik xato");
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithRecovery() {
    if (!uid) return;
    if (!recovery.trim()) {
      toast.error("Recovery code kiriting");
      return;
    }
    try {
      setBusy(true);
      const ok = await verifyRecoveryCode(uid, recovery.trim());
      if (!ok) {
        toast.error("Recovery code noto'g'ri");
        return;
      }
      markAppUnlocked(uid);
      setLocked(false);
      setPin("");
      setRecovery("");
      setShowRecovery(false);
      toast.success("Recovery code orqali ochildi");
    } finally {
      setBusy(false);
    }
  }

  if (!booted) return <>{children}</>;
  if (!uid || !cfg?.enabled || !locked) return <>{children}</>;

  const allowPin = cfg.mode === "pin" || cfg.mode === "pin_or_biometric";
  const allowBio = cfg.mode === "biometric" || cfg.mode === "pin_or_biometric";

  return (
    <>
      <div aria-hidden className="pointer-events-none blur-[2px] select-none">
        {children}
      </div>

      <div className="fixed inset-0 z-[110] grid place-items-center bg-primary/40 p-4">
        <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-5 shadow-2xl">
          <div className="mb-3">
            <div className="text-lg font-bold">App Lock</div>
            <div className="text-sm text-muted-foreground">Dastur himoyalangan. Davom etish uchun tasdiqlang.</div>
          </div>

          {allowPin && (
            <div className="space-y-2">
              <label className="text-sm font-medium">PIN</label>
              <input
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2"
                inputMode="numeric"
                autoFocus
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="4-8 xonali PIN"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void unlockWithPin();
                  }
                }}
              />
              <Button className="w-full" onClick={() => void unlockWithPin()} loading={busy}>
                PIN bilan ochish
              </Button>
            </div>
          )}

          {allowBio && bioAvailable && cfg.biometricCredentialId && (
            <div className="mt-3">
              <Button className="w-full" variant="secondary" onClick={() => void unlockWithBiometric()} loading={busy}>
                Biometrik / Face ID
              </Button>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              className="text-sm text-primary underline-offset-2 hover:underline"
              onClick={() => setShowRecovery((v) => !v)}
            >
              Recovery code ishlatish
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await signOut(auth);
              }}
            >
              Hisobdan chiqish
            </button>
          </div>

          {showRecovery && (
            <div className="mt-3 space-y-2 rounded-xl border border-border/50 p-3">
              <div className="text-sm font-medium">Recovery code</div>
              <input
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 uppercase"
                value={recovery}
                onChange={(e) => setRecovery(e.target.value.toUpperCase())}
                placeholder="XXXXX-XXXXX"
              />
              <Button variant="outline" className="w-full" onClick={() => void unlockWithRecovery()} loading={busy}>
                Recovery bilan ochish
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
