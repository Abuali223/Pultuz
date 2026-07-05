import type { ReportData } from "@/services/reports";

/**
 * Minimal A4 report html generator.
 * This file exists mainly so `npm run build` never fails.
 * You can replace the HTML/template as needed.
 */
export function renderReportA4(data: ReportData, shopTitle = "Hisobot") {
  const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
  return `
    <div style="font-family: Arial; padding: 24px;">
      <h2 style="margin:0 0 8px 0;">${shopTitle}</h2>
      <div style="color:#5b6e75; margin-bottom: 16px;">${new Date(data.from).toLocaleString()} - ${new Date(data.to).toLocaleString()}</div>

      <table style="width:100%; border-collapse: collapse;">
        <tr><td style="padding:6px 0;">Sotuvlar soni</td><td style="padding:6px 0; text-align:right;">${data.salesCount}</td></tr>
        <tr><td style="padding:6px 0;">Jami sotuv</td><td style="padding:6px 0; text-align:right;">${fmt(data.grossSales)}</td></tr>
        <tr><td style="padding:6px 0;">Refund</td><td style="padding:6px 0; text-align:right;">${fmt(data.refunds)}</td></tr>
        <tr><td style="padding:6px 0; font-weight:700;">Net</td><td style="padding:6px 0; text-align:right; font-weight:700;">${fmt(data.netRevenue)}</td></tr>
        <tr><td style="padding:6px 0;">Harajat</td><td style="padding:6px 0; text-align:right;">${fmt(data.expenses)}</td></tr>
        <tr><td style="padding:6px 0; font-weight:700;">Taxminiy foyda</td><td style="padding:6px 0; text-align:right; font-weight:700;">${fmt(data.approxProfit)}</td></tr>
      </table>
    </div>
  `;
}
