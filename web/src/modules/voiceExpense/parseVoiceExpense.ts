import { z } from "zod";
import type { PaymentType } from "@/types";

export const voiceExpenseConfirmSchema = z.object({
  transcript: z.string().min(2, "Matn juda qisqa"),
  amount: z.number().positive("Summa 0 dan katta bo'lishi kerak"),
  category: z.string().min(2, "Kategoriya kerak"),
  paymentType: z.enum(["cash", "card"]),
  note: z.string().max(300).optional().default(""),
});

export type VoiceExpenseConfirm = z.infer<typeof voiceExpenseConfirmSchema>;

const UZ_NUMBERS: Record<string, number> = {
  nol: 0,
  bir: 1,
  bitta: 1,
  ikki: 2,
  uch: 3,
  tort: 4,
  "to'rt": 4,
  besh: 5,
  olti: 6,
  yetti: 7,
  sakkiz: 8,
  toqqiz: 9,
  toqqizta: 9,
  on: 10,
  "o'n": 10,
  yigirma: 20,
  ottiz: 30,
  "o'ttiz": 30,
  qirq: 40,
  ellik: 50,
  oltmish: 60,
  yetmish: 70,
  sakson: 80,
  toqson: 90,
};

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ʻ|’|`/g, "'")
    .replace(/[^a-z0-9\u0400-\u04FF'\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumericAmount(text: string): number | null {
  const m = text.match(/(\d[\d\s.,]*)/);
  if (!m) return null;

  // 20 000 / 20,000 / 20.000 -> 20000
  const cleaned = m[1].replace(/[^\d]/g, "");
  if (!cleaned) return null;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseWordAmount(text: string): number | null {
  const t = normalizeText(text);
  const words = t.split(" ");

  let total = 0;
  let current = 0;
  let seen = false;

  for (const w of words) {
    if (UZ_NUMBERS[w] != null) {
      current += UZ_NUMBERS[w];
      seen = true;
      continue;
    }

    if (w === "yuz") {
      current = (current || 1) * 100;
      seen = true;
      continue;
    }

    if (w === "ming") {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
      continue;
    }

    if (w === "million") {
      total += (current || 1) * 1_000_000;
      current = 0;
      seen = true;
      continue;
    }
  }

  const result = total + current;
  return seen && result > 0 ? result : null;
}

function guessCategory(text: string): string {
  const t = normalizeText(text);

  if (/\bnonga?\b|\bqaymoq\b|\bovqat\b|\bnon\b/.test(t)) return "Oziq-ovqat";
  if (/\byol\b|\btaksi\b|\bbenzin\b|\btransport\b/.test(t)) return "Transport";
  if (/\bijara\b|\barenda\b/.test(t)) return "Ijara";
  if (/\bmaosh\b|\bish haqi\b/.test(t)) return "Ish haqi";
  if (/\bsvet\b|\bgaz\b|\bsuv\b|\bkomunal\b/.test(t)) return "Kommunal";

  return "Boshqa";
}

function guessPaymentType(text: string): PaymentType {
  const t = normalizeText(text);
  if (/\bkarta\b|\bterminal\b|\bcard\b/.test(t)) return "card";
  return "cash";
}

export function parseVoiceExpenseTranscript(transcript: string): VoiceExpenseConfirm {
  const normalized = transcript.trim();

  const amount = parseNumericAmount(normalized) ?? parseWordAmount(normalized) ?? 0;

  const parsed: VoiceExpenseConfirm = {
    transcript: normalized,
    amount,
    category: guessCategory(normalized),
    paymentType: guessPaymentType(normalized),
    note: normalized,
  };

  return voiceExpenseConfirmSchema.parse(parsed);
}
