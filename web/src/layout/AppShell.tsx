import React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { useAuth } from "@/auth/useAuth";
import { auth } from "@/lib/firebase";
import { IconBell, IconCart, IconDashboard, IconFileText, IconLogOut, IconPieChart, IconSettings, IconUser } from "@/ui/icons";
import { Toaster } from "sonner";
import { AppLockGate } from "@/layout/AppLockGate";
import { GlobalSearch } from "@/ui/GlobalSearch";
import { isSuperAdminUser } from "@/auth/superAdmin";

type NavItem = {
  label: string;
  to: string;
  icon: React.ReactNode;
};

function titleFromPath(pathname: string) {
  if (pathname.startsWith("/admin-dashboard")) return "Admin oynasi";
  if (pathname.startsWith("/pos")) return "Savdo";
  if (pathname.startsWith("/inventory")) return "Omborxona";
  if (pathname.startsWith("/purchases")) return "Kirim";
  if (pathname.startsWith("/suppliers")) return "Ta’minotchilar";
  if (pathname.startsWith("/customers")) return "Mijozlar";
  if (pathname.startsWith("/orders")) return "Buyurtmalar";
  if (pathname.startsWith("/expenses")) return "Harajatlar";
  if (pathname.startsWith("/reports")) return "Hisobotlar";
  if (pathname.startsWith("/cash-history")) return "Kassa tarixi";
  if (pathname.startsWith("/staff")) return "Hodimlar";
  if (pathname.startsWith("/profile")) return "Profil";
  return "Pult Uz";
}

