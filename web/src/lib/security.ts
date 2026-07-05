export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Hash PIN with a stable per-shop salt so the same PIN in different shops
// does not produce identical hashes.
export async function hashAdminPin(params: { shopId: string; pin: string }): Promise<string> {
  const pin = String(params.pin ?? "").trim();
  const shopId = String(params.shopId ?? "").trim();
  return sha256Hex(`ali-biznes|${shopId}|${pin}`);
}
