"use client";

import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "default" | "sm";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-[var(--accent)] bg-[var(--accent)] text-white hover:-translate-y-px",
  secondary:
    "border-[var(--accent)] bg-transparent text-[var(--accent-strong)] hover:-translate-y-px",
  ghost:
    "border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] text-[var(--text)] hover:-translate-y-px",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "rounded-[14px] px-[18px] py-3",
  sm: "rounded-xl px-3 py-2.5",
};

export function Button({ className, type = "button", variant = "secondary", size = "default", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center border transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
