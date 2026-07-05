import { useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { useAuth } from "@/auth/useAuth";
import { auth } from "@/lib/firebase";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { getAdminPinHash, setAdminPin } from "@/services/securitySettings";
import { getShopFeatures, setShopFeatures } from "@/services/features";
import { toast } from "sonner";
import { createOwnerRequestSafe } from "@/services/superadmin";
import {
  appLockSummary,
  forceAppLock,
  generateRecoveryCode,
  getAppLockConfig,
  isBiometricAvailable,
  markAppUnlocked,
  registerBiometric,
  saveAppLockConfig,
  setAppLockPin,
  type AppLockMode,
} from "@/services/appLock";
import { APP_VERSION } from "@/version";

export default function ProfilePage() {
  const { user, role, shopId } = useAuth();

  const hasValidShop = !!shopId && String(shopId).length >= 3 && shopId !== "default";
  const canSendOwnerReq = !role || role === "pending" || (role === "cashier" && !hasValidShop);
  const canSendStaffReq = !role || role === "pending" || (role === "cashier" && !hasValidShop);

  // Admin PIN (dangerous actions)
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [hasPin, setHasPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  // Feature flag: receipt import
  const [receiptImportEnabled, setReceiptImportEnabled] = useState<boolean>(false);
  const [savingFeatures, setSavingFeatures] = useState(false);

  // Owner request
  const [ownerName, setOwnerName] = useState("");
  const [sendingOwnerReq, setSendingOwnerReq] = useState(false);

  // App lock states
  const uid = user?.uid || "";
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockMode, setLockMode] = useState<AppLockMode>("pin_or_biometric");
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);
  const [lockPin1, setLockPin1] = useState("");
  const [lockPin2, setLockPin2] = useState("");
  const [savingLock, setSavingLock] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);

  const lockSummary = useMemo(() => {
    if (!uid) return { enabled: false, hasPin: false, hasBiometric: false, mode: "pin_or_biometric" as AppLockMode, autoLockMinutes: 5 };
    return appLockSummary(uid);
  }, [uid, lockEnabled, lockMode, autoLockMinutes, hasBiometric, hasRecovery]);

  useEffect(() => {
    if (!shopId || role !== "admin") return;
    getAdminPinHash(shopId)
      .then((h) => setHasPin(!!h))
      .catch(() => setHasPin(false));

    getShopFeatures(shopId)
      .then((f) => setReceiptImportEnabled(!!f.receiptImportEnabled))
      .catch(() => setReceiptImportEnabled(false));
  }, [shopId, role]);

  useEffect(() => {
    let mounted = true;
    if (!uid) return;

    const cfg = getAppLockConfig(uid);
    if (mounted) {
      setLockEnabled(!!cfg.enabled);
      setLockMode(cfg.mode || "pin_or_biometric");
      setAutoLockMinutes(cfg.autoLockMinutes || 5);
      setHasBiometric(!!cfg.biometricCredentialId);
      setHasRecovery(!!cfg.recoveryHash);
    }

    isBiometricAvailable().then((ok) => {
      if (mounted) setBioSupported(ok);
    });

    return () => {
      mounted = false;
    };
  }, [uid]);

  async function handleLogout() {
    await signOut(auth);
  }

  async function sendOwnerRequest() {
    if (!user) return;
    if (!ownerName.trim()) {
      toast.error("Biznes nomini kiriting");
      return;
    }
    setSendingOwnerReq(true);
    try {
      await createOwnerRequestSafe({ uid: user.uid, email: user.email, name: ownerName.trim() });
      toast.success("So‘rov yuborildi ✅ (SuperAdmin tasdiqlaydi)");
      setOwnerName("");
    } catch (e: any) {
      toast.error(e?.message ?? "So‘rov yuborishda xatolik");
    } finally {
      setSendingOwnerReq(false);
    }
  }

  async function saveDangerPin() {
    if (!shopId) return;
    if (!/^\d{4,8}$/.test(pin1.trim())) {
      toast.error("PIN 4-8 raqam bo'lishi kerak");
      return;
    }
    if (pin1.trim() !== pin2.trim()) {
      toast.error("PINlar mos kelmadi");
      return;
    }
    try {
      setSavingPin(true);
      await setAdminPin(shopId, pin1.trim());
      setHasPin(true);
      setPin1("");
      setPin2("");
      toast.success("Admin PIN saqlandi");
    } catch {
      toast.error("PIN saqlashda xatolik");
    } finally {
      setSavingPin(false);
    }
  }

  async function saveAppLockSettings() {
    if (!uid) return;

    if (lockEnabled) {
      const curr = getAppLockConfig(uid);
      if ((lockMode === "pin" || lockMode === "pin_or_biometric") && !curr.pinHash && !lockPin1) {
        toast.error("Avval App Lock PIN o'rnating");
        return;
      }
      if ((lockMode === "biometric" || lockMode === "pin_or_biometric") && !curr.biometricCredentialId) {
        toast.error("Biometrikni bir marta ulab qo'ying");
        return;
      }
    }

    const min = Math.max(1, Math.min(240, Number(autoLockMinutes) || 5));

    setSavingLock(true);
    try {
      saveAppLockConfig(uid, {
        enabled: !!lockEnabled,
        mode: lockMode,
        autoLockMinutes: min,
      });
      markAppUnlocked(uid);
      toast.success("App Lock sozlamalari saqlandi");
    } finally {
      setSavingLock(false);
    }
  }

  async function saveAppLockPin() {
    if (!uid) return;
    if (!/^\d{4,8}$/.test(lockPin1.trim())) {
      toast.error("App Lock PIN 4-8 raqam bo'lishi kerak");
      return;
    }
    if (lockPin1.trim() !== lockPin2.trim()) {
      toast.error("App Lock PIN mos kelmadi");
      return;
    }

    setSavingLock(true);
    try {
      await setAppLockPin(uid, lockPin1.trim());
      setLockPin1("");
      setLockPin2("");
      setLockEnabled(true);
      setLockMode("pin_or_biometric");
      markAppUnlocked(uid);
      toast.success("App Lock PIN saqlandi");
    } catch (e: any) {
      toast.error(e?.message || "PIN saqlashda xato");
    } finally {
      setSavingLock(false);
    }
  }

  async function connectBiometric() {
    if (!uid) return;
    setSavingLock(true);
    try {
      const ok = await registerBiometric(uid);
      if (!ok) {
        toast.error("Biometrik ulanmadi");
        return;
      }
      setHasBiometric(true);
      setLockEnabled(true);
      setLockMode("pin_or_biometric");
      markAppUnlocked(uid);
      toast.success("Biometrik (Face ID / Touch ID) ulandi");
    } catch (e: any) {
      toast.error(e?.message || "Biometrik xato");
    } finally {
      setSavingLock(false);
    }
  }

  async function createRecovery() {
    if (!uid) return;
    setSavingLock(true);
    try {
      const { code } = await generateRecoveryCode(uid);
      setHasRecovery(true);
      // User uchun faqat bir marta ko'rsatamiz
      window.alert(`Recovery code:\n${code}\n\nUni xavfsiz joyda saqlang.`);
      toast.success("Recovery code yaratildi");
    } catch (e: any) {
      toast.error(e?.message || "Recovery code yaratilmadi");
    } finally {
      setSavingLock(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profil</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">Hisob, do'kon va rol ma'lumotlari</p>
      </div>

      <Card title="Foydalanuvchi">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="hidden sm:block text-xs font-medium text-muted-foreground">Email</div>
            <div className="mt-1 font-semibold text-foreground">{user?.email ?? "—"}</div>
          </div>
          <div>
            <div className="hidden sm:block text-xs font-medium text-muted-foreground">UID</div>
            <div className="mt-1 font-mono text-xs text-foreground break-all">{user?.uid ?? "—"}</div>
          </div>
          <div>
            <div className="hidden sm:block text-xs font-medium text-muted-foreground">Rol</div>
            <div className="mt-1 inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
              {role ?? "—"}
            </div>
          </div>
          <div>
            <div className="hidden sm:block text-xs font-medium text-muted-foreground">Shop ID</div>
            <div className="mt-1 font-semibold text-foreground">{shopId ?? "—"}</div>
          </div>
          <div>
            <div className="hidden sm:block text-xs font-medium text-muted-foreground">Versiya</div>
            <div className="mt-1 font-mono text-xs text-foreground">{APP_VERSION}</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(user?.uid ?? "")}>UID nusxa olish</Button>
          <Button variant="danger" onClick={() => void handleLogout()}>Chiqish</Button>
        </div>
      </Card>

      <Card title="App Lock (PIN / Biometrik)">
        <p className="text-sm text-muted-foreground">
          Dastur yopilib qayta ochilganda qo‘shimcha himoya. Kompyuterda PIN, telefon/iPad’da PIN + Face ID/Touch ID ishlaydi.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="rounded-xl border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Holat</div>
            <select
              className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={lockEnabled ? "on" : "off"}
              onChange={(e) => setLockEnabled(e.target.value === "on")}
            >
              <option value="off">O‘chirilgan</option>
              <option value="on">Yoqilgan</option>
            </select>
          </label>

          <label className="rounded-xl border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Usul</div>
            <select
              className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={lockMode}
              onChange={(e) => setLockMode(e.target.value as AppLockMode)}
            >
              <option value="pin">Faqat PIN</option>
              <option value="biometric" disabled={!bioSupported}>Faqat Biometrik</option>
              <option value="pin_or_biometric">PIN yoki Biometrik</option>
            </select>
          </label>

          <label className="rounded-xl border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Auto-lock (daqiqada)</div>
            <input
              className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              type="number"
              min={1}
              max={240}
              value={autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(Number(e.target.value || 5))}
            />
          </label>

          <div className="rounded-xl border border-border/60 p-3 text-sm">
            <div className="text-xs text-muted-foreground">Holat</div>
            <div className="mt-1">
              {lockSummary.enabled ? "✅ Yoqilgan" : "⛔ O‘chirilgan"}
              <br />PIN: {lockSummary.hasPin ? "✅" : "⛔"}
              <br />Biometrik: {lockSummary.hasBiometric ? "✅" : "⛔"}
              <br />Recovery: {hasRecovery ? "✅" : "⛔"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 p-3">
            <div className="text-sm font-medium">App Lock PIN</div>
            <div className="mt-2 grid gap-2">
              <input
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                inputMode="numeric"
                maxLength={8}
                placeholder="Yangi PIN (4-8)"
                value={lockPin1}
                onChange={(e) => setLockPin1(e.target.value.replace(/\D/g, ""))}
              />
              <input
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                inputMode="numeric"
                maxLength={8}
                placeholder="Takrorlang"
                value={lockPin2}
                onChange={(e) => setLockPin2(e.target.value.replace(/\D/g, ""))}
              />
              <Button variant="outline" onClick={() => void saveAppLockPin()} loading={savingLock}>PIN saqlash</Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-3">
            <div className="text-sm font-medium">Biometrik & Recovery</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!bioSupported || savingLock}
                onClick={() => void connectBiometric()}
              >
                {bioSupported ? "Biometrik ulash" : "Bu qurilmada yo‘q"}
              </Button>
              <Button variant="outline" disabled={savingLock} onClick={() => void createRecovery()}>
                Recovery code yaratish
              </Button>
              <Button
                variant="secondary"
                disabled={savingLock}
                onClick={() => {
                  if (!uid) return;
                  forceAppLock(uid);
                  toast.success("App lock test rejimi: qayta ochilganda qulf so‘raydi");
                }}
              >
                Qulfni test qilish
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void saveAppLockSettings()} loading={savingLock}>App Lock sozlamalarini saqlash</Button>
        </div>
      </Card>

      {canSendOwnerReq && (
        <Card title="Biznes egasi bo‘lish">
          <p className="text-sm text-muted-foreground">
            Agar siz yangi shop (biznes) ochmoqchi bo‘lsangiz, shu yerdan so‘rov yuboring. SuperAdmin tasdiqlaydi va sizga <b>admin</b> rol beradi.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Biznes / Shop nomi</div>
              <input
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                placeholder="Masalan: Han Market"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => void sendOwnerRequest()} disabled={sendingOwnerReq}>
                {sendingOwnerReq ? "Yuborilmoqda..." : "So‘rov yuborish"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {canSendStaffReq && (
        <Card title="Hodim ulanishi">
          <p className="text-sm text-muted-foreground">
            Agar siz hodim bo‘lsangiz, do‘kon egasidan <b>Shop ID</b> olib shu yerdan so‘rov yuboring.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => (window.location.href = "/staff-join")}>Shop ID kiritish</Button>
          </div>
        </Card>
      )}

      {role === "admin" && shopId && (
        <Card title="Admin PIN sozlamalari">
          <p className="text-sm text-muted-foreground">
            Ombordan o'chirish / bekor qilish kabi xavfli amallar uchun PIN so'raladi. PIN Firestore'da <b>hash</b> ko'rinishida saqlanadi.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Yangi PIN (4-8 raqam)</label>
              <input
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2"
                inputMode="numeric"
                maxLength={8}
                value={pin1}
                onChange={(e) => setPin1(e.target.value.replace(/\D/g, ""))}
                placeholder="****"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Takrorlang</label>
              <input
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2"
                inputMode="numeric"
                maxLength={8}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                placeholder="****"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={savingPin} onClick={() => void saveDangerPin()}>
              PIN saqlash
            </Button>
            <span className="text-sm text-muted-foreground">
              Hozirgi holat: {hasPin ? "PIN o'rnatilgan" : "PIN o'rnatilmagan"}
            </span>
          </div>
        </Card>
      )}

      {role === "admin" && (
        <Card title="Chek import (Kirim)">
          <div className="text-sm text-muted-foreground">
            Chek rasmidan tovar ro‘yxatini o‘qib, Kirim savatiga qo‘shish funksiyasi (faqat admin).
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="text-sm">
              Holat:{" "}
              <b className={receiptImportEnabled ? "text-success" : "text-destructive"}>
                {receiptImportEnabled ? "Yoqilgan" : "O‘chirilgan"}
              </b>
            </div>
            <Button
              variant="outline"
              disabled={savingFeatures || !shopId}
              onClick={async () => {
                try {
                  if (!shopId) return;
                  setSavingFeatures(true);
                  const next = !receiptImportEnabled;
                  await setShopFeatures(shopId, { receiptImportEnabled: next });
                  setReceiptImportEnabled(next);
                  toast.success(next ? "Chek import yoqildi" : "Chek import o‘chirildi");
                } catch (e: any) {
                  toast.error(e?.message || "Xato");
                } finally {
                  setSavingFeatures(false);
                }
              }}
            >
              {receiptImportEnabled ? "O‘chirish" : "Yoqish"}
            </Button>
          </div>
        </Card>
      )}

      <Card title="Maslahat">
        <p className="text-sm text-muted-foreground">
          App Lock PIN + biometriya qurilmaga bog‘liq ishlaydi. Kompyuterda PIN eng barqaror variant.
        </p>
      </Card>
    </div>
  );
}
