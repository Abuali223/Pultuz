import * as React from "react";
import { cn } from "../lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  inputClassName?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, containerClassName, inputClassName, id, ...props }, ref) => {
    const inputId = id ?? React.useId();
    const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;

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
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={cn(
            "ali-input",
            error ? "border-destructive/60 focus:ring-destructive/30" : "",
            inputClassName,
            className
          )}
          {...props}
        />

        {error ? (
          <div id={`${inputId}-err`} className="text-sm text-destructive">
            {error}
          </div>
        ) : hint ? (
          <div id={`${inputId}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </div>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";
