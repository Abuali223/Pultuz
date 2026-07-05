import { formatMoney } from "@/lib/money";
import type { ReportSummary } from "@/services/reports";

/**
 * Open A4 print window for report data (works as PDF via browser print dialog).
 */
export function openReportPrint(params: { report: ReportSummary; fromLabel: string; toLabel: string }) {
  const { report, fromLabel, toLabel } = params;
  const w = window.open("", "_blank");
  if (!w) return;

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;color:#444">${label}</td>
      <td style="padding:6px 0;text-align:right;font-weight:700">${value}</td>
    </tr>
  `;

  w.document.write(`
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Hisobot</title>
      <style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto; padding:24px; max-width: 820px; margin:0 auto;}
        h1{margin:0 0 6px 0;font-size:18px;}
        .muted{color:#666;font-size:12px;}
        table{width:100%; border-collapse:collapse; margin-top:14px; font-size:13px;}
        tr{border-bottom:1px solid #eee;}
        @media print { body{padding:0} }
      </style>
    </head>
    <body>
      <h1>Pult Uz — Hisobot</h1>
      <div class="muted">Sana: ${fromLabel} → ${toLabel}</div>

      <table>
        ${row("Savdolar soni", String(report.salesCount))}
        ${row("Umumiy savdo", formatMoney(report.grossSales))}
        ${row("Refund/Return", formatMoney(report.refunds))}
        ${row("Net daromad", formatMoney(report.netRevenue))}
        ${row("Taxminiy foyda", formatMoney(report.approxProfit))}
        ${row("Naqd kirim", formatMoney(report.cashIn))}
        ${row("Karta kirim", formatMoney(report.cardIn))}
        ${row("Naqd chiqim", formatMoney(report.cashOut))}
        ${row("Karta chiqim", formatMoney(report.cardOut))}
        ${row("Ta’minotchi to‘lovlari", formatMoney(report.supplierPaymentsOut))}
        ${row("Harajatlar", formatMoney(report.expensesOut))}
        ${row("Net kassa oqimi", formatMoney(report.netCashFlow))}
        ${row("Kirimlar soni", String(report.purchasesCount))}
        ${row("Kirimlar jami", formatMoney(report.purchasesTotal))}
      </table>

      <script>
        window.focus();
        setTimeout(() => window.print(), 400);
      </script>
    </body>
  </html>
  `);

  w.document.close();
}
