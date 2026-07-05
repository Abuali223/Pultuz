import React from "react";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "px-5 py-3 text-base rounded-xl",
};

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
  outline: "border border-border bg-card text-foreground hover:bg-muted",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  ghost: "text-foreground hover:bg-muted border border-transparent",
};

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({ variant = "primary", size = "md", className, loading, children, ...props }: Props) {
  return (
    <button className={cx(base, sizeClasses[size], variantClasses[variant], className)} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}
