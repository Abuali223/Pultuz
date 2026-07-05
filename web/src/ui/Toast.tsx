import React from "react";

type Toast = { id: string; text: string; type: "success" | "error" | "info" | "warning" };

const Ctx = React.createContext<{
  push: (text: string, type?: Toast["type"]) => void;
}>({
  push: () => {},
});

export function useToast() {
  return React.useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);

  const push = (text: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(16).slice(2);
    const t: Toast = { id, text, type };
    setItems((prev) => [t, ...prev].slice(0, 4));
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 3200);
  };

  const bg = (type: Toast["type"]) =>
    type === "success"
      ? "bg-success"
      : type === "error"
      ? "bg-destructive"
      : type === "warning"
      ? "bg-warning"
      : "bg-primary";

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed right-4 top-4 z-[60] space-y-2">
        {items.map((t) => (
          <div key={t.id} className={`${bg(t.type)} rounded-xl px-3 py-2 text-sm text-white shadow-lg`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
