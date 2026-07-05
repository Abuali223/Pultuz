import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Input } from "@/ui/Input";
import { toast } from "sonner";
import { submitOwnerRequest, watchMyOwnerRequests, type OwnerRequest } from "@/services/owner";
import { submitStaffRequest, type StaffRequest, watchMyStaffRequests } from "@/services/staff";

// Hodim/Owner onboarding – professional SaaS flow
export default function OnboardingPage() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [businessName, setBusinessName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [shopId, setShopId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [myOwnerReqs, setMyOwnerReqs] = React.useState<OwnerRequest[]>([]);
  const [myStaffReqs, setMyStaffReqs] = React.useState<StaffRequest[]>([]);

  React.useEffect(() => {
    if (!user) return;
    const u1 = watchMyOwnerRequests(user.uid, setMyOwnerReqs);
    const u2 = watchMyStaffRequests(user.uid, setMyStaffReqs);
    return () => {
      u1();
      u2();
    };
  }, [user]);

  const lastOwner = myOwnerReqs[0];
  const lastStaff = myStaffReqs[0];

  async function sendOwner() {
    if (!user) return;
    try {
      setBusy(true);
      await submitOwnerRequest({
        uid: user.uid,
        email: user.email ?? undefined,
        businessName: businessName.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success("Biznes egasi so‘rovi yuborildi. Tasdiqdan keyin admin bo‘lib kirasiz.");
      nav("/pending-approval");
    } catch (e: any) {
      toast.error(e?.message ?? "So‘rov yuborishda xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function sendStaff() {
    if (!user) return;
    const id = shopId.trim();
    if (id.length < 4) {
      toast.error("Shop ID noto‘g‘ri");
      return;
    }
    try {
      setBusy(true);
      await submitStaffRequest({
        shopId: id,
        uid: user.uid,
        email: user.email ?? undefined,
        note: note.trim() || undefined,
      });
      toast.success("Hodim so‘rovi yuborildi. Admin tasdiqlaganda kirish ochiladi.");
      nav("/pending-approval");
    } catch (e: any) {
      toast.error(e?.message ?? "So‘rov yuborishda xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onboarding</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Siz kim sifatida foydalanmoqchisiz? (Biznes egasi yoki hodim)
        </p>
      </div>

      {(lastOwner || lastStaff) && (
        <Card title="Oxirgi so‘rov holati">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-background p-3">
              <div className="text-xs font-semibold text-muted-foreground">Biznes egasi so‘rovi</div>
              <div className="mt-1 text-sm font-semibold">
                {lastOwner ? lastOwner.status : "—"}
              </div>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <div className="text-xs font-semibold text-muted-foreground">Hodim so‘rovi</div>
              <div className="mt-1 text-sm font-semibold">
                {lastStaff ? lastStaff.status : "—"}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => nav("/pending-approval")}>Batafsil ko‘rish</Button>
          </div>
        </Card>
      )}

      <Card title="1) Men BIZNES EGASIman">
        <div className="space-y-3">
          <Input
            label="Biznes nomi (ixtiyoriy)"
            placeholder="Masalan: Han Lazer"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <Input
            label="Izoh (ixtiyoriy)"
            placeholder="Telefon, manzil, nechta hodim..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={() => void sendOwner()}>
              {busy ? "..." : "Biznes egasi so‘rovini yuborish"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Super Admin tasdiqlaganidan keyin sizga Shop yaratiladi va siz <b>admin</b> bo‘lasiz.
          </div>
        </div>
      </Card>

      <Card title="2) Men HODIMman">
        <div className="space-y-3">
          <Input
            label="Shop ID"
            placeholder="Do‘kon egasidan oling"
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
          />
          <Input
            label="Izoh (ixtiyoriy)"
            placeholder="Sotuvchi: Ali, telefon..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={() => void sendStaff()}>
              {busy ? "..." : "Shop ID orqali so‘rov yuborish"}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Admin tasdiqlagach sizning hisobingiz avtomatik shu shopga ulanadi.
          </div>
        </div>
      </Card>
    </div>
  );
}
