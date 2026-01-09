import Link from "next/link";

type EditorGraphPageProps = {
  params: Promise<{ graphId: string }>;
};

export default async function EditorGraphPage({ params }: EditorGraphPageProps) {
  const { graphId } = await params;

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-10">
      <section className="rounded-[28px] border border-[var(--line)] bg-[rgba(255,250,241,0.9)] p-8 shadow-[0_20px_60px_var(--shadow)]">
        <div className="grid gap-3">
          <span className="text-sm uppercase tracking-[0.12em] text-[var(--muted)]">Editor Rebuild Pending</span>
          <h1 className="text-3xl font-semibold text-[var(--text)]">当前编排器已下线重构</h1>
          <p className="max-w-3xl text-[0.98rem] leading-7 text-[var(--muted)]">
            目标图 ID：<span className="font-mono text-[var(--text)]">{graphId}</span>
          </p>
          <p className="max-w-3xl text-[0.98rem] leading-7 text-[var(--muted)]">
            旧的 editor 已删除，避免遗留交互逻辑继续影响下一轮实现。请在新会话中按照新的需求文档重建编排器。
          </p>
        </div>
      </section>

      <div className="grid gap-2 text-sm text-[var(--muted)]">
        <div>规格文档路径：<span className="font-mono text-[var(--text)]">docs/active/editor_rebuild_requirements.md</span></div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.9)] px-4 py-2 text-sm text-[var(--text)]"
          href="/editor"
        >
          返回编排器入口
        </Link>
      </div>
    </main>
  );
}
