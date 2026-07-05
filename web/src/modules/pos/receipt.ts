import type { Sale } from "@/types";
import { formatMoney } from "@/lib/money";

const SHOP_NAME = "PULT UZ";

export function openReceiptPrint(
  sale: Pick<Sale, "saleNo" | "items" | "total" | "paidAmount" | "dueAmount" | "paymentType" | "createdAt"> & {
    note?: string | null;
    /** Chekda ko'rinadigan sotuvchi ismi */
    sellerName?: string | null;
  }
) {
  const w = window.open("", "_blank", "width=420,height=800");
  if (!w) return;

  const dt = new Date(sale.createdAt).toLocaleString();
  // To'lov turi: to'liq qarzga bo'lsa — Nasiya; qisman bo'lsa — Naqd/Karta + nasiya
  const payLabel =
    Number(sale.dueAmount ?? 0) > 0
      ? Number(sale.paidAmount ?? 0) > 0
        ? `${sale.paymentType === "cash" ? "Naqd" : "Karta"} + Nasiya`
        : "Nasiya"
      : sale.paymentType === "cash"
        ? "Naqd"
        : "Karta";
  const rows = sale.items
    .map(
      (i) => `
      <tr>
        <td style="padding:4px 0">${escapeHtml(i.nameSnapshot)}</td>
        <td style="text-align:right">${formatQty(i.qty, (i as any).unitSnapshot)}</td>
        <td style="text-align:right">${money(i.unitPrice)}</td>
        <td style="text-align:right">${money(i.lineTotal)}</td>
      </tr>
    `
    )
    .join("");

  w.document.write(`
  <html>
  <head>
    <title>Chek ${sale.saleNo}</title>
    <meta charset="utf-8" />
    <style>
      body{font-family:system-ui, -apple-system, Segoe UI, Roboto; padding:14px;}
      h1{font-size:16px;margin:0 0 6px 0;}
      .muted{color:#5b6e75;font-size:12px;}
      table{width:100%; border-collapse:collapse; font-size:12px; margin-top:10px;}
      .sum{margin-top:10px; font-size:12px;}
      .line{border-top:1px dashed #b5c2bb; margin:10px 0;}
      @media print { button { display:none } }
    </style>
  </head>
  <body>
    <h1>${SHOP_NAME}</h1>
    <div class="muted">${dt}</div>
    <div class="muted">Chek: ${sale.saleNo}</div>
    <div class="muted">To'lov: ${payLabel}</div>
    ${sale.sellerName ? '<div class="muted">Sotuvchi: ' + escapeHtml(String(sale.sellerName)) + '</div>' : ""}
    ${sale.note ? '<div class="muted">Izoh: ' + escapeHtml(String(sale.note)) + '</div>' : ""}

    <div class="line"></div>

    <table>
      <thead>
        <tr>
          <th align="left">Tovar</th>
          <th align="right">Miqdor</th>
          <th align="right">Narx</th>
          <th align="right">Summa</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="line"></div>

    <div class="sum"><b>Jami:</b> ${money(sale.total)}</div>
    <div class="sum">To'landi: ${money(sale.paidAmount)}</div>
    <div class="sum">Nasiya (qarz): ${money(sale.dueAmount)}</div>

    <div class="line"></div>
    <div class="muted">${SHOP_NAME} — xaridingiz uchun rahmat!</div>

    <button onclick="window.print()" style="margin-top:10px;padding:10px 14px;border:0;border-radius:10px;background:#284B59;color:#F8FBF9;">Print</button>
  </body>
  </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

function formatQty(qty: number, unit?: string) {
  const u = (unit ?? "").trim();
  if (!u) return String(qty);
  return `${qty} ${escapeHtml(u)}`;
}

function money(n: number) {
  return formatMoney(n);
}
function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
