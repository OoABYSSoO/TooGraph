export function resolveNodeRunPresentation(status: string | undefined, _isCurrentRunNode: boolean) {
  if (status === "running" || status === "resuming") {
    return {
      haloClass: "editor-canvas__node-halo--running",
      shellClass: "editor-canvas__node--running",
    };
  }

  if (status === "paused") {
    return {
      haloClass: "editor-canvas__node-halo--paused",
      shellClass: "editor-canvas__node--paused",
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
