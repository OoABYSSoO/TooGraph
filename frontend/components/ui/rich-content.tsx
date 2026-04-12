"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/cn";

export type RichContentResolvedDisplayMode = "plain" | "markdown" | "json";
export type RichContentDisplayMode = RichContentResolvedDisplayMode | "auto";

type RichContentProps = {
  text: string;
  displayMode?: string;
  className?: string;
  empty?: ReactNode;
};

export function formatRichContentValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function detectRichContentDisplayMode(text: string): RichContentResolvedDisplayMode {
  const trimmed = text.trim();
  if (!trimmed) return "plain";

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // not json
    }
  }

  if (
    /^#{1,6}\s/m.test(trimmed) ||
    /\*\*.*?\*\*/.test(trimmed) ||
    /```/.test(trimmed) ||
    /^\*\s/m.test(trimmed) ||
    /^\d+\.\s/m.test(trimmed) ||
    /^\s*>\s/m.test(trimmed) ||
    /^\s*[-*+]\s\[[ xX]\]\s/m.test(trimmed) ||
    /\[.*?\]\(.*?\)/.test(trimmed) ||
    /^\|.*\|$/m.test(trimmed) ||
    /^-{3,}$|^\*{3,}$/m.test(trimmed)
  ) {
    return "markdown";
  }

  return "plain";
}

export function resolveRichContentDisplayMode(displayMode: string | undefined, text: string): RichContentResolvedDisplayMode {
  if (displayMode === "plain" || displayMode === "markdown" || displayMode === "json") {
    return displayMode;
  }
  return detectRichContentDisplayMode(text);
}

function JsonViewer({ text, className }: { text: string; className?: string }) {
  let formatted = text;
  try {
    const parsed = JSON.parse(text);
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    // keep original
  }

  return (
    <pre
      className={cn(
        "overflow-x-auto whitespace-pre-wrap break-words rounded-[18px] border border-[rgba(154,52,18,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,242,234,0.92)_100%)] px-4 py-3.5 font-mono text-[0.82rem] leading-6 text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
        className,
      )}
    >
      <code>
        {formatted.split("\n").map((line, index) => {
          const parts = line.split(/("(?:[^"\\]|\\.)*")\s*(:?)/);
          return (
            <span key={`${index}-${line}`}>
              {index > 0 && "\n"}
              {parts.map((part, partIndex) => {
                if (partIndex % 3 === 1) {
                  const isKey = parts[partIndex + 1] === ":";
                  return (
                    <span key={`${index}-${partIndex}`} className={isKey ? "text-[#9a3412]" : "text-[#166534]"}>
                      {part}
                    </span>
                  );
                }

                return part.split(/\b(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/).map((token, tokenIndex) => {
                  if (tokenIndex % 2 === 1) {
                    if (token === "true" || token === "false") {
                      return (
                        <span key={`${index}-${partIndex}-${tokenIndex}`} className="text-[#2563eb]">
                          {token}
                        </span>
                      );
                    }
                    if (token === "null") {
                      return (
                        <span key={`${index}-${partIndex}-${tokenIndex}`} className="text-[#64748b]">
                          {token}
                        </span>
                      );
                    }
                    return (
                      <span key={`${index}-${partIndex}-${tokenIndex}`} className="text-[#d97706]">
                        {token}
                      </span>
                    );
                  }
                  return <span key={`${index}-${partIndex}-${tokenIndex}`}>{token}</span>;
                });
              })}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

export function MarkdownArticle({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("graphite-markdown", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }: ComponentPropsWithoutRef<"a">) {
            const isExternal = typeof href === "string" && /^https?:\/\//.test(href);
            return (
              <a
                {...props}
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          img({ alt, ...props }: ComponentPropsWithoutRef<"img">) {
            return <img {...props} alt={alt ?? ""} loading="lazy" />;
          },
          table({ children, ...props }: ComponentPropsWithoutRef<"table">) {
            return (
              <div className="graphite-markdown-table-wrap">
                <table {...props}>{children}</table>
              </div>
            );
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

export function RichContent({ text, displayMode = "auto", className, empty }: RichContentProps) {
  if (!text) {
    return empty ? <>{empty}</> : null;
  }

  const resolved = resolveRichContentDisplayMode(displayMode, text);

  if (resolved === "json") {
    return <JsonViewer text={text} className={className} />;
  }

  if (resolved === "markdown") {
    return <MarkdownArticle text={text} className={className} />;
  }

  return <div className={cn("whitespace-pre-wrap break-words text-[0.96rem] leading-7 text-[var(--text)]", className)}>{text}</div>;
}
