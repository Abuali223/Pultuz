import React from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Card } from "@/ui/Card";
import { useToast } from "@/ui/Toast";
import { doc, getDoc, setDoc } from "firebase/firestore";

// Firestore'da users/{uid} hujjati bo'lmasa — yangi foydalanuvchi (pending) yaratamiz.
async function ensureUserDoc(uid: string, email: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      { role: "pending", shopId: "", email: email || "", createdAt: Date.now() },
      { merge: true }
    );
    return false; // yangi edi
  }
  return true; // mavjud edi
}

export function LoginPage() {
  const toast = useToast();
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [email, setEmail] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [pass2, setPass2] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Google bilan kirish/ro'yxatdan o'tish
  async function googleSignIn() {
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      // Bazada bor bo'lsa — roliga qarab yo'naltiramiz (HomeRedirect), yangi bo'lsa pending.
      await ensureUserDoc(cred.user.uid, cred.user.email ?? "");
      toast.push("Google bilan kirildi ✅", "success");
      // "/" -> HomeRedirect roliga qarab yo'naltiradi (super admin / admin / cashier / ...)
      window.location.href = "/";
    } catch (e: any) {
      const code = String(e?.code || "");
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // foydalanuvchi oynani yopdi — xato ko'rsatmaymiz
      } else {
        toast.push(e?.message ?? "Google bilan kirishda xatolik", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    const em = email.trim();
    if (!em) {
      toast.push("Avval email kiriting, keyin \"Parolni unutdingizmi?\" bosing", "error");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, em);
      toast.push("Parolni tiklash linki emailingizga yuborildi 📧", "success");
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  async function submit() {
    setBusy(true);
    try {
      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);

        // Email tasdiqlanmagan bo'lsa — verifikatsiya sahifasiga yuboramiz
        if (!cred.user.emailVerified) {
          toast.push("Email tasdiqlanmagan. Emailingizga yuborilgan linkni bosing, so'ng qayta kiring.", "error");
          window.location.href = "/verify-email";
          return;
        }

        toast.push("Kirish muvaffaqiyatli", "success");
        window.location.href = "/";
      } else {
        // register — parol + parolni tasdiqlash
        if (pass.length < 6) {
          toast.push("Parol kamida 6 ta belgidan iborat bo'lsin", "error");
          return;
        }
        if (pass !== pass2) {
          toast.push("Parollar mos emas", "error");
          return;
        }

        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);

        // Emailga tasdiqlash linkini yuboramiz
        await sendEmailVerification(cred.user);

        // yangi foydalanuvchi hujjati (pending)
        await ensureUserDoc(cred.user.uid, email.trim());

        toast.push("Ro‘yxatdan o‘tildi ✅ Emailingizga tasdiqlash linki yuborildi. Emailni tasdiqlab keyin davom eting.", "success");
        window.location.href = "/verify-email";
      }
    } catch (e: any) {
      const code = String(e?.code || "");
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        toast.push("Email yoki parol noto'g'ri. Parolni unutgan bo'lsangiz \"Parolni unutdingizmi?\" yoki Google bilan kiring.", "error");
      } else if (code === "auth/email-already-in-use") {
        toast.push("Bu email allaqachon ro'yxatdan o'tgan. Kirish (Login) bo'limidan foydalaning.", "error");
      } else {
        toast.push(e?.message ?? "Xato", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-secondary/50">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center">
            <img src="/logo.png" alt="Pult Uz" className="h-16 w-16 rounded-2xl object-contain" />
          </div>
          <div className="text-xl font-bold">Pult Uz — ish dasturi</div>
          <div className="text-sm text-muted-foreground">Kirish / Ro'yxatdan o'tish</div>
        </div>
        <Card title={mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}>
          <div className="space-y-3">
            {/* Google bilan kirish — parolsiz, eng oson */}
            <button
              type="button"
              disabled={busy}
              onClick={() => void googleSignIn()}
              className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-btn)] border border-border/60 bg-card px-4 py-3 text-sm font-semibold shadow-sm transition hover:bg-muted disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Google bilan kirish
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-xs text-muted-foreground">yoki email bilan</span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Parol" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
            {mode === "register" && (
              <Input
                label="Parolni tasdiqlash"
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
              />
            )}
            <Button disabled={busy} onClick={submit} className="w-full">
              {busy ? "..." : mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
            </Button>

            {mode === "login" && (
              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline"
                onClick={() => void forgotPassword()}
              >
                Parolni unutdingizmi?
              </button>
            )}

            <button
              className="w-full text-sm text-foreground underline"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Account yo'qmi? Ro'yxatdan o'tish" : "Kirish (Login) ga qaytish"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
