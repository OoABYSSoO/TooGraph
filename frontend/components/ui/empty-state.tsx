import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export function EmptyState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5 text-[var(--muted)]",
        className,
      )}
      {...props}
    />
  );
}
