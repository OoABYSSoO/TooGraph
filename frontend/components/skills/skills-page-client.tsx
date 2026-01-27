"use client";

import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/providers/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SubtleCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

type SkillField = {
  key: string;
  label: string;
  valueType: string;
  required: boolean;
  description: string;
};

type SkillCompatibilityReport = {
  target: "claude_code" | "openclaw" | "codex";
  status: "native" | "partial" | "incompatible";
  summary: string;
  missingCapabilities: string[];
};

type SkillDefinition = {
  skillKey: string;
  label: string;
  description: string;
  inputSchema: SkillField[];
  outputSchema: SkillField[];
  supportedValueTypes: string[];
  sideEffects: string[];
  sourceFormat: "graphite_definition" | "claude_code" | "openclaw" | "codex";
  sourceScope: "graphite_managed" | "external";
  sourcePath: string;
  runtimeRegistered: boolean;
  status: "active" | "disabled" | "deleted";
  canManage: boolean;
  canImport: boolean;
  compatibility: SkillCompatibilityReport[];
};

type SkillScopeFilter = "all" | "managed" | "external";

const COMPATIBILITY_LABELS: Record<SkillCompatibilityReport["status"], string> = {
  native: "原生",
  partial: "部分兼容",
  incompatible: "不兼容",
};

const FORMAT_LABELS: Record<SkillDefinition["sourceFormat"], string> = {
  graphite_definition: "Graphite 定义",
  claude_code: "Claude Code",
  openclaw: "OpenClaw",
  codex: "Codex",
};

const SCOPE_FILTER_LABELS: Record<SkillScopeFilter, string> = {
  all: "全部",
  managed: "已导入",
  external: "外部待导入",
};

function matchesScopeFilter(skill: SkillDefinition, scopeFilter: SkillScopeFilter) {
  if (scopeFilter === "managed") return skill.sourceScope === "graphite_managed";
  if (scopeFilter === "external") return skill.sourceScope === "external";
  return true;
}

function summarizeSchemaFields(fields: SkillField[]) {
  if (fields.length === 0) return "未声明";
  const labels = fields.slice(0, 3).map((field) => field.label || field.key);
  return fields.length > 3 ? `${labels.join("、")} +${fields.length - 3}` : labels.join("、");
}

function compareSkills(left: SkillDefinition, right: SkillDefinition) {
  const leftScopeRank = left.sourceScope === "graphite_managed" ? 0 : 1;
  const rightScopeRank = right.sourceScope === "graphite_managed" ? 0 : 1;
  if (leftScopeRank !== rightScopeRank) {
    return leftScopeRank - rightScopeRank;
  }

  const leftStatusRank = left.status === "active" ? 0 : 1;
  const rightStatusRank = right.status === "active" ? 0 : 1;
  if (leftStatusRank !== rightStatusRank) {
    return leftStatusRank - rightStatusRank;
  }

  return left.label.localeCompare(right.label, "zh-Hans-CN");
}

