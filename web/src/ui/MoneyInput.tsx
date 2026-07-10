import * as React from "react";
import { cn } from "../lib/cn";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";

/**
 * Pul/narx maydoni — yozilganda avtomatik minglik ajratadi (100 000 kabi).
 * `type="number"` bo'shliq ajratkichni ko'rsata olmaydi, shuning uchun bu
 * komponent matn (text) sifatida ishlaydi: ko'rinishda formatlangan, tashqariga
 * esa raqam (number) qiymatini beradi.
 */
export type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  label?: string;
  hint?: string;
  value: number;
  onValueChange: (n: number) => void;
  containerClassName?: string;
  inputClassName?: string;
};

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, label, hint, value, onValueChange, containerClassName, inputClassName, id, ...props }, ref) => {
    const inputId = id ?? React.useId();
    const [text, setText] = React.useState<string>(() => (value ? formatMoneyInput(String(value)) : ""));
    const [editing, setEditing] = React.useState(false);

    // Tashqi qiymat o'zgarsa (tozalash, avtomatik to'ldirish) va tahrirlanmayotgan bo'lsa — sinxron
    React.useEffect(() => {
      if (!editing) setText(value ? formatMoneyInput(String(value)) : "");
    }, [value, editing]);

    return (
      <div className={cn("space-y-1", containerClassName)}>
        {label ? (
          <label htmlFor={inputId} className="text-sm md:text-base font-medium text-foreground">
            {label}
          </label>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          type="text"
          inputMode="decimal"
          className={cn("ali-input", inputClassName, className)}
          value={text}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(e) => {
            const f = formatMoneyInput(e.target.value);
            setText(f);
            onValueChange(parseMoneyInput(f));
          }}
          {...props}
        />

        {hint ? <div className="text-sm text-muted-foreground">{hint}</div> : null}
      </div>
    );
  }
);
MoneyInput.displayName = "MoneyInput";
