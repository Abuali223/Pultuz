import React from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export type ScannerMode = "single" | "multi";

type CameraScannerModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  mode?: ScannerMode;
  defaultQty?: number;
  onClose: () => void;
  onDetected: (text: string, qty?: number) => void;
};

export function CameraScannerModal({
  open,
  title = "Barcode skaner",
  description,
  mode = "single",
  defaultQty = 1,
  onClose,
  onDetected,
}: CameraScannerModalProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const readerRef = React.useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = React.useRef<any>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const closedRef = React.useRef(false);
  const lastEmitRef = React.useRef(0);

  const [status, setStatus] = React.useState<string>("Kamera ochilmoqda...");
  const [err, setErr] = React.useState<string>("");

  const stopAll = React.useCallback(() => {
    closedRef.current = true;
    try {
      controlsRef.current?.stop?.();
    } catch {}
    controlsRef.current = null;

    try {
      (readerRef.current as any)?.reset?.();
    } catch {}
    readerRef.current = null;

    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
  }, []);

  const start = React.useCallback(async () => {
    setErr("");
    setStatus("Kamera tayyorlanmoqda...");
    closedRef.current = false;

    const video = videoRef.current;
    if (!video) return;

    stopAll();
    closedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
        },
      });

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          await track.applyConstraints({
            advanced: [
              // @ts-ignore
              { focusMode: "continuous" },
              // @ts-ignore
              { zoom: 1.0 },
            ],
          });
        } catch {
          // ba'zi qurilmalarda qo'llab-quvvatlanmasligi mumkin
        }
      }

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      await video.play();

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      setStatus("Barkodni markazga tuting...");

      controlsRef.current = await (reader as any).decodeFromVideoDevice(undefined, video, (result: any) => {
        if (closedRef.current) return;

        const txt = String(result?.getText?.() || result?.text || "").trim();
        if (!txt) return;

        // multi rejimda duplikat spamni cheklash
        const now = Date.now();
        if (mode === "multi" && now - lastEmitRef.current < 750) return;
        lastEmitRef.current = now;

        setStatus(`Topildi ✅ ${txt}`);
        onDetected(txt, defaultQty);

        if (mode === "single") {
          closedRef.current = true;
          setTimeout(() => onClose(), 120);
        }
      });
    } catch (e: any) {
      setErr(e?.message || "Kamerani ochib bo'lmadi");
      setStatus("Kamera ochilmadi");
    }
  }, [defaultQty, mode, onClose, onDetected, stopAll]);

  React.useEffect(() => {
    if (!open) {
      stopAll();
      return;
    }
    void start();
    return () => stopAll();
  }, [open, start, stopAll]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-primary/50 p-3">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-foreground shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm hover:bg-muted"
          >
            Yopish
          </button>
        </div>

        <div className="flex-1 p-3">
          <div className="mx-auto aspect-[16/9] w-full overflow-hidden rounded-xl border border-border/70 bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
          </div>

          <div className="mt-3 text-sm text-foreground">{status}</div>
          {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
          <div className="mt-1 text-[11px] text-muted-foreground">Rejim: {mode === "multi" ? "Ko'p marotaba" : "Bir marotaba"}</div>
          {err ? <div className="mt-2 text-sm text-destructive">{err}</div> : null}

          <div className="mt-3 rounded-lg border border-secondary/30 bg-secondary/15 p-3 text-xs text-foreground/80">
            Maslahat: yorug'lik yaxshi bo'lsin, barkod to'liq kadr ichida bo'lsin. Skaner faqat orqa kameradan foydalanadi.
          </div>
        </div>
      </div>
    </div>
  );
}

export default CameraScannerModal;
