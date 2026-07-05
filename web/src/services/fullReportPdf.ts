import { getDocs, query, where } from "firebase/firestore";
import { col } from "./paths";
import { formatMoney } from "@/lib/money";
import type { Sale, Customer, CustomerPayment } from "@/types";

/**
 * To'liq PDF hisobot — barcha savdolar + mijozlar qarzi + to'lovlar.
 * ------------------------------------------------------------------
 * Faqat O'QISH (read-only). Ma'lumot Firestore'dan olinadi, hech narsa
 * o'zgartirilmaydi. Chiroyli A4 shaklda print oynasi ochiladi —
 * brauzerning "Print → Save as PDF" orqali yuklab olinadi.
 *
 * Ranglar: Forest Gold (#284B59 + oltin #D8B45A) — loyiha mavzusiga mos.
 */

// ---- HTML xavfsizligi (XSS oldini olish) ----
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDateTime(ms: unknown): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const d = new Date(n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function payLabel(t: unknown): string {
  if (t === "cash") return "Naqd";
  if (t === "card") return "Karta";
  return "—";
}

type FullReportData = {
  shopName: string;
  fromLabel: string;
  toLabel: string;
  sales: Sale[];
  customers: Customer[];
  payments: CustomerPayment[];
};

/**
 * Ma'lumotlarni Firestore'dan yig'ish (createdAt raqam — ms — bo'yicha filtrlash).
 */
async function fetchFullReport(params: {
  shopId: string;
  fromTs: number;
  toTs: number;
  shopName?: string;
  fromLabel: string;
  toLabel: string;
}): Promise<FullReportData> {
  const { shopId, fromTs, toTs } = params;

  // Sales — davr ichida, orderBy'siz (composite index kerak bo'lmasin), JS'da saralaymiz.
  const salesSnap = await getDocs(
    query(col(shopId, "sales"), where("createdAt", ">=", fromTs), where("createdAt", "<", toTs))
  );
  const sales = salesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as Sale)
    .filter((s) => s.status !== "voided")
    .sort((a, b) => toNum(a.createdAt) - toNum(b.createdAt));

  // Mijozlar — hammasi (qarz jadvali uchun).
  const custSnap = await getDocs(query(col(shopId, "customers"), where("shopId", "==", shopId)));
  const customers = custSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as Customer)
    .sort((a, b) => toNum(b.debt) - toNum(a.debt));

  // Mijoz to'lovlari — davr ichida.
  const paySnap = await getDocs(
    query(
      col(shopId, "customer_payments"),
      where("createdAt", ">=", fromTs),
      where("createdAt", "<", toTs)
    )
  );
  const payments = paySnap.docs
    .map((d) => {
      const data: any = d.data() || {};
      return {
        id: d.id,
        shopId,
        customerId: data.customerId || "",
        amount: toNum(data.amount),
        paymentType: data.paymentType,
        note: data.note || "",
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : toNum(data.createdAt),
        createdBy: data.createdBy || "",
      } as CustomerPayment;
    })
    .sort((a, b) => toNum(a.createdAt) - toNum(b.createdAt));

  return {
    shopName: params.shopName || "Pult Uz",
    fromLabel: params.fromLabel,
    toLabel: params.toLabel,
    sales,
    customers,
    payments,
  };
}

