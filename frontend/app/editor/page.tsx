import Link from "next/link";

import { apiGet } from "@/lib/api";
import type { CanonicalGraphPayload, CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import type { GraphSummary, TemplateSummary } from "@/lib/types";

async function loadEditorLandingData() {
  try {
    const [graphs, templates] = await Promise.all([
      apiGet<CanonicalGraphPayload[]>("/api/graphs"),
      apiGet<CanonicalTemplateRecord[]>("/api/templates"),
    ]);
    return {
      graphs: graphs.map((graph) => {
        return {
          graph_id: graph.graph_id ?? "",
          name: graph.name,
          node_count: Object.keys(graph.nodes).length,
          edge_count: graph.edges.length + graph.conditional_edges.reduce((count, entry) => count + Object.keys(entry.branches).length, 0),
        } satisfies GraphSummary;
      }),
      templates: templates.map((template) => ({
        template_id: template.template_id,
        label: template.label,
        description: template.description,
      }) satisfies TemplateSummary),
    };
  } catch {
    return { graphs: [] as GraphSummary[], templates: [] as TemplateSummary[] };
  }
}

export default async function EditorPage() {
  const { graphs, templates } = await loadEditorLandingData();

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8">
      <section className="rounded-[32px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.9)] p-8 shadow-[0_20px_60px_var(--shadow)]">
        <div className="grid gap-3">
          <span className="text-sm uppercase tracking-[0.12em] text-[var(--accent-strong)]">Canvas First Editor</span>
          <h1 className="text-4xl font-semibold text-[var(--text)]">新编排器入口</h1>
          <p className="max-w-3xl text-[0.98rem] leading-7 text-[var(--muted)]">
            当前 editor 已按 `hello_world` 第一阶段目标重建入口。你可以新建空白图，或继续编辑已保存 graph。
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center rounded-full border border-[var(--accent)] bg-[var(--accent)] px-5 py-2.5 text-sm text-white"
            href="/editor/new"
          >
            新建空白图
          </Link>
          <Link
            className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.9)] px-5 py-2.5 text-sm text-[var(--text)]"
            href="/workspace"
          >
            返回工作台
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.78)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text)]">Available Templates</h2>
          <div className="mt-4 grid gap-3">
            {templates.map((template) => (
              <div key={template.template_id} className="rounded-[20px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.86)] p-4">
                <div className="text-sm uppercase tracking-[0.08em] text-[var(--accent-strong)]">{template.template_id}</div>
                <div className="mt-1 text-lg font-semibold text-[var(--text)]">{template.label}</div>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{template.description}</p>
                <div className="mt-4">
                  <Link
                    className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.92)] px-4 py-2 text-sm text-[var(--text)]"
                    href={`/editor/new?template=${template.template_id}`}
                  >
                    使用这个模板创建
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.78)] p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-[var(--text)]">已有图</h2>
            <div className="text-sm text-[var(--muted)]">{graphs.length} graphs</div>
          </div>
          <div className="mt-4 grid gap-3">
            {graphs.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[rgba(154,52,18,0.2)] bg-[rgba(255,250,241,0.7)] px-5 py-8 text-sm text-[var(--muted)]">
                还没有已保存图。先创建一个新的 `hello_world` 图来验证保存、校验和运行链路。
              </div>
            ) : (
              graphs.map((graph) => (
                <Link
                  key={graph.graph_id}
                  href={`/editor/${graph.graph_id}`}
                  className="rounded-[22px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.86)] p-4 transition-transform hover:-translate-y-px"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-[var(--text)]">{graph.name}</div>
                      <div className="text-sm text-[var(--muted)]">{graph.graph_id}</div>
                    </div>
                    <div className="text-right text-sm text-[var(--muted)]">
                      <div>{graph.node_count} nodes / {graph.edge_count} edges</div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