export function SkillsPageClient() {
  const { t } = useLanguage();
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<SkillScopeFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSkills() {
      try {
        const payload = await apiGet<SkillDefinition[]>("/api/skills/catalog?include_disabled=true");
        if (!cancelled) {
          setSkills(payload);
          setSelectedSkillKey((current) => current ?? payload[0]?.skillKey ?? null);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load skills.");
        }
      }
    }
    loadSkills();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshSkills(preferredSkillKey?: string | null) {
    const payload = await apiGet<SkillDefinition[]>("/api/skills/catalog?include_disabled=true");
    setSkills(payload);
    const nextKey = preferredSkillKey && payload.some((item) => item.skillKey === preferredSkillKey)
      ? preferredSkillKey
      : payload[0]?.skillKey ?? null;
    setSelectedSkillKey(nextKey);
  }

  const filteredSkills = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return skills
      .filter((skill) => {
        if (!matchesScopeFilter(skill, scopeFilter)) {
          return false;
        }
        if (!keyword) {
          return true;
        }
        return [
          skill.skillKey,
          skill.label,
          skill.description,
          ...skill.sideEffects,
          ...skill.supportedValueTypes,
          ...skill.inputSchema.map((field) => `${field.label} ${field.key} ${field.description}`),
          ...skill.outputSchema.map((field) => `${field.label} ${field.key} ${field.description}`),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort(compareSkills);
  }, [scopeFilter, search, skills]);

  const selectedSkill =
    filteredSkills.find((skill) => skill.skillKey === selectedSkillKey) ??
    filteredSkills[0] ??
    skills.find((skill) => skill.skillKey === selectedSkillKey) ??
    null;

  async function handleDisable(skillKey: string) {
    setPendingActionKey(skillKey);
    try {
      await apiPost<SkillDefinition>(`/api/skills/${skillKey}/disable`, {});
      await refreshSkills(skillKey);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to disable skill.");
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleImport(skillKey: string) {
    setPendingActionKey(skillKey);
    try {
      await apiPost<SkillDefinition>(`/api/skills/${skillKey}/import`, {});
      await refreshSkills(skillKey);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to import skill.");
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleEnable(skillKey: string) {
    setPendingActionKey(skillKey);
    try {
      await apiPost<SkillDefinition>(`/api/skills/${skillKey}/enable`, {});
      await refreshSkills(skillKey);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to enable skill.");
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleDelete(skillKey: string) {
    if (!window.confirm(`确认删除 skill "${skillKey}" 吗？删除后它会从默认列表中移除。`)) {
      return;
    }
    setPendingActionKey(skillKey);
    try {
      await apiDelete<{ skillKey: string; status: string }>(`/api/skills/${skillKey}`);
      await refreshSkills(selectedSkillKey === skillKey ? null : selectedSkillKey);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete skill.");
    } finally {
      setPendingActionKey(null);
    }
  }

  if (error) {
    return <EmptyState>{t("common.failed")}: {error}</EmptyState>;
  }

  if (!skills.length) {
    return <EmptyState>{t("common.loading")}</EmptyState>;
  }

  return (
    <div className="grid gap-6">
      <Card className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="text-[0.76rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Skill Registry</div>
            <h2 className="mt-2 text-2xl font-semibold">Skill 管理</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              这里优先按 Claude Code 风格展示每个 skill 的作用、输入和输出。已导入的 skill 可以直接启用、禁用和运行；外部发现的 skill
              会先作为候选源展示，导入后再纳入本地 skill 仓库。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SummaryStat title="总数" value={String(skills.length)} />
            <SummaryStat
              title="已导入"
              value={String(skills.filter((skill) => skill.sourceScope === "graphite_managed").length)}
            />
            <SummaryStat
              title="外部待导入"
              value={String(skills.filter((skill) => skill.sourceScope === "external").length)}
            />
            <SummaryStat title="可直接运行" value={String(skills.filter((skill) => skill.runtimeRegistered).length)} />
          </div>
        </div>
      </Card>

      <section className="grid grid-cols-[380px_minmax(0,1fr)] gap-6 max-[1180px]:grid-cols-1">
        <Card className="grid gap-4 self-start">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[0.76rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Skill List</div>
              <h3 className="mt-1 text-xl font-semibold">已登记技能</h3>
            </div>
            <Badge>{filteredSkills.length} 项</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", "managed", "external"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setScopeFilter(filter)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                  scopeFilter === filter
                    ? "border-[rgba(154,52,18,0.3)] bg-[rgba(154,52,18,0.08)] text-[var(--accent-strong)]"
                    : "border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.7)] text-[var(--muted)] hover:bg-[rgba(255,250,241,0.92)]",
                )}
              >
                <span>{SCOPE_FILTER_LABELS[filter]}</span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[0.72rem] text-[var(--text)]">
                  {skills.filter((skill) => matchesScopeFilter(skill, filter)).length}
                </span>
              </button>
            ))}
          </div>

          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、作用、输入、输出" />

          <div className="grid gap-3">
            {filteredSkills.map((skill) => {
              const isActive = selectedSkill?.skillKey === skill.skillKey;
              return (
                <button
                  key={skill.skillKey}
                  type="button"
                  onClick={() => setSelectedSkillKey(skill.skillKey)}
                  className={cn(
                    "rounded-[20px] border px-4 py-3 text-left transition-colors",
                    isActive
                      ? "border-[rgba(154,52,18,0.35)] bg-[rgba(255,250,241,0.98)]"
                      : "border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.72)] hover:bg-[rgba(255,250,241,0.92)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-[var(--text)]">{skill.label}</div>
                      <div className="mt-1 truncate text-xs uppercase tracking-[0.08em] text-[var(--muted)]">{skill.skillKey}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge className={cn(skill.sourceScope === "graphite_managed" ? "text-[var(--success)]" : "text-[var(--accent-strong)]")}>
                        {skill.sourceScope === "graphite_managed" ? "已导入" : "外部发现"}
                      </Badge>
                      {skill.sourceScope === "graphite_managed" ? <Badge>{skill.status === "active" ? "启用中" : "已禁用"}</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{skill.description}</div>
                  <div className="mt-3 grid gap-1.5 rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.74)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                    <div className="flex items-start gap-2">
                      <span className="min-w-[32px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-strong)]">输入</span>
                      <span className="min-w-0 flex-1">{summarizeSchemaFields(skill.inputSchema)}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="min-w-[32px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-strong)]">输出</span>
                      <span className="min-w-0 flex-1">{summarizeSchemaFields(skill.outputSchema)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredSkills.length === 0 ? <EmptyState>没有匹配的 skill。</EmptyState> : null}
          </div>
        </Card>

        {selectedSkill ? (
          <div className="grid gap-6">
            <Card className="grid gap-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[0.76rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Skill Detail</div>
                  <h2 className="mt-2 text-2xl font-semibold">{selectedSkill.label}</h2>
                  <div className="mt-1 text-sm uppercase tracking-[0.08em] text-[var(--muted)]">{selectedSkill.skillKey}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={cn(selectedSkill.sourceScope === "graphite_managed" ? "text-[var(--success)]" : "text-[var(--accent-strong)]")}>
                    {selectedSkill.sourceScope === "graphite_managed" ? "已导入" : "外部发现"}
                  </Badge>
                  {selectedSkill.sourceScope === "graphite_managed" ? <Badge>{selectedSkill.status === "active" ? "启用中" : "已禁用"}</Badge> : null}
                  <Badge className={cn(selectedSkill.runtimeRegistered ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                    {selectedSkill.runtimeRegistered ? "可直接运行" : "未接运行时"}
                  </Badge>
                  <Badge>{FORMAT_LABELS[selectedSkill.sourceFormat]}</Badge>
                </div>
              </div>

              <div className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.72)] p-5">
                <div className="text-[0.76rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">作用</div>
                <p className="mt-2 text-[0.98rem] leading-7 text-[var(--muted)]">{selectedSkill.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-[960px]:grid-cols-1">
                <SchemaPreviewCard title="输入" fields={selectedSkill.inputSchema} emptyLabel="未声明输入字段。" />
                <SchemaPreviewCard title="输出" fields={selectedSkill.outputSchema} emptyLabel="未声明输出字段。" />
              </div>

              <div className="flex flex-wrap gap-3">
                {selectedSkill.canImport ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={pendingActionKey === selectedSkill.skillKey}
                    onClick={() => handleImport(selectedSkill.skillKey)}
                  >
                    导入到 GraphiteUI
                  </Button>
                ) : null}
                {selectedSkill.canManage && selectedSkill.status === "active" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pendingActionKey === selectedSkill.skillKey}
                    onClick={() => handleDisable(selectedSkill.skillKey)}
                  >
                    禁用
                  </Button>
                ) : null}
                {selectedSkill.canManage && selectedSkill.status !== "active" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pendingActionKey === selectedSkill.skillKey}
                    onClick={() => handleEnable(selectedSkill.skillKey)}
                  >
                    启用
                  </Button>
                ) : null}
                {selectedSkill.canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pendingActionKey === selectedSkill.skillKey}
                    onClick={() => handleDelete(selectedSkill.skillKey)}
                  >
                    删除
                  </Button>
                ) : null}
              </div>
            </Card>

            <section className="grid grid-cols-2 gap-6 max-[960px]:grid-cols-1">
              <SchemaCard title="Input Schema" emptyLabel="当前没有输入字段。" fields={selectedSkill.inputSchema} />
              <SchemaCard title="Output Schema" emptyLabel="当前没有输出字段。" fields={selectedSkill.outputSchema} />
            </section>

            <Card className="grid gap-4">
              <div className="grid grid-cols-2 gap-4 max-[960px]:grid-cols-1">
                <SubtleCard>
                  <div className="text-[0.76rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Value Types</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSkill.supportedValueTypes.length > 0 ? (
                      selectedSkill.supportedValueTypes.map((item) => <Badge key={item}>{item}</Badge>)
                    ) : (
                      <span className="text-sm text-[var(--muted)]">未声明</span>
                    )}
                  </div>
                </SubtleCard>
                <SubtleCard>
                  <div className="text-[0.76rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Side Effects</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSkill.sideEffects.length > 0 ? (
                      selectedSkill.sideEffects.map((item) => <Badge key={item}>{item}</Badge>)
                    ) : (
                      <span className="text-sm text-[var(--muted)]">无额外副作用</span>
                    )}
                  </div>
                </SubtleCard>
              </div>

              <details className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.72)] p-4">
                <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--text)]">Advanced</summary>
                <div className="mt-4 grid gap-4">
                  <div className="rounded-[18px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.75)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
                    <div>来源路径: {selectedSkill.sourcePath}</div>
                    <div>管理方式: {selectedSkill.canManage ? "已导入，可在 GraphiteUI 内管理" : "外部只读，需先导入"}</div>
                  </div>

                  <div className="grid gap-4">
                    {selectedSkill.compatibility.map((report) => (
                      <div key={report.target} className="rounded-[18px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.75)] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-base font-semibold text-[var(--text)]">
                            {report.target === "claude_code"
                              ? "Claude Code"
                              : report.target === "openclaw"
                                ? "OpenClaw"
                                : "Codex"}
                          </div>
                          <Badge>{COMPATIBILITY_LABELS[report.status]}</Badge>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{report.summary}</div>
                        {report.missingCapabilities.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {report.missingCapabilities.map((item) => (
                              <Badge key={item}>{item}</Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </Card>
          </div>
        ) : (
          <EmptyState>没有匹配的 skill。</EmptyState>
        )}
      </section>
    </div>
  );
}

function SummaryStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.72)] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

function SchemaPreviewCard({ title, emptyLabel, fields }: { title: string; emptyLabel: string; fields: SkillField[] }) {
  return (
    <div className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.72)] p-4">
      <div className="text-[0.76rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{title}</div>
      {fields.length > 0 ? (
        <div className="mt-3 grid gap-2.5">
          {fields.slice(0, 4).map((field) => (
            <div
              key={field.key}
              className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.76)] px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text)]">{field.label}</span>
                <Badge>{field.valueType}</Badge>
                {field.required ? <Badge className="text-[var(--danger)]">required</Badge> : null}
              </div>
              <div className="mt-1 text-sm leading-6 text-[var(--muted)]">{field.description || field.key}</div>
            </div>
          ))}
          {fields.length > 4 ? (
            <div className="text-sm text-[var(--muted)]">还有 {fields.length - 4} 个字段，展开下方 schema 可查看完整定义。</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 text-sm leading-6 text-[var(--muted)]">{emptyLabel}</div>
      )}
    </div>
  );
}

function SchemaCard({ title, emptyLabel, fields }: { title: string; emptyLabel: string; fields: SkillField[] }) {
  return (
    <Card className="grid gap-4">
      <div className="text-[0.76rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{title}</div>
      {fields.length > 0 ? (
        <div className="grid gap-3">
          {fields.map((field) => (
            <div key={field.key} className="rounded-[18px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.72)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold text-[var(--text)]">{field.label}</div>
                <Badge>{field.key}</Badge>
                <Badge>{field.valueType}</Badge>
                {field.required ? <Badge className="text-[var(--danger)]">required</Badge> : null}
              </div>
              <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{field.description || "暂无描述。"}</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>{emptyLabel}</EmptyState>
      )}
    </Card>
  );
}