export function AppShell({ children }: { children?: React.ReactNode }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { user, shopId, role } = useAuth();

  // Mobile navigatsiya: bottom-tab o‘rniga hamburger menu
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const leftNavAll: NavItem[] = [
    { label: "ADMIN OYNA", to: "/admin-dashboard", icon: <IconDashboard /> },
    { label: "KASSA", to: "/pos", icon: <IconDashboard /> },
    { label: "OMBOR", to: "/inventory", icon: <IconFileText /> },
    { label: "KIRIM", to: "/purchases", icon: <IconFileText /> },
    { label: "TAMINOTCHI", to: "/suppliers", icon: <IconUser /> },
    { label: "MIJOZ", to: "/customers", icon: <IconUser /> },
    { label: "BUYURTMA", to: "/orders", icon: <IconCart /> },
    { label: "HARAJAT", to: "/expenses", icon: <IconFileText /> },
    { label: "HISOBOT", to: "/reports", icon: <IconPieChart /> },
    { label: "TARIX", to: "/cash-history", icon: <IconPieChart /> },
    // Admin uchun: hodimlar boshqaruvi
    { label: "HODIMLAR", to: "/staff", icon: <IconUser /> },
    // SuperAdmin panel
    { label: "SUPER ADMIN", to: "/superadmin", icon: <IconDashboard /> },
    { label: "PROFIL", to: "/profile", icon: <IconUser /> },
  ];

  // Har bir rol faqat o'ziga ruxsat berilgan bo'limlarni ko'radi:
  //  - admin / superadmin — hammasi
  //  - sotuvchi (cashier) — kassa, ombor, mijoz, buyurtma, tarix
  //  - omborchi (warehouse) — ombor, kirim, ta'minotchi, buyurtma
  //  - faqat ko'ruvchi (viewer/accountant) — ombor, mijoz, buyurtma, hisobot, tarix (faqat o'qish)
  const isPrivileged = role === "admin" || isSuperAdminUser(user);
  const NAV_BY_ROLE: Record<string, string[]> = {
    cashier: ["/pos", "/inventory", "/customers", "/orders", "/cash-history", "/profile"],
    warehouse: ["/inventory", "/purchases", "/suppliers", "/orders", "/profile"],
    viewer: ["/inventory", "/customers", "/orders", "/reports", "/cash-history", "/profile"],
    accountant: ["/inventory", "/customers", "/orders", "/reports", "/cash-history", "/profile"],
  };
  const leftNav: NavItem[] = isPrivileged
    ? leftNavAll
    : role && NAV_BY_ROLE[role]
      ? leftNavAll.filter((x) => NAV_BY_ROLE[role]!.includes(x.to))
      : leftNavAll.filter((x) => x.to === "/profile");

  const title = titleFromPath(pathname);
  const displayName = user?.displayName || user?.email || "Foydalanuvchi";

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <AppLockGate>
      <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-right" />
      {/* Desktopda sidebar chapga yopishib tursin (bo'sh joy qolmasin) */}
      <div className="w-full lg:flex lg:gap-6 lg:px-0">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:w-[260px]">
          <div className="ali-premium-sidebar sticky top-0 h-[100dvh] rounded-[22px] shadow-soft flex flex-col">
            <div className="flex items-center gap-3 px-4 py-4">
              <img
                src="/logo.png"
                alt="Pult Uz"
                className="h-12 w-12 rounded-[var(--radius-card)] border border-white/15 bg-white/10 ring-1 ring-white/5"
                title="Pult Uz"
              />
              <div className="min-w-0">
                <div className="text-[13px] font-extrabold tracking-wide">Pult Uz</div>
                <div className="text-[12px] font-semibold text-[color:var(--sidebar-muted)]">{(role ?? "PENDING").toUpperCase()}</div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 pb-3">
              <div className="space-y-1">
                {leftNav.map((it) => {
                  const active = pathname === it.to;
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      className={
                        "ali-sidebar-link group relative flex items-center gap-3 rounded-[14px] px-3 py-3 text-sm font-bold tracking-wide transition-all active:scale-[0.99] " +
                        (active ? "ali-sidebar-link-active" : "ali-sidebar-link-idle")
                      }
                      title={it.label}
                    >
                      {active ? <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1.5 rounded-full bg-[color:var(--sidebar-gold)]" /> : null}
                      <span className={"ali-sidebar-icon grid h-9 w-9 place-items-center rounded-[12px] " + (active ? "ali-sidebar-icon-active" : "")}
                      >
                        {it.icon}
                      </span>
                      <span className="truncate">{it.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="mt-auto px-4 pb-4">
              <div className="ali-sidebar-footer rounded-[18px] p-3">
                <button
                  type="button"
                  onClick={() => nav("/profile")}
                  className="flex w-full items-center justify-between rounded-[14px] px-3 py-3 text-left text-sm font-bold text-[color:var(--sidebar-text)] hover:bg-white/5"
                  title="Admin sozlamalari"
                >
                  <span className="flex items-center gap-3">
                    <IconSettings size={18} />
                    <span className="truncate">Admin</span>
                  </span>
                  <span className="text-[11px] font-semibold text-[color:var(--sidebar-muted)]" title={displayName}>
                    {displayName}
                  </span>
                </button>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => nav("/pos")}
                    className="flex items-center justify-center gap-2 rounded-[14px] border border-white/15 bg-white/10 px-3 py-3 text-sm font-extrabold text-[color:var(--sidebar-text)] hover:bg-white/15"
                    title="Sotuvchi (POS)"
                  >
                    <IconCart size={18} />
                    <span>Sotuvchi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="flex items-center justify-center gap-2 rounded-[14px] border border-white/15 bg-white/10 px-3 py-3 text-sm font-extrabold text-[color:var(--sidebar-text)] hover:bg-white/15"
                    title="Chiqish"
                  >
                    <IconLogOut size={18} />
                    <span>Chiqish</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-screen flex-1 flex-col">
          {/* Mobile/Tablet header (POS page has its own top bar on desktop) */}
          <header className={
            "sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md " +
            (pathname.startsWith("/pos") ? "lg:hidden" : "")
          }>
            <div className="flex w-full items-center justify-between px-6 pb-4 pt-6 lg:px-4 lg:pb-0 lg:pt-6">
              <div className="flex items-center gap-3 min-w-0">
                {/* Hamburger (mobile) */}
                <button
                  className="grid h-10 w-10 place-items-center rounded-[var(--radius-icon)] border border-border/60 bg-card shadow-sm active:scale-95 lg:hidden"
                  title="Menyu"
                  onClick={() => setMobileMenuOpen(true)}
                >
                  <span className="text-xl leading-none">☰</span>
                </button>

                <div className="min-w-0">
                <div className="hidden sm:block text-xs font-medium text-muted-foreground">Xush kelibsiz,</div>
                <div className="truncate text-xl font-bold tracking-tight">{title}</div>
                <div className="hidden sm:block truncate text-xs font-medium text-muted-foreground lg:hidden">{displayName}</div>
                </div>
              </div>
              {/* Global qidiruv (desktop) — YouTube uslubidagi jonli takliflar */}
              <div className="hidden md:block w-full max-w-[440px] px-4">
                <GlobalSearch />
              </div>
              <button
                className="relative grid h-10 w-10 place-items-center rounded-[var(--radius-icon)] border border-border/60 bg-card shadow-sm active:scale-95"
                title="Bildirishnomalar"
              >
                <IconBell />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
              </button>
            </div>
            {/* Global qidiruv (mobil) — header ostida to'liq kenglikda */}
            <div className="md:hidden px-6 pb-3 lg:px-4">
              <GlobalSearch />
            </div>
          </header>

          {/* Mobile hamburger menu drawer */}
          {mobileMenuOpen ? (
            <div className="fixed inset-0 z-[60] lg:hidden">
              <button
                className="absolute inset-0 bg-black/45"
                aria-label="Yopish"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div className="ali-premium-sidebar absolute left-0 top-0 h-[100dvh] w-[82%] max-w-sm shadow-2xl overflow-y-auto pb-[max(env(safe-area-inset-bottom),16px)]">
                <div className="flex items-center justify-between border-b border-white/20 px-4 py-4">
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--sidebar-text)]">Pult Uz</div>
                    <div className="text-xs text-[color:var(--sidebar-muted)] truncate">{displayName}</div>
                  </div>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-[var(--radius-icon)] border border-white/30 bg-white/10 text-[color:var(--sidebar-text)]"
                    onClick={() => setMobileMenuOpen(false)}
                    title="Yopish"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-3 min-h-0">
                  <div className="grid gap-1">
                    {leftNav.map((it: NavItem) => {
                      const active = pathname === it.to || pathname.startsWith(it.to + "/");
                      return (
                        <Link
                          key={it.to}
                          to={it.to}
                          onClick={() => setMobileMenuOpen(false)}
                          className={
                            "ali-sidebar-link group relative flex items-center gap-3 rounded-[14px] px-3 py-3 text-sm font-bold tracking-wide transition-all active:scale-[0.99] " +
                            (active ? "ali-sidebar-link-active" : "ali-sidebar-link-idle")
                          }
                        >
                          {active ? <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1.5 rounded-full bg-[color:var(--sidebar-gold)]" /> : null}
                          <span className={"ali-sidebar-icon grid h-9 w-9 place-items-center rounded-[12px] " + (active ? "ali-sidebar-icon-active" : "")}>{it.icon}</span>
                          <span className="truncate">{it.label}</span>
                        </Link>
                      );
                    })}
                  </div>

                  <div className="my-3 h-px bg-white/20" />

                  <button
                    className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-white/20 bg-white/10 px-3 py-3 text-sm font-semibold text-[color:var(--sidebar-text)] hover:bg-white/15"
                    onClick={async () => {
                      setMobileMenuOpen(false);
                      await handleLogout();
                    }}
                  >
                    <IconLogOut size={18} />
                    <span>Chiqish</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <main className="flex-1 px-6 pb-8 pt-6 lg:px-0 lg:pb-8">
            {children ?? <Outlet />}
          </main>
        </div>
        </div>
      </div>
    </AppLockGate>
  );
}
