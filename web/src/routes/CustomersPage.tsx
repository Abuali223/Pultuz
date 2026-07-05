import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { useToast } from "@/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { createCustomer, listCustomers, updateCustomer } from "@/services/customers";
import type { Customer } from "@/types";
import { formatMoney } from "@/lib/money";

export function CustomersPage() {
  const toast = useToast();
  const { shopId } = useAuth();
  const [params] = useSearchParams();
  const [items, setItems] = React.useState<Customer[]>([]);
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(params.get("new") === "1");

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editPhone, setEditPhone] = React.useState("");
  const [fixingPhones, setFixingPhones] = React.useState(false);

  async function refresh() {
    try {
      const list = await listCustomers(shopId);
      setItems(list);
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  async function save() {
    if (!name.trim() || !phone.trim()) {
      toast.push("Ism va telefon shart", "error");
      return;
    }
    try {
      await createCustomer(shopId, { name: name.trim(), phone: phone.trim() });
      toast.push("Mijoz qo'shildi", "success");
      setOpen(false);
      setName("");
      setPhone("");
      refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setEditName(c.name ?? "");
    setEditPhone(c.phone ?? "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editName.trim() || !editPhone.trim()) {
      toast.push("Ism va telefon shart", "error");
      return;
    }
    try {
      await updateCustomer(shopId, editing.id, { name: editName.trim(), phone: editPhone.trim() } as any);
      toast.push("Mijoz yangilandi", "success");
      setEditOpen(false);
      setEditing(null);
      refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    }
  }

  async function fixAllPhones() {
    if (!shopId) return;
    setFixingPhones(true);
    try {
      const list = await listCustomers(shopId);
      let changed = 0;
      for (const c of list) {
        const norm = String(c.phone ?? "").replace(/\D/g, "").replace(/^0/, "").trim();
        const old = String((c as any).phoneNorm ?? "").replace(/\D/g, "").replace(/^0/, "").trim();
        if (norm && norm !== old) {
          await updateCustomer(shopId, c.id, { phoneNorm: norm } as any);
          changed++;
        }
      }
      toast.push(changed ? `Telefonlar tuzatildi: ${changed}` : "Hamma telefonlar toza", "success");
      refresh();
    } catch (e: any) {
      toast.push(e?.message ?? "Xato", "error");
    } finally {
      setFixingPhones(false);
    }
  }


  const qLower = q.toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const filtered = items.filter((c) => {
    const s = (c.name + " " + c.phone + " " + (c.phoneNorm ?? "")).toLowerCase();
    if (s.includes(qLower)) return true;
    if (qDigits && String(c.phoneNorm ?? "").includes(qDigits)) return true;
    return false;
  });

  return (
    <div className="space-y-4">
      <Card
        title="Mijozlar"
        right={
          <div className="flex items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidiruv: ism/telefon" />
            <Button variant="outline" size="sm" loading={fixingPhones} onClick={fixAllPhones}>Telefonlarni tuzatish</Button>
            <Button onClick={() => setOpen(true)}>+ Qo'shish</Button>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">Mijoz topilmadi.</div>
        ) : (
          <>
            {/* Desktop/table view */}
            <div className="hidden overflow-x-auto">
              <table className="ali-table">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2">Mijoz</th>
                    <th>Telefon</th>
                    <th className="text-right">Jami oldi</th>
                    <th className="text-right">Jami berdi</th>
                    <th className="text-right">Qarz</th>
                    <th className="text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-t border-border/40">
                      <td className="py-2 font-medium">{c.name}</td>
                      <td className="text-xs text-muted-foreground">{c.phone}</td>
                      <td className="text-right">{formatMoney(c.totalBought ?? 0)}</td>
                      <td className="text-right">{formatMoney(c.totalPaid ?? 0)}</td>
                      <td className={`text-right ${c.debt > 0 ? "text-destructive font-semibold" : ""}`}>{formatMoney(c.debt ?? 0)}</td>
                      <td className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                          <Link to={`/customers/${c.id}`} className="text-sm underline self-center">Tarix</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile/card view */}
            <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((c) => (
                <div key={c.id} className="border border-border/60 rounded-2xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold leading-tight">{c.name}</div>
                      <div className="text-xs text-muted-foreground break-all mt-0.5">{c.phone}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button>
                      <Link to={`/customers/${c.id}`} className="text-sm underline self-center">Tarix</Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                    <div className="rounded-xl bg-muted/40 p-2">
                      <div className="text-[11px] text-muted-foreground">Jami oldi</div>
                      <div className="font-semibold">{formatMoney(c.totalBought ?? 0)}</div>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-2">
                      <div className="text-[11px] text-muted-foreground">Jami berdi</div>
                      <div className="font-semibold">{formatMoney(c.totalPaid ?? 0)}</div>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-2">
                      <div className="text-[11px] text-muted-foreground">Qarz</div>
                      <div className={`font-semibold ${c.debt > 0 ? "text-destructive" : ""}`}>{formatMoney(c.debt ?? 0)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Modal open={open} title="Mijoz qo'shish" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Input label="Ism" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={save}>Saqlash</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Bekor</Button>
          </div>
        </div>
      </Modal>
    
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Mijozni tahrirlash">
        <div className="space-y-3">
          <Input label="Ism" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Input label="Telefon" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Bekor</Button>
            <Button onClick={saveEdit}>Saqlash</Button>
          </div>
        </div>
      </Modal>
</div>
  );
}