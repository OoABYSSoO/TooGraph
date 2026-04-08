import Link from "next/link";

export default function EditorPage() {
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-10">
      <section className="rounded-[28px] border border-[var(--line)] bg-[rgba(255,250,241,0.9)] p-8 shadow-[0_20px_60px_var(--shadow)]">
        <div className="grid gap-3">
          <span className="text-sm uppercase tracking-[0.12em] text-[var(--muted)]">Editor Reset</span>
          <h1 className="text-3xl font-semibold text-[var(--text)]">编排器已清空，等待按新规格重建。</h1>
          <p className="max-w-3xl text-[0.98rem] leading-7 text-[var(--muted)]">
            旧的编排器实现已移除，避免历史交互和状态模型继续影响下一轮开发。当前页面只保留重构说明和新规格文档入口。
          </p>
        </div>
      </section>

      <section className="grid gap-4 rounded-[24px] border border-[var(--line)] bg-[rgba(255,255,255,0.76)] p-6">
        <h2 className="text-xl font-semibold text-[var(--text)]">下一步</h2>
        <ul className="grid gap-2 text-[var(--muted)]">
          <li>1. 阅读新的编排器需求文档。</li>
          <li>2. 新会话中按文档逐项重建 editor。</li>
          <li>3. 先实现空白画布、拖拽建点、缩放和平移，再接回 hello world 运行链路。</li>
        </ul>
        <div className="grid gap-2 pt-2 text-sm text-[var(--muted)]">
          <div>规格文档路径：<span className="font-mono text-[var(--text)]">docs/active/editor_rebuild_requirements.md</span></div>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.9)] px-4 py-2 text-sm text-[var(--text)]"
            href="/workspace"
          >
            返回工作台
          </Link>
        </div>
      </section>
    </main>
  );
}
