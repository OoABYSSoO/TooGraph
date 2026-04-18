export type RunsPageEmptyAction = {
  href: string;
  label: string;
};

export function resolveRunsEmptyAction(): RunsPageEmptyAction {
  return {
    href: "/editor",
    label: "打开编排器",
  };
}

export function resolveRunsCardDetail() {
  return "查看详情";
}
