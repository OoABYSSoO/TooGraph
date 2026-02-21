type RunDisplayNameSource = {
  graph_name: string;
  started_at: string;
};

type RunDisplayNameOptions = {
  timeZone?: string;
};

const runDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function resolveRunDateTimeFormatter(timeZone?: string) {
  const cacheKey = timeZone?.trim() || "local";
  const cachedFormatter = runDateTimeFormatterCache.get(cacheKey);
  if (cachedFormatter) {
    return cachedFormatter;
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone?.trim() ? { timeZone: timeZone.trim() } : {}),
  });
  runDateTimeFormatterCache.set(cacheKey, formatter);
  return formatter;
}

export function formatRunDisplayTimestamp(startedAt: string, options: RunDisplayNameOptions = {}) {
  const rawValue = startedAt?.trim() || "";
  if (!rawValue) {
    return "Unknown Time";
  }
  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.valueOf())) {
    return rawValue;
  }
  const formattedParts = resolveRunDateTimeFormatter(options.timeZone).formatToParts(parsedDate);
  const partMap = Object.fromEntries(formattedParts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${partMap.year ?? "0000"}-${partMap.month ?? "00"}-${partMap.day ?? "00"} ${partMap.hour ?? "00"}:${partMap.minute ?? "00"}`;
}

export function formatRunDisplayName(run: RunDisplayNameSource, _options: RunDisplayNameOptions = {}) {
  return run.graph_name?.trim() || "Untitled Graph";
}

export function formatRunDuration(durationMs: number | null | undefined) {
  if (!Number.isFinite(durationMs) || !durationMs || durationMs <= 0) {
    return "—";
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 10) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
