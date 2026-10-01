"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  containerClassName?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, containerClassName, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-body-sm font-semibold text-primary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(
            "h-10 w-full rounded-md border border-field-line bg-field px-3 text-body text-primary placeholder:text-muted transition-colors duration-150 ease-out",
            "focus:outline-2 focus:outline-offset-1 focus:outline-primary",
            "disabled:cursor-not-allowed disabled:text-faint",
            error && "border-danger",
            className,
          )}
          {...props}
        />
        {error && (
          <p className="text-caption text-danger">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input };
