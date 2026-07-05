import * as admin from "firebase-admin";

export type TgSendOpts = {
  token: string;
  chatId: string | number;
  text: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  replyMarkup?: any;
  disableWebPreview?: boolean;
};

/**
 * Reads Telegram token from Firebase Secret.
 * 
 * Set it with:
 *   firebase functions:secrets:set TELEGRAM_TOKEN
 */
export function getTelegramToken(): string {
  return String(process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
}


export type ShopTelegramPrivate = {
  botToken: string;
  secret: string;
  botUsername?: string;
  botId?: string;
};

/**
 * Per-shop Telegram bot token (SaaS).
 * Stored server-side only:
 *   shops/{shopId}/private/telegram
 *
 * Client MUST NOT have access to this doc (rules deny).
 */
export async function getShopTelegramPrivate(
  db: FirebaseFirestore.Firestore,
  shopId: string
): Promise<ShopTelegramPrivate | null> {
  const ref = db.doc(`shops/${shopId}/private/telegram`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data() as any;
  return {
    botToken: String(d?.botToken || "").trim(),
    secret: String(d?.secret || "").trim(),
    botUsername: d?.botUsername ? String(d.botUsername) : undefined,
    botId: d?.botId ? String(d.botId) : undefined,
  };
}

export async function getShopTelegramToken(
  db: FirebaseFirestore.Firestore,
  shopId: string
): Promise<string> {
  const priv = await getShopTelegramPrivate(db, shopId);
  return priv?.botToken || getTelegramToken();
}

export async function getShopTelegramSecret(
  db: FirebaseFirestore.Firestore,
  shopId: string
): Promise<string> {
  const priv = await getShopTelegramPrivate(db, shopId);
  return priv?.secret || "";
}

export function normPhone(input: string): string {
  // Normalize any phone format to a comparable "digits-only" form.
  // - removes all non-digits
  // - fixes local Uzbek numbers (9 digits) by prefixing 998
  // - removes leading zeros
  let digits = String(input ?? "").replace(/\D/g, "");

  // Remove leading zeros (e.g. 0xx...)
  digits = digits.replace(/^0+/, "");

  // If user sent local number without country code (9 digits), add Uzbekistan code.
  if (digits.length === 9) {
    digits = "998" + digits;
  }

  return digits.trim();
}


function canonicalPhoneNorm(phone: string): string {
  const digits = normPhone(phone);
  if (!digits) return "";
  const last9 = digits.slice(-9);
  return "998" + last9;
}

function phoneVariants(phone: string): string[] {
  const digits = normPhone(phone);
  if (!digits) return [];
  const last9 = digits.slice(-9);
  const vars = new Set<string>();
  vars.add(digits);
  vars.add(last9);
  vars.add("998" + last9);
  if (digits.startsWith("998")) vars.add(digits.slice(3));
  return Array.from(vars).filter(Boolean).slice(0, 10);
}


export function formatMoneyUZS(n: number): string {
  const x = Math.round(Number(n || 0));
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export async function tgSendMessage(opts: TgSendOpts): Promise<any> {
  const url = `https://api.telegram.org/bot${opts.token}/sendMessage`;

  const body: any = {
    chat_id: opts.chatId,
    text: opts.text,
    disable_web_page_preview: opts.disableWebPreview ?? true,
  };
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json?.ok === false) {
    throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
  }
  return json;
}

// Send a PDF (or any Buffer) as a Telegram document.
// Uses built-in fetch + FormData available in Node 20.
export async function tgSendDocument(opts: {
  token: string;
  chatId: string | number;
  filename: string;
  pdfBuffer: Buffer;
  caption?: string;
}): Promise<any> {
  const url = `https://api.telegram.org/bot${opts.token}/sendDocument`;

  const form = new FormData();
  form.append("chat_id", String(opts.chatId));
  if (opts.caption) form.append("caption", opts.caption);

  // Node's FormData expects Blob/File parts. In TS, Buffer<...> can fail BlobPart typing,
  // so convert Buffer -> Uint8Array view explicitly.
  const bytes = new Uint8Array(
    opts.pdfBuffer.buffer as ArrayBuffer,
    opts.pdfBuffer.byteOffset,
    opts.pdfBuffer.byteLength
  );
  const blob = new Blob([bytes], { type: "application/pdf" });
  form.append("document", blob, opts.filename);

  const resp = await fetch(url, {
    method: "POST",
    body: form as any,
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json?.ok === false) {
    throw new Error(`Telegram sendDocument failed: ${JSON.stringify(json)}`);
  }
  return json;
}

export async function getTelegramSettings(db: FirebaseFirestore.Firestore, shopId: string) {
  const ref = db.doc(`shops/${shopId}/settings/telegram`);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() as any) : {};
  return {
    enabled: Boolean(data?.enabled ?? false),
    ownerChatId: data?.ownerChatId ? String(data.ownerChatId) : "",
    notifyCustomer: Boolean(data?.notifyCustomer ?? true),
  };
}

export async function linkCustomerTelegram(params: {
  db: FirebaseFirestore.Firestore;
  shopId: string;
  phone: string;
  chatId: number;
  tgUserId: number;
  tgName?: string;
}): Promise<
  | { ok: true; customerId: string; customerName: string }
  | { ok: false; reason: string }
> {
  const { db, shopId, phone, chatId, tgUserId, tgName } = params;
  const p = normPhone(phone);
  if (!p) return { ok: false, reason: "Telefon raqam topilmadi" };

  // 1) Try exact match on phoneNorm
  const col = db.collection(`shops/${shopId}/customers`);
  const qs = await col.where("phoneNorm", "==", p).limit(1).get();

  // NOTE: qs.docs[0] can be undefined when no docs are found.
  // Keep the type explicitly optional so later assignments from `.find()` won't fail TS.
  let docSnap:
    | FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
    | undefined = qs.docs[0] ?? undefined;

  // 2) Fallback: scan small sample and compare normalized phone field
  // Some old data used other field names like `telefon` / `phoneNumber`.
  if (!docSnap) {
    const scan = await col.limit(300).get();
    docSnap = scan.docs.find((d) => {
      const data = d.data() as any;
      const raw =
        data?.phone ??
        data?.telefon ??
        data?.tel ??
        data?.phoneNumber ??
        data?.mobile ??
        "";
      const ph = normPhone(String(raw));
      return ph === p;
    });
  }

  if (!docSnap) {
    return { ok: false, reason: "Bu telefon raqam bilan mijoz topilmadi. Kassadan mijozni oldin qo'shing." };
  }

  const cust = docSnap.data() as any;
  await docSnap.ref.set(
    {
      phoneNorm: p,
      telegramChatId: String(chatId),
      telegramUserId: String(tgUserId),
      telegramName: tgName ?? null,
      telegramLinkedAt: Date.now(),
      updatedAt: Date.now(),
    },
    { merge: true }
  );

  return { ok: true, customerId: docSnap.id, customerName: String(cust?.name ?? "") };
}

export async function ensureTelegramDefaultSettings(db: FirebaseFirestore.Firestore, shopId: string) {
  const ref = db.doc(`shops/${shopId}/settings/telegram`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(
      {
        enabled: false,
        notifyCustomer: true,
        ownerChatId: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }
}
