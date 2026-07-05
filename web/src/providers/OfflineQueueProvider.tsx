import { useEffect } from "react";
import { flushOfflineQueue, getOfflineQueueCount } from "@/services/offlineQueue";
import { useToast } from "@/ui/Toast";

const FLUSH_INTERVAL_MS = 25_000;

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const { push } = useToast();

  useEffect(() => {
    let mounted = true;

    const tryFlush = async (showSuccess = false) => {
      const before = getOfflineQueueCount();
      if (before <= 0) return;

      try {
        const { processed, left } = await flushOfflineQueue();
        if (!mounted) return;

        if (processed > 0 && showSuccess) {
          const msg = `${processed} ta amal serverga yuborildi.${left > 0 ? ` ${left} ta qoldi.` : ""}`;
          push(`Offline navbat sinxronlandi: ${msg}`, "success");
        }
      } catch (e: any) {
        if (!mounted) return;
        push(`Offline navbat xatosi: ${e?.message || String(e)}`, "error");
      }
    };

    const onOnline = () => {
      void tryFlush(true);
    };

    const onQueueUpdate = () => {
      void tryFlush(false);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline-queue:updated", onQueueUpdate as EventListener);

    const id = window.setInterval(() => {
      void tryFlush(false);
    }, FLUSH_INTERVAL_MS);

    void tryFlush(false);

    return () => {
      mounted = false;
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline-queue:updated", onQueueUpdate as EventListener);
    };
  }, [push]);

  return <>{children}</>;
}
