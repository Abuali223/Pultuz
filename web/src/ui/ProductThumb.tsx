import React from "react";
import { cn } from "@/lib/cn";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function categoryEmoji(category?: string | null) {
  const c = (category ?? "").toLowerCase();
  if (!c) return "📦";
  if (c.includes("sut") || c.includes("milk")) return "🥛";
  if (c.includes("non") || c.includes("bread")) return "🍞";
  if (c.includes("ichim") || c.includes("drink") || c.includes("cola") || c.includes("suv")) return "🥤";
  if (c.includes("go") || c.includes("meat")) return "🍖";
  if (c.includes("meva") || c.includes("fruit")) return "🍎";
  if (c.includes("sabz") || c.includes("veg")) return "🥬";
  return "📦";
}

const GRADS = [
  "linear-gradient(135deg, var(--primary), var(--secondary))",
  "linear-gradient(135deg, var(--secondary), var(--primary))",
  "linear-gradient(135deg, var(--primary), var(--accent))",
  "linear-gradient(135deg, var(--secondary), var(--accent))",
];

export function ProductThumb({
  name,
  category,
  className,
  variant = "square",
}: {
  name: string;
  category?: string | null;
  className?: string;
  variant?: "square" | "circle";
}) {
  const n = (name ?? "?").trim();
  const letter = (n.slice(0, 1) || "?").toUpperCase();
  const grad = GRADS[hashStr(n) % GRADS.length];
  const emoji = categoryEmoji(category);

  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden border border-border/60",
        variant === "circle" ? "rounded-full" : "rounded-[var(--radius-card)]",
        className
      )}
      style={{ background: grad }}
      aria-label="Mahsulot rasmi o'rnida"
    >
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative flex items-center gap-2">
        <span className="text-4xl font-extrabold tracking-tight text-white/90">{letter}</span>
      </div>
      <div className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/15 text-sm text-white">
        {emoji}
      </div>
    </div>
  );
}
