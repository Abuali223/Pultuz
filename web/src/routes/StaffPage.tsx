import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import {
  watchShopStaffRequests,
  approveStaffRequest,
  listUsersInShop,
  setStaffRole,
  StaffRequest,
  StaffRole,
  STAFF_ROLE_LABELS,
} from "@/services/staff";
import { toast } from "sonner";

const ROLE_OPTIONS: Array<{ value: StaffRole; label: string; hint: string }> = [
  { value: "cashier", label: "Sotuvchi", hint: "Kassa, mijozlar, buyurtmalar" },
  { value: "warehouse", label: "Omborchi", hint: "Kirim, ombor, ta'minotchilar" },
  { value: "viewer", label: "Faqat ko'ruvchi", hint: "Hech narsani o'zgartira olmaydi" },
];

export function StaffPage() {
  const { role, shopId } = useAuth();
  const nav = useNavigate();

  const [requests, setRequests] = React.useState<StaffRequest[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // Har bir so'rov uchun tanlangan rol (default: sotuvchi)
  const [pickedRole, setPickedRole] = React.useState<Record<string, StaffRole>>({});

  React.useEffect(() => {
    if (!shopId || role !== "admin") return;
    const unsub = watchShopStaffRequests(shopId, setRequests);
    // also load users list
    listUsersInShop(shopId)
      .then(setUsers)
      .catch(() => setUsers([]));
    return () => unsub();
  }, [shopId, role]);

  async function approve(reqId: string) {
    if (!shopId) return;
    try {
      setBusyId(reqId);
      await approveStaffRequest(reqId, pickedRole[reqId] ?? "cashier");
      toast.success("Hodim tasdiqlandi");
      // refresh staff list
      const fresh = await listUsersInShop(shopId);
      setUsers(fresh);
    } catch (e: any) {
      toast.error(e?.message ?? "Tasdiqlashda xatolik");
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(staffUid: string, newRole: StaffRole) {
    if (!shopId) return;
    try {
      setBusyId(staffUid);
      await setStaffRole(staffUid, newRole);
      toast.success("Rol o'zgartirildi");
      const fresh = await listUsersInShop(shopId);
      setUsers(fresh);
    } catch (e: any) {
      toast.error(e?.message ?? "Rol o'zgartirishda xatolik");
    } finally {
      setBusyId(null);
    }
  }

  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card title="Ruxsat yo‘q">
          <div className="text-sm text-muted-foreground">
            Bu bo‘lim faqat <b>admin</b> uchun.
          </div>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => nav("/profile")}>Profilga qaytish</Button>
          </div>
        </Card>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const approved = users.filter((u) => ["cashier", "warehouse", "viewer", "accountant"].includes(String(u.role)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hodimlar</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Shop: <b>{shopId}</b>. Bu yerda hodim so‘rovlarini tasdiqlaysiz va ro‘yxatini ko‘rasiz.
        </p>
      </div>

      <Card title={`Kutilayotgan so‘rovlar (${pending.length})`}>
        {pending.length === 0 ? (
          <div className="text-sm text-muted-foreground">Hozircha so‘rov yo‘q.</div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold break-all">{r.email ?? r.uid}</div>
                  <div className="text-xs text-muted-foreground break-all">UID: {r.uid}</div>
                  {r.note ? <div className="mt-1 text-xs text-muted-foreground">Izoh: {r.note}</div> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-10 rounded-lg border border-border/40 bg-background px-2 text-sm"
                    value={pickedRole[r.id] ?? "cashier"}
                    onChange={(e) => setPickedRole((m) => ({ ...m, [r.id]: e.target.value as StaffRole }))}
                    title="Ruxsat darajasi"
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} title={o.hint}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <Button disabled={busyId === r.id} onClick={() => void approve(r.id)}>
                    {busyId === r.id ? "..." : "Aktiv qilish"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Hodimlar ro‘yxati (${approved.length})`}>
        {approved.length === 0 ? (
          <div className="text-sm text-muted-foreground">Hodimlar hali ulanmagan.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {approved.map((u) => (
              <div key={u.id} className="rounded-xl border bg-background p-3">
                <div className="text-sm font-semibold break-all">{u.email ?? u.id}</div>
                <div className="mt-1 text-xs text-muted-foreground break-all">UID: {u.id}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1 text-xs font-bold">
                    {STAFF_ROLE_LABELS[String(u.role)] ?? String(u.role || "cashier")}
                  </span>
                  <select
                    className="h-9 rounded-lg border border-border/40 bg-background px-2 text-xs"
                    value={["cashier", "warehouse", "viewer"].includes(String(u.role)) ? String(u.role) : "viewer"}
                    disabled={busyId === u.id}
                    onChange={(e) => void changeRole(u.id, e.target.value as StaffRole)}
                    title="Rolni o'zgartirish"
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
