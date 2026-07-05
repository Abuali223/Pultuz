import React from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { useToast } from "@/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { createSupplier, listSuppliers, createSupplierPayment, listSupplierPayments } from "@/services/suppliers";
import type { Supplier, PaymentType, SupplierPayment } from "@/types";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "@/lib/money";

export function SuppliersPage() {
  const toast = useToast();
  const { shopId, user } = useAuth();

  const [items, setItems] = React.useState<Supplier[]>([]);
  const [payments, setPayments] = React.useState<SupplierPayment[]>([]);
  const [open, setOpen] = React.useState(false);

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [note, setNote] = React.useState("");

  const [payOpen, setPayOpen] = React.useState<Supplier | null>(null);
  const [payAmountText, setPayAmountText] = React.useState("0");
  const [payType, setPayType] = React.useState<PaymentType>("cash");
  const [payNote, setPayNote] = React.useState("");

  async function refresh() {
    const s = await listSuppliers(shopId);
    setItems(s);
    const p = await listSupplierPayments(shopId);
    setPayments(p.slice(0, 80));
  }

  React.useEffect(() => {
    refresh();
  }, []);

  async function addSupplier() {
    try {
      if (!name.trim()) return toast.push("Ism majburiy", "error");
      await createSupplier({ shopId, name: name.trim(), phone: phone.trim() || undefined, note: note.trim() || undefined });
      toast.push("Ta'minotchi qo'shildi", "success");
      setOpen(false);
      setName("");
      setPhone("");
      setNote("");
      refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  async function pay() {
    if (!user || !payOpen) return;
    try {
      await createSupplierPayment({
        shopId,
        supplierId: payOpen.id,
        amount: parseMoneyInput(payAmountText),
        paymentType: payType,
        note: payNote,
        actorId: user.uid,
      });
      toast.push("To'lov yozildi", "success");
      setPayOpen(null);
      setPayAmountText("0");
      setPayNote("");
      refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Ta'minotchilar" right={<Button onClick={() => setOpen(true)}>+ Ta'minotchi</Button>}>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">Hozircha ta'minotchi yo'q.</div>
        ) : (
          <div className="space-y-4">
            {/* Desktop/Table */}
            <div className="hidden overflow-x-auto">
              <table className="ali-table ali-gap-st">
              <thead>
                <tr className="hidden sm:table-row text-left text-xs text-muted-foreground">
                  <th className="py-2">Ism</th>
                  <th>Telefon</th>
                  <th className="text-right">Jami kirim</th>
                  <th className="text-right">Jami to'lov</th>
                  <th className="text-right">Qarz</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-t border-border/40">
                    <td className="py-2 font-medium">
                      <div className="font-medium">{s.name}</div>
                      <div className="sm:hidden mt-1 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">Telefon:</span> {s.phone ?? "—"}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell text-xs text-muted-foreground">{s.phone ?? "—"}</td>

                    <td className="text-right">
                      <div className="ali-mobile-label">Jami kirim</div>
                      <div>{formatMoney(s.totalPurchased || 0)}</div>
                    </td>
                    <td className="text-right">
                      <div className="ali-mobile-label">Jami to'lov</div>
                      <div>{formatMoney(s.totalPaid || 0)}</div>
                    </td>
                    <td className={`text-right ${Number(s.balance || 0) > 0 ? "text-destructive font-semibold" : ""}`}>
                      <div className="ali-mobile-label">Qarz</div>
                      <div>{formatMoney(s.balance || 0)}</div>
                    </td>
                    <td className="text-right">
                      <Button variant="ghost" onClick={() => setPayOpen(s)}>To'lov</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>

            {/* Mobile/Cards */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => (
                <div key={s.id} className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground break-words mt-0.5">{s.phone ?? "—"}</div>
                    </div>
                    <Button variant="ghost" onClick={() => setPayOpen(s)}>To'lov</Button>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 text-sm">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Jami kirim</div>
                      <div className="font-medium">{formatMoney(s.totalPurchased || 0)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Jami to'lov</div>
                      <div className="font-medium">{formatMoney(s.totalPaid || 0)}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] text-muted-foreground">Qarz</div>
                      <div className={`font-semibold ${Number(s.balance || 0) > 0 ? "text-destructive" : ""}`}>{formatMoney(s.balance || 0)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Payments */}
            <div className="mt-2">
              <div className="text-xs text-muted-foreground">So'nggi to'lovlar:</div>
              {/* Desktop */}
              <div className="hidden overflow-x-auto mt-2">
                <table className="ali-table ali-gap-st">
                <thead>
                  <tr className="hidden sm:table-row text-left text-xs text-muted-foreground">
                    <th className="py-2">Sana</th>
                    <th>Ta'minotchi</th>
                    <th className="text-right">Summa</th>
                    <th className="px-4 text-left w-24 pl-8">To'lov</th>
                    <th>Izoh</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t border-border/40">
                      <td className="py-2">
                        <div className="text-xs">{new Date(p.createdAt).toLocaleString()}</div>
                      </td>
                      <td className="text-xs">
                        <div className="font-medium text-foreground">{p.supplierNameSnapshot ?? p.supplierId}</div>
                        <div className="sm:hidden mt-1 text-[11px] text-muted-foreground space-y-0.5">
                          <div><span className="font-medium text-foreground/80">To'lov:</span> {p.paymentType === "cash" ? "Naqd" : "Karta"}</div>
                          {p.note ? <div><span className="font-medium text-foreground/80">Izoh:</span> {p.note}</div> : null}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="ali-mobile-label">Summa</div>
                        <div>{formatMoney(Number(p.amount))}</div>
                      </td>
                      <td className="hidden sm:table-cell text-xs text-muted-foreground">{p.paymentType === "cash" ? "Naqd" : "Karta"}</td>
                      <td className="hidden sm:table-cell text-xs text-muted-foreground">{p.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {payments.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
                    <div className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</div>
                    <div className="mt-1 font-semibold">{p.supplierNameSnapshot ?? p.supplierId}</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 text-sm">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Summa</div>
                        <div className="font-medium">{formatMoney(Number(p.amount))}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">To'lov</div>
                        <div className="font-medium">{p.paymentType === "cash" ? "Naqd" : "Karta"}</div>
                      </div>
                      {p.note ? (
                        <div className="col-span-2">
                          <div className="text-[11px] text-muted-foreground">Izoh</div>
                          <div className="break-words">{p.note}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Modal open={open} title="Yangi ta'minotchi" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <div>
            <div className="hidden sm:block text-xs text-muted-foreground">Ism</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Asror aka" />
          </div>
          <div>
            <div className="hidden sm:block text-xs text-muted-foreground">Telefon</div>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998..." />
          </div>
          <div>
            <div className="hidden sm:block text-xs text-muted-foreground">Izoh</div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ixtiyoriy" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Bekor</Button>
            <Button onClick={addSupplier}>Saqlash</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!payOpen} title="Ta'minotchiga to'lov" onClose={() => setPayOpen(null)}>
        {payOpen ? (
          <div className="space-y-3">
            <div className="text-sm"><b>{payOpen.name}</b> ({payOpen.phone ?? "telefon yo'q"})</div>
            <div className="hidden sm:block text-xs text-muted-foreground">Qarz: <b className="text-destructive">{formatMoney(payOpen.balance || 0)}</b></div>

            <div>
              <div className="hidden sm:block text-xs text-muted-foreground">Summa</div>
              <Input label="Summa" inputMode="decimal" value={payAmountText} onChange={(e) => setPayAmountText(formatMoneyInput(e.target.value))} />
            </div>

            <div>
              <div className="hidden sm:block text-xs text-muted-foreground">To'lov turi</div>
              <select className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
                value={payType}
                onChange={(e) => setPayType(e.target.value as PaymentType)}
              >
                <option value="cash">Naqd</option>
                <option value="card">Karta</option>
              </select>
            </div>

            <div>
              <div className="hidden sm:block text-xs text-muted-foreground">Izoh</div>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="ixtiyoriy" />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPayOpen(null)}>Bekor</Button>
              <Button onClick={pay}>To'lovni yozish</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}