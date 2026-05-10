function normalizePid(value) {
  const pid = String(value ?? "").trim();
  return /^\d+$/.test(pid) ? pid : "";
}

function normalizeText(value) {
  return String(value ?? "").replaceAll("\\", "/").toLowerCase();
}

function textIncludesPath(text, path) {
  const normalizedPath = normalizeText(path);
  return normalizedPath.length > 0 && text.includes(normalizedPath);
}

function processText(info) {
  return normalizeText([info?.name, info?.executablePath, info?.commandLine].filter(Boolean).join(" "));
}

export function isTooGraphProcessInfo(info, context) {
  if (!info) {
    return false;
  }

  const text = processText(info);
  if (
    textIncludesPath(text, context.rootDir) ||
    textIncludesPath(text, context.backendDir) ||
    textIncludesPath(text, context.frontendDir)
  ) {
    return true;
  }

  return false;
}

function normalizeProcessInfo(info) {
  return {
    ...info,
    pid: normalizePid(info?.pid ?? info?.ProcessId),
    parentPid: normalizePid(info?.parentPid ?? info?.ParentProcessId),
    name: info?.name ?? info?.Name ?? "",
    executablePath: info?.executablePath ?? info?.ExecutablePath ?? "",
    commandLine: info?.commandLine ?? info?.CommandLine ?? "",
  };
}

function descendantsOf(pid, processInfos) {
  const descendants = [];
  const queue = [pid];
  const seen = new Set(queue);

  while (queue.length > 0) {
    const currentPid = queue.shift();
    for (const info of processInfos) {
      if (info.parentPid !== currentPid || seen.has(info.pid)) {
        continue;
      }
      seen.add(info.pid);
      descendants.push(info);
      queue.push(info.pid);
    }
  }

  return descendants;
}

export function formatProcessInfo(info) {
  const parts = [`PID ${info.pid}`];
  if (info.parentPid) {
    parts.push(`parent ${info.parentPid}`);
  }
  if (info.name) {
    parts.push(info.name);
  }
  if (info.executablePath) {
    parts.push(info.executablePath);
  }
  if (info.commandLine) {
    parts.push(info.commandLine);
  }
  return parts.join(" | ");
}

function pushUnique(items, value) {
  if (value && !items.includes(value)) {
    items.push(value);
  }
}

export function createPortReleasePlan({ portPids, processInfos, context }) {
  const normalizedProcessInfos = processInfos.map(normalizeProcessInfo).filter((info) => info.pid);
  const processByPid = new Map(normalizedProcessInfos.map((info) => [info.pid, info]));
  const killPids = [];
  const blockedOwners = [];

  for (const rawPid of portPids) {
    const pid = normalizePid(rawPid);
    if (!pid) {
      continue;
    }

    const ownerInfo = processByPid.get(pid);
    const descendants = descendantsOf(pid, normalizedProcessInfos);
    const knownOwner = context.knownTooGraphPids.has(pid);
    const ownerLooksLikeTooGraph = isTooGraphProcessInfo(ownerInfo, context);
    const ownedDescendants = descendants.filter(
      (info) => context.knownTooGraphPids.has(info.pid) || isTooGraphProcessInfo(info, context),
    );

    if (knownOwner || ownerLooksLikeTooGraph || ownedDescendants.length > 0) {
      if (ownerInfo) {
        pushUnique(killPids, pid);
      }
      for (const descendant of descendants) {
        pushUnique(killPids, descendant.pid);
      }
      continue;
    }

    if (ownerInfo) {
      blockedOwners.push(formatProcessInfo(ownerInfo));
    } else if (descendants.length > 0) {
      blockedOwners.push(
        `PID ${pid} is not visible in the process table; child process(es): ${descendants
          .map(formatProcessInfo)
          .join("; ")}`,
      );
    } else {
      blockedOwners.push(`PID ${pid} is not visible in the process table.`);
    }
  }

  return { killPids, blockedOwners };
}
