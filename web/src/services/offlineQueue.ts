export type OfflineJobType =
  | "sale.create"
  | "purchase.create"
  | "supplier.payment.create"
  | "customer.payment.create"
  | "expense.create";

export type OfflineJobStatus = "pending" | "failed";

export interface OfflineJob {
  id: string;
  type: OfflineJobType;
  payload: unknown;
  shopId: string;
  userId?: string;
  createdAt: number;
  attempts: number;
  status: OfflineJobStatus;
  lastError?: string;
}

const KEY = "alibiz:offline-queue:v1";

function hasWindow() {
  return typeof window !== "undefined";
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readQueue(): OfflineJob[] {
  if (!hasWindow()) return [];
  const arr = safeParse<OfflineJob[]>(window.localStorage.getItem(KEY), []);
  return Array.isArray(arr) ? arr : [];
}

function writeQueue(queue: OfflineJob[]) {
  if (!hasWindow()) return;
  window.localStorage.setItem(KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent("offline-queue:updated"));
}

function uid() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOfflineQueue(): OfflineJob[] {
  return readQueue();
}

export function getOfflineQueueCount(): number {
  return readQueue().filter((j) => j.status === "pending").length;
}

export function enqueueOfflineJob(input: {
  type: OfflineJobType;
  payload: unknown;
  shopId: string;
  userId?: string;
}): string {
  const job: OfflineJob = {
    id: uid(),
    type: input.type,
    payload: input.payload,
    shopId: input.shopId,
    userId: input.userId,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  const next = [...readQueue(), job];
  writeQueue(next);
  return job.id;
}

function removeJob(jobId: string) {
  const next = readQueue().filter((j) => j.id !== jobId);
  writeQueue(next);
}

function markFailed(jobId: string, message: string) {
  const next = readQueue().map((j) => {
    if (j.id !== jobId) return j;
    return {
      ...j,
      attempts: j.attempts + 1,
      status: "failed" as const,
      lastError: message,
    };
  });
  writeQueue(next);
}

function markRetry(jobId: string, message?: string) {
  const next = readQueue().map((j) => {
    if (j.id !== jobId) return j;
    return {
      ...j,
      attempts: j.attempts + 1,
      status: "pending" as const,
      lastError: message,
    };
  });
  writeQueue(next);
}

function isProbablyNetworkError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const code = (e?.code || "").toLowerCase();
  const msg = (e?.message || "").toLowerCase();
  return (
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("network") ||
    msg.includes("network") ||
    msg.includes("offline") ||
    msg.includes("failed to fetch")
  );
}

async function runJob(job: OfflineJob): Promise<void> {
  switch (job.type) {
    case "sale.create": {
      const { createSale } = await import("@/services/sales");
      await createSale(job.payload as any);
      return;
    }
    case "purchase.create": {
      const { createPurchase } = await import("@/services/purchases");
      await createPurchase(job.payload as any);
      return;
    }
    case "supplier.payment.create": {
      const { createSupplierPayment } = await import("@/services/suppliers");
      await createSupplierPayment(job.payload as any);
      return;
    }
    case "customer.payment.create": {
      const { addCustomerPayment } = await import("@/services/customers");
      const p = job.payload as { shopId: string; customerId: string; amount: number; paymentType: any; note?: string };
      await addCustomerPayment(p.shopId, p.customerId, {
        amount: p.amount,
        paymentType: p.paymentType,
        note: p.note,
      });
      return;
    }
    case "expense.create": {
      const { createExpense } = await import("@/services/expenses");
      await createExpense(job.payload as any);
      return;
    }
    default:
      throw new Error("Unknown job type");
  }
}

let processing = false;

export async function flushOfflineQueue(): Promise<{ processed: number; left: number }> {
  if (!hasWindow()) return { processed: 0, left: 0 };
  if (processing) return { processed: 0, left: readQueue().length };
  if (!navigator.onLine) return { processed: 0, left: readQueue().length };

  processing = true;
  let processed = 0;

  try {
    const queue = readQueue().filter((j) => j.status === "pending" || j.status === "failed");
    for (const job of queue) {
      try {
        await runJob(job);
        removeJob(job.id);
        processed += 1;
      } catch (err) {
        const msg = (err as Error)?.message || "Queue processing error";
        if (isProbablyNetworkError(err)) {
          markRetry(job.id, msg);
          break;
        }
        markFailed(job.id, msg);
      }
    }
  } finally {
    processing = false;
  }

  return { processed, left: readQueue().length };
}

export function shouldQueueByError(err: unknown): boolean {
  return isProbablyNetworkError(err);
}
