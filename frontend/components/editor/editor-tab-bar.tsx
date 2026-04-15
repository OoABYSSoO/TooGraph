"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { EditorWorkspaceTab } from "@/lib/editor-workspace";
import type { CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import type { GraphSummary } from "@/lib/types";

type EditorTabBarProps = {
  tabs: EditorWorkspaceTab[];
  activeTabId: string | null;
  templates: CanonicalTemplateRecord[];
  graphs: GraphSummary[];
  activeGraphName: string;
  activeStateCount: number;
  isStatePanelOpen: boolean;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateNew: () => void;
  onCreateFromTemplate: (templateId: string) => void;
  onOpenGraph: (graphId: string) => void;
  onRenameActiveGraph: (name: string) => void;
  onToggleStatePanel: () => void;
  onSaveActiveGraph: () => void;
  onValidateActiveGraph: () => void;
  onRunActiveGraph: () => void;
};

type WorkspaceSelectOption = {
  value: string;
  label: string;
};

const WORKSPACE_SELECT_CLASS =
  "min-h-[38px] w-full appearance-none rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)] px-3.5 py-2.5 pr-10 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] outline-none transition focus:border-[rgba(154,52,18,0.28)] focus:bg-white";

function getTabBadge(tab: EditorWorkspaceTab) {
  switch (tab.kind) {
    case "template":
      return "template";
    case "existing":
      return "graph";
    case "new":
    default:
      return "draft";
  }
}

function WorkspaceSelect({
  value,
  placeholder,
  options,
  minWidthClassName,
  onValueChange,
}: {
  value: string;
  placeholder: string;
  options: WorkspaceSelectOption[];
  minWidthClassName: string;
  onValueChange: (value: string) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex] ?? null;
  const displayLabel = selectedOption?.label ?? placeholder;
  const isDisabled = options.length === 0;

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }

    const syncMenuWidth = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      setMenuWidth(Math.round(trigger.getBoundingClientRect().width));
    };

    syncMenuWidth();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);

    const frameId = window.requestAnimationFrame(() => {
      menuRef.current?.focus();
    });

    const observer = typeof ResizeObserver !== "undefined" && triggerRef.current ? new ResizeObserver(syncMenuWidth) : null;
    if (observer && triggerRef.current) {
      observer.observe(triggerRef.current);
    } else {
      window.addEventListener("resize", syncMenuWidth);
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener("resize", syncMenuWidth);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!isDisabled || !open) return;
    setOpen(false);
  }, [isDisabled, open]);

  const selectOption = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  const moveActiveIndex = (direction: 1 | -1) => {
    if (options.length === 0) return;
    setActiveIndex((current) => {
      const baseIndex = current >= 0 ? current : selectedIndex >= 0 ? selectedIndex : 0;
      return (baseIndex + direction + options.length) % options.length;
    });
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveActiveIndex(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(options.length - 1, 0));
        return;
      }
      moveActiveIndex(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveIndex(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveIndex(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(options.length - 1, 0));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (activeIndex >= 0 && options[activeIndex]) {
        selectOption(options[activeIndex].value);
      }
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative", minWidthClassName)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={isDisabled}
        onKeyDown={handleTriggerKeyDown}
        onClick={() => {
          if (isDisabled) return;
          setOpen((current) => !current);
        }}
        className={cn(
          WORKSPACE_SELECT_CLASS,
          "flex items-center text-left",
          isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[rgba(154,52,18,0.22)]",
        )}
      >
        <span className="block min-w-0 flex-1 truncate">{displayLabel}</span>
      </button>
      <svg
        viewBox="0 0 16 16"
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 fill-none stroke-[var(--muted)] transition-transform",
          open ? "rotate-180" : null,
        )}
        strokeWidth="1.5"
      >
        <path d="m4.5 6 3.5 4 3.5-4" />
      </svg>
      {open ? (
        <div
          id={listboxId}
          ref={menuRef}
          role="listbox"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          tabIndex={-1}
          className="absolute left-0 top-[calc(100%+8px)] z-30 max-h-[260px] overflow-y-auto overflow-x-hidden rounded-[16px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)] p-1 shadow-[0_20px_40px_rgba(60,41,20,0.18)] backdrop-blur focus:outline-none"
          style={{ width: menuWidth ? `${menuWidth}px` : undefined }}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="grid gap-1">
            {options.map((option, index) => {
              const selected = option.value === value;
              const active = index === activeIndex;
              return (
                <button
                  id={`${listboxId}-option-${index}`}
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left text-sm transition",
                    "text-[var(--text)] hover:bg-[rgba(154,52,18,0.08)]",
                    selected ? "bg-[rgba(154,52,18,0.12)] text-[var(--accent-strong)]" : active ? "bg-[rgba(154,52,18,0.06)]" : null,
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    selectOption(option.value);
                  }}
                >
                  <span className="block min-w-0 flex-1 truncate">{option.label}</span>
                  <span className={cn("opacity-0 transition", selected ? "opacity-100" : null)}>
                    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                      <path d="m3.5 8.5 3 3 6-7" />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EditorTabBar({
  tabs,
  activeTabId,
  templates,
  graphs,
  activeGraphName,
  activeStateCount,
  isStatePanelOpen,
  onActivateTab,
  onCloseTab,
  onCreateNew,
  onCreateFromTemplate,
  onOpenGraph,
  onRenameActiveGraph,
  onToggleStatePanel,
  onSaveActiveGraph,
  onValidateActiveGraph,
  onRunActiveGraph,
}: EditorTabBarProps) {
  const { language } = useLanguage();
  const [templateSelection, setTemplateSelection] = useState("");
  const [graphSelection, setGraphSelection] = useState("");
  const [isEditingGraphName, setIsEditingGraphName] = useState(false);
  const [draftGraphName, setDraftGraphName] = useState(activeGraphName);
  const copy =
    language === "zh"
      ? {
          newGraph: "新建图",
          fromTemplate: "从模板创建",
          openGraph: "打开已有图",
          noTemplates: "暂无模板",
          noGraphs: "暂无已保存图",
          dirty: "未保存",
          state: "State",
          save: "Save",
          validate: "Validate",
          run: "Run",
        }
      : {
          newGraph: "New Graph",
          fromTemplate: "From Template",
          openGraph: "Open Graph",
          noTemplates: "No templates",
          noGraphs: "No saved graphs",
          dirty: "Unsaved",
          state: "State",
          save: "Save",
          validate: "Validate",
          run: "Run",
        };

  const templateOptions = templates.map((template) => ({
    value: template.template_id,
    label: template.label,
  }));

  const graphOptions = graphs.map((graph) => ({
    value: graph.graph_id,
    label: graph.name,
  }));

  useEffect(() => {
    if (!isEditingGraphName) {
      setDraftGraphName(activeGraphName);
    }
  }, [activeGraphName, isEditingGraphName]);

  const commitGraphName = () => {
    const nextName = draftGraphName.trim();
    if (nextName && nextName !== activeGraphName) {
      onRenameActiveGraph(nextName);
    }
    setIsEditingGraphName(false);
  };

  return (
    <div className="border-b border-[rgba(154,52,18,0.14)] bg-[rgba(255,250,241,0.9)] px-4 py-2 shadow-[0_10px_24px_rgba(154,52,18,0.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-1.5">
            {tabs.map((tab) => {
              const isActive = tab.tabId === activeTabId;
              const tabHint = [getTabBadge(tab), tab.dirty ? copy.dirty : null].filter(Boolean).join(" · ");
              return (
                <button
                  key={tab.tabId}
                  type="button"
                  title={tabHint}
                  onClick={() => onActivateTab(tab.tabId)}
                  className={cn(
                    "group inline-flex h-[36px] items-center gap-2 rounded-[14px] border px-3.5 text-left transition-all duration-150",
                    isActive
                      ? "border-[rgba(154,52,18,0.22)] bg-[rgba(255,255,255,0.94)] shadow-[0_8px_18px_rgba(154,52,18,0.08)]"
                      : "border-[rgba(154,52,18,0.1)] bg-[rgba(255,250,241,0.64)] hover:bg-[rgba(255,255,255,0.84)]",
                  )}
                >
                  {tab.dirty ? <span className="h-2 w-2 rounded-full bg-[var(--accent-strong)]" /> : null}
                  <span className="min-w-0 truncate text-sm font-medium text-[var(--text)]">{tab.title}</span>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab.tabId);
                    }}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--accent-strong)] transition-colors duration-150 hover:bg-[rgba(154,52,18,0.08)]"
                  >
                    ×
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEditingGraphName ? (
            <Input
              autoFocus
              className="h-[38px] min-w-[220px] rounded-[16px] border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)] px-3.5 py-2.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
              value={draftGraphName}
              onChange={(event) => setDraftGraphName(event.target.value)}
              onBlur={commitGraphName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitGraphName();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftGraphName(activeGraphName);
                  setIsEditingGraphName(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => setIsEditingGraphName(true)}
              className="inline-flex h-[38px] min-w-[220px] items-center rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.72)] px-3.5 text-left text-sm font-medium text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] transition hover:border-[rgba(154,52,18,0.2)]"
              title={activeGraphName}
            >
              <span className="truncate">{activeGraphName}</span>
            </button>
          )}
          <button
            type="button"
            className={cn(
              "inline-flex h-[38px] items-center gap-2 rounded-[16px] border px-3.5 text-sm font-medium transition",
              isStatePanelOpen
                ? "border-[var(--accent)] bg-[rgba(255,244,240,0.94)] text-[var(--accent-strong)]"
                : "border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.82)] text-[var(--text)] hover:bg-white",
            )}
            onClick={onToggleStatePanel}
          >
            <span>{copy.state}</span>
            <span className="rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.92)] px-2 py-0.5 text-[0.68rem] text-[var(--muted)]">
              {activeStateCount}
            </span>
          </button>
          <Button size="sm" onClick={onCreateNew}>
            {copy.newGraph}
          </Button>
          <WorkspaceSelect
            value={templateSelection}
            placeholder={templateOptions.length === 0 ? copy.noTemplates : copy.fromTemplate}
            options={templateOptions}
            minWidthClassName="min-w-[180px]"
            onValueChange={(value) => {
              setTemplateSelection("");
              if (value) {
                onCreateFromTemplate(value);
              }
            }}
          />
          <WorkspaceSelect
            value={graphSelection}
            placeholder={graphOptions.length === 0 ? copy.noGraphs : copy.openGraph}
            options={graphOptions}
            minWidthClassName="min-w-[200px]"
            onValueChange={(value) => {
              setGraphSelection("");
              if (value) {
                onOpenGraph(value);
              }
            }}
          />
          <Button size="sm" onClick={onSaveActiveGraph}>
            {copy.save}
          </Button>
          <Button size="sm" onClick={onValidateActiveGraph}>
            {copy.validate}
          </Button>
          <Button size="sm" variant="primary" onClick={onRunActiveGraph}>
            {copy.run}
          </Button>
        </div>
      </div>
    </div>
  );
}
