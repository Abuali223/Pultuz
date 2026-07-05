import React from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Card } from "@/ui/Card";
import { useToast } from "@/ui/Toast";
import { doc, setDoc } from "firebase/firestore";

export function LoginPage() {
  const toast = useToast();
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [email, setEmail] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [pass2, setPass2] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(auth, email, pass);

        // Email tasdiqlanmagan bo'lsa — verifikatsiya sahifasiga yuboramiz
        if (!cred.user.emailVerified) {
          toast.push("Email tasdiqlanmagan. Emailingizga yuborilgan linkni bosing, so'ng qayta kiring.", "error");
          window.location.href = "/verify-email";
          return;
        }

        toast.push("Kirish muvaffaqiyatli", "success");
        window.location.href = "/";
      } else {
        // register
        if (pass !== pass2) {
          toast.push("Parollar mos emas", "error");
          return;
        }

        const cred = await createUserWithEmailAndPassword(auth, email, pass);

        // Emailga tasdiqlash linkini yuboramiz
        await sendEmailVerification(cred.user);

        // create minimal user doc (role/shpidni keyin qo'lda berasiz)
        await setDoc(
          doc(db, "users", cred.user.uid),
          {
            role: "pending",
            shopId: "",
            email,
            createdAt: Date.now(),
          },
          { merge: true }
        );

        toast.push("Ro‘yxatdan o‘tildi ✅ Emailingizga tasdiqlash linki yuborildi. Emailni tasdiqlab keyin davom eting.", "success");
        window.location.href = "/verify-email";
      }
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
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
            <button
              className="w-full text-sm text-foreground underline"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Account yo'qmi? Register" : "Login ga qaytish"}
            </button>
          </div>
        </Card>
        <div className="hidden sm:block text-xs text-muted-foreground">
          Eslatma: Role va shopId Firestore'da <code>users/uid</code> hujjatida turadi.
        </div>
      </div>
    </div>
  );
}
