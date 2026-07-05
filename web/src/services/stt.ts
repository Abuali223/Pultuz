import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

/**
 * Frontend STT client for UzbekVoice.
 *
 * Calls Firebase Callable: `sttUzbekVoice` (functions/src/index.ts)
 * which expects `{ base64Audio, mimeType, fileName, language }`.
 */

export type SttOk = {
  ok: true;
  text: string;
  confidence?: number | null;
  raw?: any;
};

export type SttFail = {
  ok: false;
  error: string;
  raw?: any;
};

export type SttResult = SttOk | SttFail;

export type SttRequest =
  | {
      blob: Blob;
      fileName?: string;
      mimeType?: string;
      language?: string;
      blocking?: boolean;
    }
  | {
      base64Audio: string;
      fileName?: string;
      mimeType?: string;
      language?: string;
      blocking?: boolean;
    };

function guessExt(mimeType?: string): string {
  const mt = (mimeType || "").toLowerCase();
  if (mt.includes("mp4")) return "mp4";
  if (mt.includes("mpeg")) return "mp3";
  if (mt.includes("wav")) return "wav";
  if (mt.includes("ogg")) return "ogg";
  if (mt.includes("webm")) return "webm";
  return "webm";
}

async function blobToBase64(blob: Blob): Promise<string> {
  // DataURL -> strip prefix up to comma
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const out = String(r.result || "");
      const comma = out.indexOf(",");
      resolve(comma >= 0 ? out.slice(comma + 1) : out);
    };
    r.onerror = () => reject(r.error || new Error("FileReader error"));
    r.readAsDataURL(blob);
  });
}

/**
 * Main API used by UI.
 * Accepts either a Blob (recorded audio) OR already-base64 audio.
 */
export async function transcribeUzbekVoice(req: SttRequest): Promise<SttResult> {
  try {
    const language = ("language" in req ? req.language : undefined) || "uz";

    let base64Audio: string;
    let mimeType: string | undefined;
    let fileName: string | undefined;

    if ("blob" in req) {
      mimeType = req.mimeType || req.blob.type || "audio/webm";
      fileName = req.fileName || `audio.${guessExt(mimeType)}`;
      base64Audio = await blobToBase64(req.blob);
    } else {
      base64Audio = req.base64Audio;
      mimeType = req.mimeType || "audio/webm";
      fileName = req.fileName || `audio.${guessExt(mimeType)}`;
    }

    const call = httpsCallable(functions, "sttUzbekVoice");
    const res = await call({ base64Audio, mimeType, fileName, language });
    const data: any = (res as any)?.data;

    const transcript =
      (typeof data?.transcript === "string" && data.transcript) ||
      (typeof data?.text === "string" && data.text) ||
      (typeof data?.result?.transcript === "string" && data.result.transcript) ||
      "";

    if (!transcript.trim()) {
      return { ok: false, error: "STT natija bo'sh qaytdi", raw: data };
    }

    return {
      ok: true,
      text: transcript.trim(),
      confidence: typeof data?.confidence === "number" ? data.confidence : null,
      raw: data,
    };
  } catch (e: any) {
    const msg = String(e?.message || e || "STT xatoligi");
    return { ok: false, error: msg };
  }
}

/** Convenience wrapper for expense flow */
export async function transcribeExpenseAudio(
  blob: Blob,
  opts?: { language?: string; fileName?: string; mimeType?: string }
): Promise<SttResult> {
  return transcribeUzbekVoice({ blob, ...opts });
}