function renderHtml(data: FullReportData): string {
  const { shopName, fromLabel, toLabel, sales, customers, payments } = data;

  // Mijoz nomlarini id bo'yicha topish (to'lovlar jadvalida ko'rsatish uchun).
  const custName = new Map<string, string>();
  for (const c of customers) custName.set(c.id, c.name || "—");

  // ---- Umumiy ko'rsatkichlar ----
  const salesTotal = sales.reduce((s, x) => s + toNum(x.total), 0);
  const salesPaid = sales.reduce((s, x) => s + toNum(x.paidAmount), 0);
  const salesDue = sales.reduce((s, x) => s + toNum(x.dueAmount), 0);
  const paymentsTotal = payments.reduce((s, x) => s + toNum(x.amount), 0);
  const totalDebt = customers.reduce((s, c) => s + Math.max(0, toNum(c.debt)), 0);
  const debtorsCount = customers.filter((c) => toNum(c.debt) > 0.009).length;

  // Davr tushumi = savdo vaqtida to'langan (naqd/karta) + alohida qarz to'lovlari.
  // "Jami to'lov (davr)" faqat qarz to'lovlari edi — bu chalg'ituvchi bo'lgani uchun
  // endi to'liq tushumni ham ko'rsatamiz.
  const periodIncome = salesPaid + paymentsTotal;

  const money = (n: number) => `${formatMoney(n)} so'm`;

  // ---- Savdolar jadvali ----
  const salesRows = sales
    .map((s, i) => {
      const itemCount = Array.isArray(s.items) ? s.items.length : 0;
      const cust = s.customerNameSnapshot || (s.customerId ? custName.get(s.customerId) : "") || "—";
      const due = toNum(s.dueAmount);
      return `
        <tr>
          <td class="c">${i + 1}</td>
          <td>${esc(s.saleNo || s.id)}</td>
          <td>${esc(fmtDateTime(s.createdAt))}</td>
          <td>${esc(cust)}</td>
          <td class="c">${itemCount}</td>
          <td>${esc(payLabel(s.paymentType))}</td>
          <td class="r">${money(toNum(s.total))}</td>
          <td class="r">${money(toNum(s.paidAmount))}</td>
          <td class="r ${due > 0.009 ? "due" : ""}">${money(due)}</td>
        </tr>`;
    })
    .join("");

  const salesTable = sales.length
    ? `
      <table>
        <thead>
          <tr>
            <th class="c">#</th><th>Savdo №</th><th>Sana</th><th>Mijoz</th>
            <th class="c">Tovar</th><th>To'lov</th>
            <th class="r">Summa</th><th class="r">To'landi</th><th class="r">Qarz</th>
          </tr>
        </thead>
        <tbody>${salesRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="6" class="r b">JAMI</td>
            <td class="r b">${money(salesTotal)}</td>
            <td class="r b">${money(salesPaid)}</td>
            <td class="r b due">${money(salesDue)}</td>
          </tr>
        </tfoot>
      </table>`
    : `<div class="empty">Bu davrda savdo yo'q.</div>`;

  // ---- Mijozlar qarzi jadvali (qarzi borlar) ----
  const debtors = customers.filter((c) => toNum(c.debt) > 0.009);
  const debtRows = debtors
    .map((c, i) => {
      return `
        <tr>
          <td class="c">${i + 1}</td>
          <td>${esc(c.name || "—")}</td>
          <td>${esc(c.phone || "—")}</td>
          <td class="r">${money(toNum(c.totalBought))}</td>
          <td class="r">${money(toNum(c.totalPaid))}</td>
          <td class="r due b">${money(toNum(c.debt))}</td>
        </tr>`;
    })
    .join("");

  const debtTable = debtors.length
    ? `
      <table>
        <thead>
          <tr>
            <th class="c">#</th><th>Mijoz</th><th>Telefon</th>
            <th class="r">Jami olingan</th><th class="r">To'langan</th><th class="r">Qarz</th>
          </tr>
        </thead>
        <tbody>${debtRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="5" class="r b">JAMI QARZ</td>
            <td class="r b due">${money(totalDebt)}</td>
          </tr>
        </tfoot>
      </table>`
    : `<div class="empty">Qarzdor mijoz yo'q. ✅</div>`;

  // ---- To'lovlar jadvali ----
  const payRows = payments
    .map((p, i) => {
      const name = custName.get(p.customerId) || "—";
      return `
        <tr>
          <td class="c">${i + 1}</td>
          <td>${esc(fmtDateTime(p.createdAt))}</td>
          <td>${esc(name)}</td>
          <td>${esc(payLabel(p.paymentType))}</td>
          <td>${esc(p.note || "—")}</td>
          <td class="r b">${money(toNum(p.amount))}</td>
        </tr>`;
    })
    .join("");

  const payTable = payments.length
    ? `
      <table>
        <thead>
          <tr>
            <th class="c">#</th><th>Sana</th><th>Mijoz</th>
            <th>To'lov</th><th>Izoh</th><th class="r">Summa</th>
          </tr>
        </thead>
        <tbody>${payRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="5" class="r b">JAMI TO'LOV</td>
            <td class="r b">${money(paymentsTotal)}</td>
          </tr>
        </tfoot>
      </table>`
    : `<div class="empty">Bu davrda to'lov yo'q.</div>`;

  const printedAt = fmtDateTime(Date.now());

  return `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>To'liq hisobot — ${esc(shopName)}</title>
<style>
  :root{
    --primary:#284B59;
    --accent:#D8B45A;
    --ink:#1f2937;
    --muted:#64748b;
    --line:#e5e7eb;
    --stripe:#f6f8f9;
    --due:#b91c1c;
  }
  *{box-sizing:border-box;}
  body{
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
    color:var(--ink); margin:0; padding:28px;
    max-width:1000px; margin-left:auto; margin-right:auto;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .head{
    display:flex; justify-content:space-between; align-items:flex-start;
    border-bottom:3px solid var(--primary); padding-bottom:14px; margin-bottom:18px;
  }
  .brand{font-size:22px; font-weight:800; color:var(--primary); letter-spacing:.2px;}
  .brand .accent{color:var(--accent);}
  .sub{font-size:12px; color:var(--muted); margin-top:4px;}
  .period{
    text-align:right; font-size:12px; color:var(--muted);
  }
  .period b{color:var(--ink); font-size:13px;}

  .cards{display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:0 0 22px;}
  .card{
    border:1px solid var(--line); border-radius:10px; padding:12px 14px;
    background:linear-gradient(180deg,#fff, #fbfcfd);
  }
  .card .k{font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.4px;}
  .card .v{font-size:18px; font-weight:800; color:var(--primary); margin-top:6px;}
  .card.gold{border-color:var(--accent);}
  .card.gold .v{color:#9a7b1f;}
  .card.due .v{color:var(--due);}

  .recon{border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin:0 0 22px; background:#fbfcfd;}
  .recon-title{font-weight:800; color:var(--primary); font-size:13px; margin-bottom:8px;}
  .recon-t{width:100%; border-collapse:collapse; font-size:12.5px; margin:0;}
  .recon-t td{padding:6px 4px; border-bottom:1px dashed var(--line);}
  .recon-t tr.tot td{border-top:2px solid var(--primary); border-bottom:none; padding-top:9px; font-size:13px;}
  .recon-note{margin-top:10px; font-size:11.5px; color:var(--muted); line-height:1.55;}
  .recon-note b{color:var(--ink);}

  h2{
    font-size:15px; color:var(--primary); margin:26px 0 10px;
    padding-left:10px; border-left:4px solid var(--accent);
  }
  table{width:100%; border-collapse:collapse; font-size:12px; margin-bottom:6px;}
  thead th{
    background:var(--primary); color:#fff; text-align:left;
    padding:8px 9px; font-weight:600; font-size:11px; white-space:nowrap;
  }
  tbody td{padding:7px 9px; border-bottom:1px solid var(--line); vertical-align:top;}
  tbody tr:nth-child(even){background:var(--stripe);}
  tfoot td{padding:9px; border-top:2px solid var(--primary); font-size:12px;}
  .r{text-align:right; white-space:nowrap;}
  .c{text-align:center;}
  .b{font-weight:800;}
  .due{color:var(--due);}
  .empty{
    padding:14px; border:1px dashed var(--line); border-radius:8px;
    color:var(--muted); font-size:13px; text-align:center; background:var(--stripe);
  }

  .foot{margin-top:26px; padding-top:12px; border-top:1px solid var(--line);
    font-size:11px; color:var(--muted); display:flex; justify-content:space-between;}

  @media print{
    body{padding:0;}
    thead{display:table-header-group;}
    tfoot{display:table-footer-group;}
    tr{break-inside:avoid;}
    h2{break-after:avoid;}
    .recon, .cards{break-inside:avoid;}
    .no-print{display:none;}
  }
  .bar{
    position:sticky; top:0; background:#fff; padding:8px 0 14px; margin-bottom:6px;
    display:flex; gap:8px; border-bottom:1px solid var(--line);
  }
  .btn{
    background:var(--primary); color:#fff; border:0; border-radius:8px;
    padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer;
  }
  .btn.ghost{background:#fff; color:var(--primary); border:1px solid var(--primary);}
</style>
</head>
<body>
  <div class="bar no-print">
    <button class="btn" onclick="window.print()">🖨️ Chop etish / PDF saqlash</button>
    <button class="btn ghost" onclick="window.close()">Yopish</button>
  </div>

  <div class="head">
    <div>
      <div class="brand">${esc(shopName)} — <span class="accent">To'liq hisobot</span></div>
      <div class="sub">Savdolar · Mijozlar qarzi · To'lovlar</div>
    </div>
    <div class="period">
      Davr:<br/><b>${esc(fromLabel)} → ${esc(toLabel)}</b>
      <div style="margin-top:4px;">Tayyorlandi: ${esc(printedAt)}</div>
    </div>
  </div>

  <div class="cards">
    <div class="card"><div class="k">Savdolar soni</div><div class="v">${sales.length}</div></div>
    <div class="card"><div class="k">Jami savdo (davr)</div><div class="v">${esc(money(salesTotal))}</div></div>
    <div class="card gold"><div class="k">Davr tushumi (naqd+karta+qarz to'lov)</div><div class="v">${esc(money(periodIncome))}</div></div>
    <div class="card due"><div class="k">Joriy umumiy qarz (${debtorsCount} mijoz)</div><div class="v">${esc(money(totalDebt))}</div></div>
  </div>

  <div class="recon">
    <div class="recon-title">Hisob-kitob mosligi (davr)</div>
    <table class="recon-t">
      <tr><td>Jami savdo (davr)</td><td class="r">${money(salesTotal)}</td></tr>
      <tr><td>— shundan savdo vaqtida to'langan (naqd/karta)</td><td class="r">${money(salesPaid)}</td></tr>
      <tr><td>— shundan qarzga yozilgan (yangi qarz)</td><td class="r due">${money(salesDue)}</td></tr>
      <tr><td>Qarz to'lovlari (davr, alohida)</td><td class="r">${money(paymentsTotal)}</td></tr>
      <tr class="tot"><td>Davr tushumi = savdoda to'langan + qarz to'lovlari</td><td class="r b">${money(periodIncome)}</td></tr>
      <tr class="tot"><td>Joriy umumiy qarz (barcha mijozlar, hozirgi holat)</td><td class="r b due">${money(totalDebt)}</td></tr>
    </table>
    <div class="recon-note">
      <b>Nega "Jami savdo − to'lov = qarz" chiqmaydi?</b>
      Chunki savdolarning katta qismi sotuvda darhol naqd/karta bilan to'lanadi
      (u "qarz to'lovi"ga kirmaydi), va <b>"Joriy umumiy qarz"</b> — bu hozirgi paytda
      barcha mijozlarning jami qarzi (butun tarix bo'yicha, oldingi davrlardan qolgan qarz ham),
      shuning uchun u faqat shu davr savdosidan chiqmaydi. Qarzning davr ichidagi harakati:
      yangi qarz <b>+${money(salesDue)}</b>, qaytgani <b>−${money(paymentsTotal)}</b>.
    </div>
  </div>

  <h2>1. Savdolar (${sales.length})</h2>
  ${salesTable}

  <h2>2. Mijozlar qarzi (${debtors.length})</h2>
  ${debtTable}

  <h2>3. Mijoz to'lovlari (${payments.length})</h2>
  ${payTable}

  <div class="foot">
    <span>Pult Uz — avtomatik hisobot</span>
    <span>${esc(fromLabel)} → ${esc(toLabel)}</span>
  </div>

  <script>
    window.focus();
  </script>
</body>
</html>`;
}

