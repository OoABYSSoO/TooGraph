export const npmOfficialRegistry = "https://registry.npmjs.org/";
export const npmMirrorRegistry = "https://registry.npmmirror.com/";
export const pipOfficialIndexUrl = "https://pypi.org/simple";
export const pipTsinghuaIndexUrl = "https://pypi.tuna.tsinghua.edu.cn/simple";
export const defaultDownloadSourceProbeTimeoutMs = 3500;

function isFlagEnabled(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isDownloadSourceCheckSkipped(env = process.env) {
  return isFlagEnabled(env.TOOGRAPH_SKIP_SOURCE_CHECK);
}

function normalizeUrl(value, { trailingSlash }) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const url = new URL(raw);
  if (trailingSlash) {
    if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }
  } else if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function normalizeNpmRegistry(value) {
  return normalizeUrl(value, { trailingSlash: true });
}

export function normalizePipIndexUrl(value) {
  return normalizeUrl(value, { trailingSlash: false });
}

export function npmProbeUrl(registryUrl) {
  return new URL("vue", normalizeNpmRegistry(registryUrl)).toString();
}

export function pipProbeUrl(indexUrl) {
  return new URL("fastapi/", `${normalizePipIndexUrl(indexUrl)}/`).toString();
}

export function redactUrlCredentials(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    if (url.username) {
      url.username = "***";
    }
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate) {
      return false;
    }
    if (!candidate.url || seen.has(candidate.url)) {
      return false;
    }
    seen.add(candidate.url);
    return true;
  });
}

function candidate(kind, label, url) {
  if (kind === "npm") {
    const normalizedUrl = normalizeNpmRegistry(url);
    return {
      kind,
      label,
      url: normalizedUrl,
      probeUrl: npmProbeUrl(normalizedUrl),
    };
  }

  if (kind === "pip") {
    const normalizedUrl = normalizePipIndexUrl(url);
    return {
      kind,
      label,
      url: normalizedUrl,
      probeUrl: pipProbeUrl(normalizedUrl),
    };
  }

  throw new Error(`Unsupported download source kind: ${kind}`);
}

function maybeCandidate(kind, label, url) {
  try {
    return candidate(kind, label, url);
  } catch {
    return null;
  }
}

function forcedSource(kind, env) {
  if (kind === "npm" && env.TOOGRAPH_NPM_REGISTRY) {
    return candidate(kind, "TOOGRAPH_NPM_REGISTRY", env.TOOGRAPH_NPM_REGISTRY);
  }
  if (kind === "pip" && env.TOOGRAPH_PIP_INDEX_URL) {
    return candidate(kind, "TOOGRAPH_PIP_INDEX_URL", env.TOOGRAPH_PIP_INDEX_URL);
  }
  return null;
}

export function buildDownloadSourceCandidates({ kind, configuredUrl, env = process.env } = {}) {
  const forced = forcedSource(kind, env);
  if (forced) {
    return [forced];
  }

  if (kind === "npm") {
    return uniqueCandidates([
      maybeCandidate(kind, "configured npm registry", configuredUrl || npmOfficialRegistry),
      candidate(kind, "npm official registry", npmOfficialRegistry),
      candidate(kind, "npmmirror registry", npmMirrorRegistry),
    ]);
  }

  if (kind === "pip") {
    return uniqueCandidates([
      maybeCandidate(kind, "configured pip index-url", configuredUrl || pipOfficialIndexUrl),
      candidate(kind, "PyPI official index", pipOfficialIndexUrl),
      candidate(kind, "Tsinghua PyPI mirror", pipTsinghuaIndexUrl),
    ]);
  }

  throw new Error(`Unsupported download source kind: ${kind}`);
}

async function probeDownloadSource(candidateToProbe, { fetchImpl = fetch, timeoutMs = defaultDownloadSourceProbeTimeoutMs } = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(candidateToProbe.probeUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      candidate: candidateToProbe,
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      candidate: candidateToProbe,
      ok: false,
      error: error?.message || String(error),
      elapsedMs: Date.now() - startedAt,
    };
  }
}

export async function probeDownloadSources(candidates, options = {}) {
  return Promise.all(candidates.map((candidateToProbe) => probeDownloadSource(candidateToProbe, options)));
}

export function chooseBestDownloadSource(results) {
  const reachable = results.filter((result) => result.ok);
  if (reachable.length === 0) {
    const fallback = results[0]?.candidate;
    if (!fallback) {
      throw new Error("No download source candidates were provided");
    }
    return {
      ...fallback,
      mode: "fallback",
      elapsedMs: results[0]?.elapsedMs,
      status: results[0]?.status,
      results,
    };
  }

  const best = [...reachable].sort((left, right) => left.elapsedMs - right.elapsedMs)[0];
  return {
    ...best.candidate,
    mode: "probed",
    elapsedMs: best.elapsedMs,
    status: best.status,
    results,
  };
}

export async function selectDownloadSource({
  kind,
  configuredUrl,
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = defaultDownloadSourceProbeTimeoutMs,
} = {}) {
  const candidates = buildDownloadSourceCandidates({
    kind,
    configuredUrl,
    env,
  });

  if (forcedSource(kind, env)) {
    return {
      ...candidates[0],
      mode: "forced",
      results: [],
    };
  }

  if (isDownloadSourceCheckSkipped(env)) {
    return {
      ...candidates[0],
      mode: "skipped",
      results: [],
    };
  }

  const results = await probeDownloadSources(candidates, {
    fetchImpl,
    timeoutMs,
  });
  return chooseBestDownloadSource(results);
}
