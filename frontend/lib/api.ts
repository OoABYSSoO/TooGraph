const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8765";

export type ApiIssue = {
  code: string;
  message: string;
  path?: string | null;
};

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail || response.statusText;
    throw new Error(typeof detail === "string" ? detail : `DELETE ${path} failed.`);
  }

  return response.json() as Promise<T>;
}

export { API_BASE_URL };