/**
 * Asosiy funksiya — UI'dan chaqiriladi.
 * Print oynasini darhol ochadi (popup-blocker'dan qochish uchun),
 * keyin ma'lumot yig'ilgach ichini to'ldiradi.
 */
export async function downloadFullReport(params: {
  shopId: string;
  fromTs: number;
  toTs: number;
  fromLabel: string;
  toLabel: string;
  shopName?: string;
}): Promise<void> {
  // Popup blocker'dan qochish: oynani foydalanuvchi bosgan zahoti ochamiz.
  const w = window.open("", "_blank");
  if (!w) {
    throw new Error("Popup bloklandi. Iltimos, brauzerda popup'ga ruxsat bering.");
  }
  w.document.write(
    `<!doctype html><meta charset="utf-8"><title>Hisobot tayyorlanmoqda…</title>` +
      `<div style="font-family:system-ui;padding:40px;color:#284B59;font-size:16px">Hisobot tayyorlanmoqda…</div>`
  );

  try {
    const data = await fetchFullReport({
      shopId: params.shopId,
      fromTs: params.fromTs,
      toTs: params.toTs,
      shopName: params.shopName,
      fromLabel: params.fromLabel,
      toLabel: params.toLabel,
    });
    w.document.open();
    w.document.write(renderHtml(data));
    w.document.close();
  } catch (e: any) {
    w.document.open();
    w.document.write(
      `<!doctype html><meta charset="utf-8"><div style="font-family:system-ui;padding:40px;color:#b91c1c">` +
        `Xato: ${esc(e?.message ?? "Hisobotni yuklab bo'lmadi")}</div>`
    );
    w.document.close();
    throw e;
  }
}
