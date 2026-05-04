export const API_BASE = import.meta.env?.VITE_API_BASE_URL?.trim() || "";

const MAX_HTTP_ERROR_DETAIL_LENGTH = 1200;

function buildApiUrl(path: string): string {
  if (!API_BASE) {
    return path;
  }

  return `${API_BASE.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateHttpErrorDetail(value: string): string {
  if (value.length <= MAX_HTTP_ERROR_DETAIL_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_HTTP_ERROR_DETAIL_LENGTH - 1)}...`;
}

function formatValidationIssues(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.issues)) {
    return "";
  }

  const issueMessages = value.issues.slice(0, 5).map((issue) => {
    if (!isRecord(issue)) {
      return "";
    }
    const message = typeof issue.message === "string" ? issue.message.trim() : "";
    const code = typeof issue.code === "string" ? issue.code.trim() : "";
    const path = typeof issue.path === "string" ? issue.path.trim() : "";
    const label = message || code;
    if (!label) {
      return "";
    }
    return path ? `${label} (${path})` : label;
  });

  const formattedIssues = issueMessages.filter(Boolean);
  if (value.issues.length > formattedIssues.length) {
    formattedIssues.push(`还有 ${value.issues.length - formattedIssues.length} 个问题`);
  }
  return formattedIssues.join("; ");
}

function formatFastApiValidationDetails(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  const detailMessages = value.slice(0, 5).map((detail) => {
    if (!isRecord(detail)) {
      return "";
    }
    const message = typeof detail.msg === "string" ? detail.msg.trim() : "";
    const type = typeof detail.type === "string" ? detail.type.trim() : "";
    const label = message || type;
    if (!label) {
      return "";
    }
    const location = Array.isArray(detail.loc)
      ? detail.loc
          .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
          .filter(Boolean)
          .join(".")
      : "";
    return location ? `${label} (${location})` : label;
  });

  const formattedDetails = detailMessages.filter(Boolean);
  if (value.length > formattedDetails.length) {
    formattedDetails.push(`还有 ${value.length - formattedDetails.length} 个问题`);
  }
  return formattedDetails.join("; ");
}

function formatHttpErrorPayload(payload: unknown): string {
  const detail = isRecord(payload) && "detail" in payload ? payload.detail : payload;

  if (typeof detail === "string") {
    return detail.trim();
  }

  const validationMessage = formatValidationIssues(detail);
  if (validationMessage) {
    return validationMessage;
  }

  const fastApiValidationMessage = formatFastApiValidationDetails(detail);
  if (fastApiValidationMessage) {
    return fastApiValidationMessage;
  }

  if (isRecord(detail)) {
    if (typeof detail.message === "string") {
      return detail.message.trim();
    }
    if (typeof detail.error === "string") {
      return detail.error.trim();
    }
  }

  if (isRecord(payload)) {
    if (typeof payload.message === "string") {
      return payload.message.trim();
    }
    if (typeof payload.error === "string") {
      return payload.error.trim();
    }
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

async function buildHttpErrorMessage(response: Response, method: string, path: string): Promise<string> {
  const baseMessage = `${method} ${path} failed with status ${response.status}`;
  let responseText = "";

  try {
    responseText = await response.text();
  } catch {
    return baseMessage;
  }

  const trimmedText = responseText.trim();
  if (!trimmedText) {
    return baseMessage;
  }

  let detail = "";
  try {
    detail = formatHttpErrorPayload(JSON.parse(trimmedText));
  } catch {
    detail = trimmedText;
  }

  const trimmedDetail = truncateHttpErrorDetail(detail.trim());
  return trimmedDetail ? `${baseMessage}: ${trimmedDetail}` : baseMessage;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), init);
  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "GET", path));
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "POST", path));
  }
  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "PUT", path));
  }
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "PATCH", path));
  }
  return response.json() as Promise<T>;
}

export async function apiPostText(path: string, payload: unknown): Promise<string> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "POST", path));
  }
  return response.text();
}

export async function apiPostForm<T>(path: string, payload: FormData): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    body: payload,
  });
  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "POST", path));
  }
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "DELETE", path));
  }
  return response.json() as Promise<T>;
}
