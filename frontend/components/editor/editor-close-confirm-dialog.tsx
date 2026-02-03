"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { EditorWorkspaceTab } from "@/lib/editor-workspace";

type EditorCloseConfirmDialogProps = {
  tab: EditorWorkspaceTab | null;
  busy: boolean;
  error?: string | null;
  onSaveAndClose: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export function EditorCloseConfirmDialog({
  tab,
  busy,
  error,
  onSaveAndClose,
  onDiscard,
  onCancel,
}: EditorCloseConfirmDialogProps) {
  const { language } = useLanguage();
  const copy =
    language === "zh"
      ? {
          title: "关闭未保存的标签页？",
          description: "这个标签页有未保存修改。你可以先保存，再关闭；也可以直接丢弃。",
          save: "保存并关闭",
          discard: "不保存，直接关闭",
          cancel: "取消",
        }
      : {
          title: "Close tab with unsaved changes?",
          description: "This tab has unsaved changes. Save it before closing, or discard the changes.",
          save: "Save and Close",
          discard: "Discard and Close",
          cancel: "Cancel",
        };

  if (!tab) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(66,31,17,0.18)] px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.98)] p-6 shadow-[0_28px_80px_rgba(66,31,17,0.18)]">
        <div className="grid gap-2">
          <div className="text-[0.76rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Tab</div>
          <h2 className="text-2xl font-semibold text-[var(--text)]">{copy.title}</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">
            {copy.description}
            <span className="ml-1 font-medium text-[var(--text)]">{tab.title}</span>
          </p>
        </div>
        {error ? (
          <div className="mt-4 rounded-[18px] border border-[rgba(191,78,39,0.16)] bg-[rgba(255,244,238,0.92)] px-4 py-3 text-sm text-[var(--accent-strong)]">
            {error}
          </div>
        ) : null}
        <div className={cn("mt-6 flex flex-wrap justify-end gap-3", busy ? "pointer-events-none opacity-80" : "")}>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {copy.cancel}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
            {copy.discard}
          </Button>
          <Button type="button" size="sm" onClick={onSaveAndClose}>
            {copy.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
