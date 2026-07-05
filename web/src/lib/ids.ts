// FIX #8: Entropiya 4 hex -> 8 hex ga oshirildi (4 hex = 65536, 8 hex = ~4 milliard variant)
export function makeSaleNo(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `S-${yyyy}${mm}${dd}-${rand}`;
}

export function makePurchaseNo(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `P-${yyyy}${mm}${dd}-${rand}`;
}
