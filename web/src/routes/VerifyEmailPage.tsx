import React from "react";
import { sendEmailVerification, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { useToast } from "@/ui/Toast";

export function VerifyEmailPage() {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [checking, setChecking] = React.useState(false);

  const email = auth.currentUser?.email ?? "";

  async function resend() {
    if (!auth.currentUser) return;
    setBusy(true);
    try {
      await sendEmailVerification(auth.currentUser);
      toast.push("Tasdiqlash linki qayta yuborildi ✅", "success");
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      setBusy(false);
    }
  }

  async function checkVerified() {
    if (!auth.currentUser) return;
    setChecking(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        toast.push("Email tasdiqlandi ✅", "success");
        window.location.href = "/";
        return;
      }
      toast.push("Hali tasdiqlanmagan. Emailingizdagi linkni bosing, so'ng yana tekshiring.", "error");
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      setChecking(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await signOut(auth);
      window.location.href = "/login";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-secondary/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="space-y-2">
          <div className="text-xl font-semibold">Emailni tasdiqlang</div>
          <div className="text-sm text-muted-foreground">
            Siz ro‘yxatdan o‘tdingiz. Davom etish uchun emailingizga yuborilgan tasdiqlash linkini bosing.
          </div>
          {email ? (
            <div className="text-sm">
              Email: <span className="font-medium">{email}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button disabled={busy} onClick={resend}>
            {busy ? "..." : "Qayta yuborish"}
          </Button>
          <Button disabled={checking} onClick={checkVerified} variant="secondary">
            {checking ? "..." : "Tasdiqladim"}
          </Button>
          <Button disabled={busy} onClick={logout} variant="ghost">
            Chiqish
          </Button>
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          Eslatma: Ba’zan email 1-2 daqiqada keladi. Spam/Junk papkasini ham tekshiring.
        </div>
      </Card>
    </div>
  );
}
