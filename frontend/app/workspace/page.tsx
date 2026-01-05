import { WorkspaceDashboardClient } from "@/components/workspace/workspace-dashboard-client";

export default function WorkspacePage() {
  return (
    <div className="page">
      <section>
        <div className="eyebrow">Workspace</div>
        <h1 className="page-title">Recent graphs, active runs, and next actions.</h1>
        <p className="page-subtitle">
          This page is the operational home for GraphiteUI. It points people into the editor
          without mixing the canvas into the dashboard itself.
        </p>
      </section>

      <WorkspaceDashboardClient />
    </div>
  );
}
