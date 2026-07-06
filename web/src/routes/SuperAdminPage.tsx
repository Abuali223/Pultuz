import React from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { useAuth } from "@/auth/useAuth";
import { toast } from "sonner";
import {
  watchOwnerRequests,
  approveOwnerRequest,
  setSubscription,
  connectShopBot,
  OwnerRequest,
  listShops,
} from "@/services/superadmin";
import { approveStaffRequest, watchPendingStaffRequests, StaffRequest } from "@/services/staff";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { isSuperAdminUser } from "@/auth/superAdmin";

type Plan = "monthly" | "lifetime";

export function SuperAdminPage() {
  const { user } = useAuth();
  const isSuper = isSuperAdminUser(user);

  const [staffReqs, setStaffReqs] = React.useState<StaffRequest[]>([]);
  const [ownerReqs, setOwnerReqs] = React.useState<OwnerRequest[]>([]);

  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Telegram per-shop bot connect
  const [botShopId, setBotShopId] = React.useState("");
  const [botToken, setBotToken] = React.useState("");

  const [shops, setShops] = React.useState<any[]>([]);
  const [shopsLoading, setShopsLoading] = React.useState(false);


  // Subscription form
  const [shopId, setShopId] = React.useState("");
  const [plan, setPlan] = React.useState<Plan>("monthly");
  const [months, setMonths] = React.useState(1);

  // Public contact
  const [telegram, setTelegram] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [contactBusy, setContactBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isSuper) return;

    const unsubStaff = watchPendingStaffRequests(setStaffReqs);
    const unsubOwner = watchOwnerRequests((rows) => setOwnerReqs(rows.filter((r) => r.status === "pending")));

    // Load shops for dropdown
    setShopsLoading(true);
    listShops()
      .then((rows: any[]) => setShops(rows || []))
      .catch(() => setShops([]))
      .finally(() => setShopsLoading(false));

    void loadPublicContact();

    return () => {
      unsubStaff();
      unsubOwner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuper]);


  async function linkShopBot() {
    if (!botShopId.trim()) {
      toast.error("Shop ID kiriting");
      return;
    }
    if (!botToken.trim()) {
      toast.error("Bot token kiriting");
      return;
    }
    try {
      setBusyId("bot");
      const res: any = await connectShopBot({ shopId: botShopId.trim(), botToken: botToken.trim() });
      toast.success(`Bot ulandi ✅ @${res?.botUsername || ""}`);
    } catch (e: any) {
      toast.error(e?.message || "Bot ulashda xatolik");
    } finally {
      setBusyId(null);
    }
  }

  async function loadPublicContact() {
    try {
      const ref = doc(db, "public_settings", "contact");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data() as any;
        setTelegram(String(d.telegram ?? ""));
        setPhone(String(d.phone ?? ""));
      }
    } catch {
      // ignore
    }
  }

  async function savePublicContact() {
    setContactBusy(true);
    try {
      await setDoc(
        doc(db, "public_settings", "contact"),
        { telegram: telegram.trim(), phone: phone.trim(), updatedAt: Date.now() },
        { merge: true }
      );
      toast.success("Public kontakt saqlandi ✅");
    } catch (e: any) {
      toast.error(e?.message ?? "Saqlash xatolik");
    } finally {
      setContactBusy(false);
    }
  }

  async function doApproveStaff(reqId: string) {
    setBusyId(reqId);
    try {
      await approveStaffRequest(reqId);
      toast.success("Hodim tasdiqlandi ✅");
    } catch (e: any) {
      toast.error(e?.message ?? "Tasdiqlash xatolik");
    } finally {
      setBusyId(null);
    }
  }

  async function doApproveOwner(reqId: string) {
    setBusyId(reqId);
    try {
      await approveOwnerRequest({ requestId: reqId });
      toast.success("Biznes egasi tasdiqlandi ✅");
    } catch (e: any) {
      toast.error(e?.message ?? "Tasdiqlash xatolik");
    } finally {
      setBusyId(null);
    }
  }

  async function activate() {
    if (!shopId.trim()) return toast.error("Shop ID kiriting");
    setBusyId("sub");
    try {
      await setSubscription({
        shopId: shopId.trim(),
        type: plan,
        months: plan === "monthly" ? Math.max(1, Number(months) || 1) : undefined,
      });
      toast.success("Shop aktiv qilindi ✅");
      setShopId("");
      setMonths(1);
    } catch (e: any) {
      toast.error(e?.message ?? "Subscription xatolik");
    } finally {
      setBusyId(null);
    }
  }

  if (!isSuper) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card title="Super Admin panel">
          <div className="text-sm text-muted-foreground">
            Bu sahifa faqat SuperAdmin uchun.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Super Admin panel</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Tasdiqlashlar, demo va obuna boshqaruvi
        </p>
      </div>

      {/* 1) Requests */}
      <Card title="Hodim so'rovlari (PENDING)">
        <div className="space-y-6">
          <div>
            <div className="text-sm font-semibold mb-2">Hodim so'rovlari</div>
            {staffReqs.length === 0 ? (
              <div className="text-sm text-muted-foreground">Hozircha so‘rov yo‘q</div>
            ) : (
              <div className="space-y-2">
                {staffReqs.map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-border/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold break-all">{r.email || r.uid}</div>
                      <div className="text-xs text-muted-foreground break-all">
                        Shop: <b>{r.shopId}</b> {r.note ? ` • ${r.note}` : ""}
                      </div>
                    </div>
                    <Button disabled={busyId===r.id} onClick={() => void doApproveStaff(r.id)}>
                      {busyId===r.id ? "..." : "Tasdiqlash"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border/40 pt-4">
            <div className="text-sm font-semibold mb-2">Biznes egasi so'rovlari</div>
            {ownerReqs.length === 0 ? (
              <div className="text-sm text-muted-foreground">Hozircha so‘rov yo‘q</div>
            ) : (
              <div className="space-y-2">
                {ownerReqs.map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-border/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-muted-foreground break-all">{r.email || r.uid}</div>
                    </div>
                    <Button disabled={busyId===r.id} onClick={() => void doApproveOwner(r.id)}>
                      {busyId===r.id ? "..." : "Tasdiqlash"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 2) Subscription */}
      <Card title="Shop aktiv qilish (Obuna)">
        <div className="grid gap-3 lg:grid-cols-2">
          <Input label="Shop ID" placeholder="shopId" value={shopId} onChange={(e) => setShopId(e.target.value)} />
          <div>
            <div className="text-sm font-semibold mb-1">Plan</div>
            <div className="flex gap-2">
              <button
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${plan==="monthly" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                onClick={() => setPlan("monthly")}
              >
                Monthly
              </button>
              <button
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${plan==="lifetime" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                onClick={() => setPlan("lifetime")}
              >
                Lifetime
              </button>
            </div>
          </div>
        </div>

        {plan === "monthly" && (
          <div className="mt-3">
            <Input
              label="Necha oy"
              type="number"
              value={String(months)}
              onChange={(e) => setMonths(Number(e.target.value) || 1)}
            />
          </div>
        )}

        <div className="mt-4">
          <Button disabled={busyId==="sub"} onClick={() => void activate()}>
            {busyId==="sub" ? "..." : "Aktiv qilish"}
          </Button>
          <div className="mt-2 text-xs text-muted-foreground">
            Monthly - <b>paidUntil</b> yangilanadi. Lifetime - doimiy aktiv.
          </div>
        </div>
      </Card>


      {/* 3) Telegram shop bot ulash */}
      <Card title="Telegram bot ulash (Shop bot)">
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Shop tanlang</div>
            <select
              className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
              value={botShopId}
              onChange={(e) => setBotShopId(e.target.value)}
              disabled={shopsLoading}
            >
              <option value="">{shopsLoading ? "Yuklanmoqda..." : "Shop tanlang"}</option>
              {shops.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {(sh.name || sh.shopName || sh.title || "Shop") + " — " + sh.id}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Shop ID avtomatik to‘ldiriladi. Xohlasangiz qo‘lda ham yozishingiz mumkin.
            </div>
          </div>

          <Input
            label="Shop ID (qo‘lda)"
            placeholder="Shop ID"
            value={botShopId}
            onChange={(e) => setBotShopId(e.target.value)}
          />

          <Input
            label="Bot token"
            placeholder="123456:ABC..."
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
          />
        </div>

        <div className="mt-4">
          <Button disabled={busyId==="bot"} onClick={() => void linkShopBot()}>
            {busyId==="bot" ? "..." : "Ulash"}
          </Button>
          <div className="mt-2 text-xs text-muted-foreground">
            BotFather orqali bot ochib, tokenni kiriting. Ulab bo‘lgach webhook avtomatik o‘rnatiladi.
          </div>
        </div>
      </Card>


      {/* 4) Public contact */}
      <Card title="Public kontakt (Demo sahifalarda ko‘rinadi)">
        <div className="grid gap-3 lg:grid-cols-2">
          <Input label="Telegram" placeholder="@username" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
          <Input label="Telefon" placeholder="+998..." value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="mt-4">
          <Button disabled={contactBusy} onClick={() => void savePublicContact()}>
            {contactBusy ? "..." : "Saqlash"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
