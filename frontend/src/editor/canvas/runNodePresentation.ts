export function resolveNodeRunPresentation(status: string | undefined, isCurrentRunNode: boolean) {
  if (status === "running" || status === "resuming") {
    return {
      haloClass: isCurrentRunNode ? "editor-canvas__node-halo--running-current" : "editor-canvas__node-halo--running",
      shellClass: isCurrentRunNode ? "editor-canvas__node--running-current" : "editor-canvas__node--running",
    };
  }

  if (status === "paused") {
    return {
      haloClass: isCurrentRunNode ? "editor-canvas__node-halo--paused-current" : "editor-canvas__node-halo--paused",
      shellClass: isCurrentRunNode ? "editor-canvas__node--paused-current" : "editor-canvas__node--paused",
    };
  }

  if (status === "success" || status === "completed") {
    return {
      haloClass: null,
      shellClass: "editor-canvas__node--success",
    };
  }

  if (status === "failed") {
    return {
      haloClass: null,
      shellClass: "editor-canvas__node--failed",
    };
  }

  return null;
}
