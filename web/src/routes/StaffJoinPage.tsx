import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Input } from "@/ui/Input";
import { submitStaffRequest } from "@/services/staff";
import { toast } from "sonner";

export function StaffJoinPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [targetShopId, setTargetShopId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function send() {
    if (!user) return;
    const shopId = targetShopId.trim();
    if (shopId.length < 4) {
      toast.error("Shop ID noto‘g‘ri (kamida 4 ta belgi)");
      return;
    }
    try {
      setBusy(true);
      await submitStaffRequest({
        shopId,
        uid: user.uid,
        email: user.email ?? undefined,
        note: note.trim() || undefined,
      });
      toast.success("So‘rov yuborildi. Admin tasdiqlagach kirish ochiladi.");
      nav("/profile");
    } catch (e: any) {
      toast.error(e?.message ?? "So‘rov yuborishda xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hodim bo‘lib ulanish</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Do‘kon egasidan <b>Shop ID</b> olib kiriting va so‘rov yuboring.
        </p>
      </div>

      <Card title="Shop ID kiriting">
        <div className="space-y-3">
          <Input
            label="Shop ID"
            placeholder="Masalan: han-001"
            value={targetShopId}
            onChange={(e) => setTargetShopId(e.target.value)}
          />
          <Input
            label="Izoh (ixtiyoriy)"
            placeholder="Sotuvchi: Ali, telefon: ..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={send}>
              {busy ? "..." : "So‘rov yuborish"}
            </Button>
            <Button variant="secondary" onClick={() => nav("/profile")}>Bekor qilish</Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Eslatma: Admin tasdiqlagandan keyin sizning hisobingiz avtomatik o‘sha Shop’ga ulanadi.
          </div>
        </div>
      </Card>
    </div>
  );
}
