import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import { parseVoiceExpenseTranscript, type VoiceExpenseConfirm } from "./parseVoiceExpense";
import { transcribeUzbekVoice } from "@/services/stt";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: VoiceExpenseConfirm) => Promise<void> | void;
};

const SAMPLE_1 = "nonga o'n ming ishlatdim";
const SAMPLE_2 = "20 000 ga qaymoq oldim";

export function VoiceExpenseConfirmModal({ open, onClose, onConfirm }: Props) {
  const [transcript, setTranscript] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState("Boshqa");
  const [paymentType, setPaymentType] = useState<"cash" | "card">("cash");
  const [note, setNote] = useState("");

  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!open) {
      setTranscript("");
      setAmount(0);
      setCategory("Boshqa");
      setPaymentType("cash");
      setNote("");
      setRecording(false);
      setUploading(false);
      setSaving(false);
      setErr("");
      setAudioBlob(null);
    }
  }, [open]);

  useEffect(() => {
    if (!audioBlob) return;

    let cancelled = false;
    const run = async () => {
      setUploading(true);
      setErr("");
      try {
        const res = await transcribeUzbekVoice({
          blob: audioBlob,
          fileName: `expense-${Date.now()}.webm`,
          mimeType: audioBlob.type || "audio/webm",
          language: "uz",
          blocking: true,
        });

        if (cancelled) return;

        if (!res.ok) {
          setErr(res.error || "STT xatoligi");
          return;
        }

        const t = (res.text || "").trim();
        setTranscript(t);

        if (t) {
          try {
            const parsed = parseVoiceExpenseTranscript(t);
            setAmount(parsed.amount);
            setCategory(parsed.category);
            setPaymentType(parsed.paymentType);
            setNote(parsed.note || t);
          } catch {
            // User manually to'g'rilaydi
          }
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "STT xatolik");
      } finally {
        if (!cancelled) setUploading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [audioBlob]);

  const canRecord = useMemo(() => {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }, []);

  const startRecording = async () => {
    try {
      setErr("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mr.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          setAudioBlob(blob);
        } finally {
          stream.getTracks().forEach((t) => t.stop());
        }
      };

      mr.start();
      setRecording(true);
    } catch (e: any) {
      setErr(e?.message || "Mikrofonni ochib bo'lmadi");
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    }
    setRecording(false);
  };

  const parseNow = () => {
    setErr("");
    try {
      const parsed = parseVoiceExpenseTranscript(transcript);
      setAmount(parsed.amount);
      setCategory(parsed.category);
      setPaymentType(parsed.paymentType);
      setNote(parsed.note || transcript);
    } catch (e: any) {
      setErr(e?.message || "Parse xatoligi");
    }
  };

  const applySample = (value: string) => {
    setTranscript(value);
    try {
      const parsed = parseVoiceExpenseTranscript(value);
      setAmount(parsed.amount);
      setCategory(parsed.category);
      setPaymentType(parsed.paymentType);
      setNote(parsed.note || value);
      setErr("");
    } catch (e: any) {
      setErr(e?.message || "Parse xatoligi");
    }
  };

  const submit = async () => {
    setSaving(true);
    setErr("");
    try {
      const confirmed = {
        transcript: transcript.trim(),
        amount: Number(amount || 0),
        category: (category || "Boshqa").trim(),
        paymentType,
        note: (note || "").trim(),
      };

      await onConfirm(confirmed);
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Saqlashda xatolik");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-3">
      <div className="w-full max-w-[640px] rounded-2xl border bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-extrabold">Ovozli harajat (tasdiqlash)</h3>
          <button className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Yopish
          </button>
        </div>

        <div className="mb-3 rounded-xl border p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={!canRecord || uploading}
                className="rounded-xl border bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-50"
              >
                🎙️ Ovoz yozishni boshlash
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="rounded-xl border border-red-200 bg-red-600 px-4 py-2 font-bold text-white"
              >
                ⏹️ To‘xtatish va matnga aylantirish
              </button>
            )}

            <button
              type="button"
              onClick={() => applySample(SAMPLE_1)}
              className="rounded-xl border px-3 py-2 font-semibold hover:bg-slate-50"
            >
              Misol 1
            </button>
            <button
              type="button"
              onClick={() => applySample(SAMPLE_2)}
              className="rounded-xl border px-3 py-2 font-semibold hover:bg-slate-50"
            >
              Misol 2
            </button>
          </div>

          {!canRecord && <p className="text-sm text-amber-700">Bu qurilmada mikrofon API mavjud emas.</p>}
          {recording && <p className="text-sm text-red-600">Yozilmoqda...</p>}
          {uploading && <p className="text-sm text-slate-600">Audio matnga aylantirilmoqda...</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <div className="mb-1 text-sm font-semibold">STT matn</div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="min-h-[90px] w-full rounded-xl border px-3 py-2"
              placeholder="Masalan: nonga o'n ming ishlatdim"
            />
            <div className="mt-2">
              <button
                type="button"
                onClick={parseNow}
                className="rounded-xl border bg-emerald-700 px-3 py-2 font-bold text-white"
              >
                AI parse
              </button>
            </div>
          </label>

          <label className="block">
            <div className="mb-1 text-sm font-semibold">Summa</div>
            <input
              type="number"
              value={Number.isFinite(amount) ? amount : 0}
              onChange={(e) => setAmount(Number(e.target.value || 0))}
              className="w-full rounded-xl border px-3 py-2"
            />
            <div className="mt-1 text-xs text-slate-500">{formatMoney(amount || 0)}</div>
          </label>

          <label className="block">
            <div className="mb-1 text-sm font-semibold">Kategoriya</div>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </label>

          <div className="block">
            <div className="mb-1 text-sm font-semibold">To‘lov turi</div>
            <div className="flex overflow-hidden rounded-xl border">
              <button
                type="button"
                className={`flex-1 px-3 py-2 font-bold ${paymentType === "cash" ? "bg-slate-900 text-white" : "bg-white"}`}
                onClick={() => setPaymentType("cash")}
              >
                Naqd
              </button>
              <button
                type="button"
                className={`flex-1 px-3 py-2 font-bold ${paymentType === "card" ? "bg-slate-900 text-white" : "bg-white"}`}
                onClick={() => setPaymentType("card")}
              >
                Karta
              </button>
            </div>
          </div>

          <label className="block md:col-span-2">
            <div className="mb-1 text-sm font-semibold">Izoh</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </label>
        </div>

        {!!err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving || uploading}
            className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saqlanmoqda..." : "Tasdiqlab saqlash"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2 font-semibold"
          >
            Bekor
          </button>
        </div>
      </div>
    </div>
  );
}

export default VoiceExpenseConfirmModal;

