import React from "react";
import { Button } from "./Button";

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/30 p-4">
      <div className="w-full max-w-lg ali-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <Button variant="ghost" onClick={onClose}>
            Yopish
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
