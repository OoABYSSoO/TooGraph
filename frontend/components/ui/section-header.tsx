import { Badge } from "@/components/ui/badge";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
};

export function SectionHeader({ eyebrow, title, description }: Props) {
  return (
    <section>
      <Badge className="border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.72)] text-[0.82rem] uppercase tracking-[0.06em] text-[var(--accent-strong)]">
        {eyebrow}
      </Badge>
      <h1 className="mb-2.5 mt-3.5 text-[clamp(2rem,4vw,3.4rem)] leading-[1.05]">{title}</h1>
      <p className="max-w-[68ch] text-[1.02rem] leading-[1.7] text-[var(--muted)]">{description}</p>
    </section>
  );
}
