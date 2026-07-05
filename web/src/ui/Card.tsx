import React from "react";

type Props = {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  padded?: boolean;
};

export function Card({ title, children, right, className = "", padded = true }: Props) {
  return (
    <div
      className={`ali-card ${
        padded ? "p-5 sm:p-6" : "p-0"
      } ${className}`}
    >
      {title || right ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-base font-semibold text-foreground">{title}</div>
          {right}
        </div>
      ) : null}
      {children}
    </div>
  );
}
