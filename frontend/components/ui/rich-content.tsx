"use client";

import { Children, isValidElement, useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";

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
  copyable?: boolean;
  copyText?: string;
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

function stringifyNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((item) => stringifyNodeText(item)).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return stringifyNodeText(node.props.children);
  }

  return "";
}

async function writeTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

function CopyTextButton({ text, label = "复制", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-white/86 text-[#6b7280] shadow-sm transition hover:border-[#d0d7de] hover:bg-white hover:text-[#24292f]",
        className,
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await writeTextToClipboard(text);
        setCopied(true);
      }}
      title={copied ? "已复制" : label}
      aria-label={copied ? "已复制" : label}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.8">
          <path d="m3.75 8.25 2.5 2.5 6-6" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
          <rect x="5.25" y="3.25" width="7.5" height="9.5" rx="1.5" />
          <path d="M10.75 3V2.5A1.5 1.5 0 0 0 9.25 1h-5A1.5 1.5 0 0 0 2.75 2.5v8A1.5 1.5 0 0 0 4.25 12H4.5" />
        </svg>
      )}
    </button>
  );
}

function CopyActionRow({
  text,
  label = "复制",
  leading,
  className,
}: {
  text: string;
  label?: string;
  leading?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", leading ? "justify-between" : "justify-end", className)}>
      {leading ? <div className="min-w-0">{leading}</div> : null}
      <CopyTextButton text={text} label={label} />
    </div>
  );
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
        "select-text overflow-x-auto whitespace-pre-wrap break-words rounded-[18px] border border-[rgba(154,52,18,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,242,234,0.92)_100%)] px-4 py-3.5 font-mono text-[0.82rem] leading-6 text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
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

function MarkdownCodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[#d0d7de] bg-[#f6f8fa]">
      <div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-3 py-2">
        <CopyActionRow
          text={code}
          label="复制代码"
          leading={
            <span className="text-[0.68rem] font-medium uppercase tracking-[0.12em] text-[#57606a]">
              {language ? language : "code"}
            </span>
          }
        />
      </div>
      <pre className="!m-0 rounded-none border-0 bg-transparent px-4 py-3">
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
    </div>
  );
}

function MarkdownPre({ children }: { children?: ReactNode }) {
  const firstChild = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(firstChild)) {
    return <pre>{children}</pre>;
  }

  const className = typeof firstChild.props.className === "string" ? firstChild.props.className : "";
  const languageMatch = className.match(/language-([\w-]+)/);
  const code = stringifyNodeText(firstChild.props.children).replace(/\n$/, "");

  return <MarkdownCodeBlock code={code} language={languageMatch?.[1]} />;
}

export function MarkdownArticle({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("graphite-markdown select-text", className)}>
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
          pre({ children }) {
            return <MarkdownPre>{children}</MarkdownPre>;
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

export function RichContent({ text, displayMode = "auto", className, empty, copyable = false, copyText }: RichContentProps) {
  if (!text) {
    return empty ? <>{empty}</> : null;
  }

  const resolved = resolveRichContentDisplayMode(displayMode, text);

  const content =
    resolved === "json" ? (
      <JsonViewer text={text} className={className} />
    ) : resolved === "markdown" ? (
      <MarkdownArticle text={text} className={className} />
    ) : (
      <div className={cn("select-text whitespace-pre-wrap break-words text-[0.96rem] leading-7 text-[var(--text)]", className)}>{text}</div>
    );

  if (!copyable) {
    return content;
  }

  return (
    <div className="flex flex-col gap-2">
      <CopyActionRow text={copyText ?? text} />
      <div>{content}</div>
    </div>
  );
}
