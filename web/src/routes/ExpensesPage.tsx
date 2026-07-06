import React from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { useToast } from "@/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { createExpense, listExpenses } from "@/services/expenses";
import { enqueueOfflineJob, shouldQueueByError } from "@/services/offlineQueue";
import type { Expense, PaymentType } from "@/types";
import { formatMoneyInput, parseMoneyInput, formatMoney } from "@/lib/money";
import VoiceExpenseConfirmModal from "@/modules/voiceExpense/VoiceExpenseConfirmModal";
import type { VoiceExpenseConfirm } from "@/modules/voiceExpense/parseVoiceExpense";

export function ExpensesPage() {
  const toast = useToast();
  const { shopId, user } = useAuth();
  const [items, setItems] = React.useState<Expense[]>([]);
  const [open, setOpen] = React.useState(false);
  const [voiceOpen, setVoiceOpen] = React.useState(false);

  const [category, setCategory] = React.useState("Ijara");
  const [amountText, setAmountText] = React.useState("0");
  const [paymentType, setPaymentType] = React.useState<PaymentType>("cash");
  const [note, setNote] = React.useState("");

  async function refresh() {
    try {
      setItems(await listExpenses(shopId));
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);


  async function saveVoiceConfirmed(payload: VoiceExpenseConfirm) {
    if (!user) return;
    await createExpense({
      id: "tmp",
      shopId,
      category: payload.category.trim(),
      amount: payload.amount,
      paymentType: payload.paymentType,
      note: payload.note?.trim() || payload.transcript,
      createdAt: Date.now(),
      createdBy: user.uid,
      source: "voice",
      rawTranscript: payload.transcript,
    } as any);
    toast.push("Ovozli harajat saqlandi", "success");
    refresh();
  }

  async function save() {
    if (!user) return;
    const amount = parseMoneyInput(amountText);
    if (!category.trim() || amount <= 0) {
      toast.push("Kategoriya va summa kerak", "error");
      return;
    }
    const payload = {
      id: "tmp",
      shopId,
      category: category.trim(),
      amount,
      paymentType,
      note: note.trim() || undefined,
      createdAt: Date.now(),
      createdBy: user.uid,
      // Barqaror ID — offline qayta yuborishda dublikat harajatning oldini oladi
      operationId: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    };

    const resetForm = () => {
      setOpen(false);
      setAmountText("0");
      setNote("");
    };

    // Internet yo'q — offline navbatga qo'shamiz (internet kelganda avtomatik yuklanadi)
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueueOfflineJob({ type: "expense.create", payload, shopId, userId: user.uid });
      toast.push("Internet yo'q — harajat offline navbatga qo'shildi", "warning");
      resetForm();
      return;
    }

    try {
      await createExpense(payload as any);
      toast.push("Harajat qo'shildi", "success");
      resetForm();
      refresh();
    } catch (e: any) {
      if (shouldQueueByError(e)) {
        enqueueOfflineJob({ type: "expense.create", payload, shopId, userId: user.uid });
        toast.push("Aloqa uzildi — harajat navbatga qo'shildi", "warning");
        resetForm();
        return;
      }
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Harajatlar" right={<div className="flex flex-wrap gap-2 justify-end"><Button onClick={() => setVoiceOpen(true)}>🎤 Ovozli kiritish</Button><Button variant="ghost" onClick={() => setOpen(true)}>+ Harajat qo'shish</Button></div>}>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">Hozircha harajat yo'q.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-3 text-left">Sana</th>
                    <th className="py-3 text-left">Kategoriya</th>
                    <th className="py-3 text-left">To'lov</th>
                    <th className="py-3 text-left">Izoh</th>
                    <th className="py-3 text-right">Summa</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={x.id} className="border-b last:border-0">
                      <td className="py-3">{new Date(x.createdAt).toLocaleString()}</td>
                      <td className="py-3 font-medium">{x.category}</td>
                      <td className="py-3">{x.paymentType}</td>
                      <td className="py-3">{x.note || '—'}</td>
                      <td className="py-3 text-right font-semibold">{formatMoney(x.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
          {items.map((x) => (
                <div key={x.id} className="rounded-2xl border bg-muted/40 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{x.category}</div>
                      <div className="text-xs text-muted-foreground">{new Date(x.createdAt).toLocaleString()}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">To'lov</div>
                          <div className="font-medium">{x.paymentType}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-muted-foreground">Summa</div>
                          <div className="font-semibold">{formatMoney(x.amount)}</div>
                        </div>
                      </div>
                      {x.note ? (
                        <div className="mt-2 text-xs">
                          <span className="text-muted-foreground">Izoh: </span>
                          <span className="break-words">{x.note}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
          )}
      </Card>

      <Modal open={open} title="Harajat qo'shish" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Input label="Kategoriya" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Input label="Summa" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(formatMoneyInput(e.target.value))} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant={paymentType === "cash" ? "primary" : "ghost"} onClick={() => setPaymentType("cash")}>
              Naqd
            </Button>
            <Button variant={paymentType === "card" ? "primary" : "ghost"} onClick={() => setPaymentType("card")}>
              Karta
            </Button>
          </div>
          <Input label="Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={save}>Saqlash</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Bekor</Button>
          </div>
        </div>
      </Modal>

      <VoiceExpenseConfirmModal open={voiceOpen} onClose={() => setVoiceOpen(false)} onConfirm={saveVoiceConfirmed} />
    </div>
  );
}