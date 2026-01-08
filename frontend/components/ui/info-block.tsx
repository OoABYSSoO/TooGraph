import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
};

export function InfoBlock({ className, title, children, ...props }: Props) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5",
        className,
      )}
      {...props}
    >
      <strong>{title}</strong>
      <div className="mt-1.5 text-[var(--muted)]">{children}</div>
    </div>
  );
}
