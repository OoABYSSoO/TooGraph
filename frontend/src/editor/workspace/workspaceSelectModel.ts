export type WorkspaceSelectOption = {
  value: string;
  label: string;
};

export type PaginatedWorkspaceOptions = {
  items: WorkspaceSelectOption[];
  page: number;
  pageCount: number;
  hasPagination: boolean;
};

export function buildWorkspaceSelectOptions(options: WorkspaceSelectOption[]) {
  return options.map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

export function hasWorkspaceSelectOptions(options: WorkspaceSelectOption[]) {
  return options.length > 0;
}

export function paginateWorkspaceOptions(
  options: WorkspaceSelectOption[],
  requestedPage: number,
  pageSize = 5,
): PaginatedWorkspaceOptions {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(options.length / safePageSize));
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), pageCount - 1);
  const start = page * safePageSize;
  return {
    items: options.slice(start, start + safePageSize),
    page,
    pageCount,
    hasPagination: options.length > safePageSize,
  };
}

export function resolveWorkspaceSelectTriggerLabel(input: {
  value: string;
  placeholder: string;
  options: WorkspaceSelectOption[];
}) {
  if (!input.value) {
    return input.placeholder;
  }

  return input.options.find((option) => option.value === input.value)?.label ?? input.placeholder;
}
