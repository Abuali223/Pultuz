import React from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { ToastProvider } from "@/ui/Toast";
import { OfflineQueueProvider } from "@/providers/OfflineQueueProvider";
import { AppShell } from "@/layout/AppShell";
import { LoginPage } from "@/routes/LoginPage";
import { VerifyEmailPage } from "@/routes/VerifyEmailPage";
import { PosPage } from "@/routes/PosPage";
import { InventoryPage } from "@/routes/InventoryPage";
import { PurchasesPage } from "@/routes/PurchasesPage";
import { SuppliersPage } from "@/routes/SuppliersPage";
import { CustomersPage } from "@/routes/CustomersPage";
import { CustomerDetailPage } from "@/routes/CustomerDetailPage";
import { ExpensesPage } from "@/routes/ExpensesPage";
import { ReportsPage } from "@/routes/ReportsPage";
import { CashHistoryPage } from "@/routes/CashHistoryPage";
import { SuperAdminPage } from "@/routes/SuperAdminPage";
import ProfilePage from "@/routes/ProfilePage";
import { StaffPage } from "@/routes/StaffPage";
import { StaffJoinPage } from "@/routes/StaffJoinPage";
import { AdminDashboardPage } from "@/routes/AdminDashboardPage";
import { OrdersPage } from "@/routes/OrdersPage";

const SUPER_ADMIN_UID = "M8WKl0BlBnPanTU6Hh60SumTpQu1";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <div className="p-6 text-sm">Yuklanmoqda...</div>;
  if (!user) return <Navigate to="/login" replace />;

  // SuperAdmin email verified bo'lmasa ham kirishi mumkin (master account)
  if (user.uid !== SUPER_ADMIN_UID) {
    // /verify-email sahifasiga kirishga ruxsat beramiz
    if (!user.emailVerified && loc.pathname !== "/verify-email") {
      return <Navigate to="/verify-email" replace />;
    }
  }

  return <>{children}</>;
}

export function RequireActiveShop({ children }: { children: React.ReactNode }) {
  const { user, role, shopId } = useAuth();
  // SuperAdmin hamma joyga kira oladi
  if (user?.uid === SUPER_ADMIN_UID) return <>{children}</>;
  // Pending/role yo‘q bo‘lsa — faqat Profil/So‘rov ekranlariga yo‘naltiramiz
  if (!role || role === "pending" || !shopId || String(shopId).length < 3) {
    return <Navigate to="/profile" replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, role, shopId, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.uid === SUPER_ADMIN_UID) return <Navigate to="/superadmin" replace />;
  if (!role || role === "pending" || !shopId || String(shopId).length < 3) return <Navigate to="/profile" replace />;
  // Rolga qarab bosh sahifa: omborchi — Kirim, faqat ko'ruvchi — Ombor, qolganlar — Savdo
  if (role === "warehouse") return <Navigate to="/purchases" replace />;
  if (role === "viewer" || role === "accountant") return <Navigate to="/inventory" replace />;
  return <Navigate to="/pos" replace />;
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <OfflineQueueProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify-email" element={<Protected><VerifyEmailPage /></Protected>} />

            <Route
              element={
                <Protected>
                  <AppShell />
                </Protected>
              }
            >
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/admin-dashboard" element={<RequireActiveShop><AdminDashboardPage /></RequireActiveShop>} />
              <Route path="/pos" element={<RequireActiveShop><PosPage /></RequireActiveShop>} />
              <Route path="/inventory" element={<RequireActiveShop><InventoryPage /></RequireActiveShop>} />
              <Route path="/purchases" element={<RequireActiveShop><PurchasesPage /></RequireActiveShop>} />
              <Route path="/suppliers" element={<RequireActiveShop><SuppliersPage /></RequireActiveShop>} />
              <Route path="/customers" element={<RequireActiveShop><CustomersPage /></RequireActiveShop>} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/orders" element={<RequireActiveShop><OrdersPage /></RequireActiveShop>} />
              <Route path="/expenses" element={<RequireActiveShop><ExpensesPage /></RequireActiveShop>} />
              <Route path="/reports" element={<RequireActiveShop><ReportsPage /></RequireActiveShop>} />
              <Route path="/cash-history" element={<RequireActiveShop><CashHistoryPage /></RequireActiveShop>} />
              <Route path="/staff" element={<RequireActiveShop><StaffPage /></RequireActiveShop>} />
              <Route path="/staff-join" element={<StaffJoinPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/superadmin" element={<SuperAdminPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </OfflineQueueProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
