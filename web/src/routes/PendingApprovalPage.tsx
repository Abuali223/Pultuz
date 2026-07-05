import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { watchMyStaffRequests, type StaffRequest } from "@/services/staff";
import { watchMyOwnerRequests, type OwnerRequest } from "@/services/owner";

export default function PendingApprovalPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [staffReqs, setStaffReqs] = React.useState<StaffRequest[]>([]);
  const [ownerReqs, setOwnerReqs] = React.useState<OwnerRequest[]>([]);

  React.useEffect(() => {
    if (!user) return;
    const u1 = watchMyStaffRequests(user.uid, setStaffReqs);
    const u2 = watchMyOwnerRequests(user.uid, setOwnerReqs);
    return () => {
      u1();
      u2();
    };
  }, [user]);

  const lastStaff = staffReqs[0];
  const lastOwner = ownerReqs[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tasdiqlash kutilmoqda</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          So‘rov yuborilgan. Admin/Super Admin tasdiqlaganidan keyin sizga bo‘limlar avtomatik ochiladi.
        </p>
      </div>

      <Card title="So‘rovlar holati">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-background p-3">
            <div className="text-xs font-semibold text-muted-foreground">Hodim so‘rovi</div>
            <div className="mt-1 text-sm font-semibold">{lastStaff ? lastStaff.status : "—"}</div>
            {lastStaff?.shopId ? (
              <div className="mt-1 text-xs text-muted-foreground break-all">Shop: {lastStaff.shopId}</div>
            ) : null}
          </div>
          <div className="rounded-xl border bg-background p-3">
            <div className="text-xs font-semibold text-muted-foreground">Biznes egasi so‘rovi</div>
            <div className="mt-1 text-sm font-semibold">{lastOwner ? lastOwner.status : "—"}</div>
            {lastOwner?.shopId ? (
              <div className="mt-1 text-xs text-muted-foreground break-all">Shop: {lastOwner.shopId}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => nav("/onboarding")}>Ortga</Button>
          <Button onClick={() => window.location.reload()}>Yangilash</Button>
        </div>
      </Card>

      <Card title="Bog‘lanish">
        <div className="text-sm text-muted-foreground">
          Tasdiqlash uchun loyiha egasi bilan bog‘laning.
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          <div>
            Telegram: <b>@AbuAli_23</b>
          </div>
          <div>
            Telefon: <b>+998975151777</b>
          </div>
        </div>
      </Card>
    </div>
  );
}
