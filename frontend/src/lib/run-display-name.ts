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

export function formatRunDisplayName(run: RunDisplayNameSource, options: RunDisplayNameOptions = {}) {
  const graphName = run.graph_name?.trim() || "Untitled Graph";
  return `${graphName} · ${formatRunDisplayTimestamp(run.started_at, options)}`;
}
