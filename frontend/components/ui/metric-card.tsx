import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  description: ReactNode;
};

export function MetricCard({ className, label, value, description, ...props }: Props) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]",
        className,
      )}
      {...props}
    >
      <div className="text-[var(--muted)]">{label}</div>
      <div className="my-2 mb-0 text-[2rem]">{value}</div>
      <p className="text-[var(--muted)]">{description}</p>
    </div>
  );
}
