// Simple EAN-13 generator (offline, not guaranteed unique)
// Use for internal barcode creation. Uniqueness is checked before saving.
function checksum(d12: string) {
  // EAN-13 checksum: sum of odd positions + 3*sum of even positions (from left, positions 1..12)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(d12[i] || 0);
    const pos = i + 1;
    sum += pos % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10;
}

export function generateEAN13(prefix = "200") {
  const p = String(prefix).replace(/\D/g, "").slice(0, 3).padEnd(3, "2");
  let body = p;
  // generate next 9 digits
  for (let i = 0; i < 9; i++) body += String(Math.floor(Math.random() * 10));
  const c = checksum(body);
  return body + String(c);
}
