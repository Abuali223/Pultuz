export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Human-friendly money formatting (no currency symbol).
// Ko‘rinish: 1 000 000.00 (minglik ajratgich - oddiy bo‘sh joy)
// Intl ba'zi brauzerlarda ajratgichni "," yoki NBSP qilib yuborishi mumkin,
// shuning uchun formatni o'zimiz qat'iy belgilaymiz.
export function formatMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  const neg = safe < 0;
  const abs = Math.abs(safe);
  const fixed = round2(abs).toFixed(2); // "1234.50"
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${grouped}.${decPart}`;
}

// Format for inputs: keeps only digits and optional decimal separator, groups thousands with spaces.
export function formatMoneyInput(raw: string): string {
  const s0 = String(raw ?? "");
  // allow digits and one decimal separator (.,,)
  let s = s0.replace(/[^0-9.,]/g, "");
  const firstSep = s.search(/[.,]/);
  let intPart = s;
  let decPart = "";
  if (firstSep >= 0) {
    intPart = s.slice(0, firstSep);
    decPart = s.slice(firstSep + 1).replace(/[.,]/g, "");
    // limit 2 decimals
    decPart = decPart.slice(0, 2);
  }
  // remove leading zeros but keep single zero
  intPart = intPart.replace(/^0+(?=\d)/, "");
  // group thousands with spaces
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return decPart.length > 0 ? `${grouped}.${decPart}` : grouped;
}

export function parseMoneyInput(formatted: string): number {
  const s = String(formatted ?? "").trim().replace(/\s/g, "").replace(/,/g, ".");
  const num = Number(s);
  return Number.isFinite(num) ? num : 0;
}

// ---- Aliases (backward compatibility across pages) ----
// Some earlier revisions imported these names. Keep them to avoid regressions.
export const fmtMoney = formatMoney;
export const formatMoneyTyping = formatMoneyInput;
export const parseMoney = parseMoneyInput;
