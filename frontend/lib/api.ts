const INTERNAL_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.API_BASE_URL ??
  "http://127.0.0.1:8765";

const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "";

function isLoopbackUrl(value: string) {
  return value.startsWith("http://127.0.0.1:") || value.startsWith("http://localhost:");
}

function isLoopbackHostname(value: string) {
  return value === "127.0.0.1" || value === "localhost";
}

function resolveApiBaseUrl() {
  if (typeof window === "undefined") {
    return INTERNAL_API_BASE_URL;
  }

  if (!PUBLIC_API_BASE_URL) {
    return "";
  }

  if (isLoopbackUrl(PUBLIC_API_BASE_URL) && !isLoopbackHostname(window.location.hostname)) {
    return "";
  }

  return PUBLIC_API_BASE_URL;
}

function buildApiUrl(path: string) {
  return `${resolveApiBaseUrl()}${path}`;
}

export type ApiIssue = {
  code: string;
  message: string;
  path?: string | null;
};

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail?.issues
      ? payload.detail.issues.map((issue: ApiIssue) => issue.message).join("; ")
      : payload?.detail || response.statusText;
    throw new Error(typeof detail === "string" ? detail : `POST ${path} failed.`);
  }

  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "DELETE",
    credentials: "same-origin",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail || response.statusText;
    throw new Error(typeof detail === "string" ? detail : `DELETE ${path} failed.`);
  }

  return response.json() as Promise<T>;
}

export { INTERNAL_API_BASE_URL, PUBLIC_API_BASE_URL };
