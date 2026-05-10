import { spawn, execFile } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPortReleasePlan } from "./dev-port-ownership.mjs";
import { resolveFrontendBuildPlan, writeFrontendBuildManifest } from "./frontend-build-plan.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(rootDir, "backend");
const frontendDir = resolve(rootDir, "frontend");
const frontendDistDir = resolve(frontendDir, "dist");

const isWindows = process.platform === "win32";
const appPort = String(process.env.PORT || process.env.TOOGRAPH_PORT || "3477");
const legacyBackendPort = String(process.env.TOOGRAPH_LEGACY_BACKEND_PORT || "8765");
const serverLogPath = resolve(rootDir, ".toograph_server.log");
const pidPath = resolve(rootDir, ".toograph_pids.json");
const legacyPidPath = resolve(rootDir, ".dev_pids.json");
const legacyBackendLogPath = resolve(rootDir, ".dev_backend.log");
const legacyFrontendLogPath = resolve(rootDir, ".dev_frontend.log");

let serverProcess;
let stopping = false;

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolveExec, rejectExec) => {
    execFile(
      command,
      args,
      {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          rejectExec(error);
          return;
        }
        resolveExec({ stdout, stderr });
      },
    );
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio || "inherit",
      windowsHide: true,
    });

    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${options.label || command} exited with code ${code ?? "null"} signal ${signal ?? "null"}`));
    });
  });
}

function npmCommand(args) {
  const npmExecutable = process.env.NPM || (isWindows ? "npm.cmd" : "npm");
  if (isWindows) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", npmExecutable, ...args],
    };
  }
  return { command: npmExecutable, args };
}

function matchesPort(localAddress, port) {
  const separatorIndex = localAddress.lastIndexOf(":");
  return separatorIndex >= 0 && localAddress.slice(separatorIndex + 1) === port;
}

async function findWindowsPortPids(port) {
  const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"]);
  const pids = new Set();

  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== "TCP" || parts.length < 5) {
      continue;
    }

    const [, localAddress, , state, pid] = parts;
    if (state === "LISTENING" && matchesPort(localAddress, port) && /^\d+$/.test(pid)) {
      pids.add(pid);
    }
  }

  return [...pids].filter((pid) => pid !== String(process.pid));
}

async function findUnixPortPids(port) {
  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    return [...new Set(stdout.split(/\s+/).filter(Boolean))];
  } catch {
    try {
      const { stdout } = await execFileAsync("fuser", [`${port}/tcp`]);
      return [...new Set(stdout.split(/\s+/).filter(Boolean))];
    } catch {
      return [];
    }
  }
}

async function findPortPids(port) {
  try {
    return isWindows ? await findWindowsPortPids(port) : await findUnixPortPids(port);
  } catch {
    return [];
  }
}

function addPid(pids, value) {
  const pid = String(value ?? "").trim();
  if (/^\d+$/.test(pid)) {
    pids.add(pid);
  }
}

function addPidStatePids(pids, statePath) {
  if (!existsSync(statePath)) {
    return;
  }

  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (state.rootDir !== rootDir) {
      return;
    }
    addPid(pids, state.launcherPid);
    addPid(pids, state.server?.pid);
    addPid(pids, state.backend?.pid);
    addPid(pids, state.frontend?.pid);
  } catch {
    // A corrupt stale PID file should not block startup.
  }
}

function addLogPids(pids, logPath) {
  if (!existsSync(logPath)) {
    return;
  }

  const content = readFileSync(logPath, "utf8");
  const patterns = [
    /Started (?:reloader|server) process \[(\d+)\]/g,
    /\b(?:Server|Backend|Frontend) PID:\s*(\d+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      addPid(pids, match[1]);
    }
  }
}

function loadKnownTooGraphPids() {
  const pids = new Set();
  addPidStatePids(pids, pidPath);
  addPidStatePids(pids, legacyPidPath);
  addLogPids(pids, serverLogPath);
  addLogPids(pids, legacyBackendLogPath);
  addLogPids(pids, legacyFrontendLogPath);
  return pids;
}

function parseProcessJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function listWindowsProcessInfos() {
  const script = [
    "$ErrorActionPreference = 'Stop';",
    "Get-CimInstance Win32_Process | ForEach-Object {",
    "[pscustomobject]@{",
    "pid=[string]$_.ProcessId;",
    "parentPid=[string]$_.ParentProcessId;",
    "name=$_.Name;",
    "executablePath=$_.ExecutablePath;",
    "commandLine=$_.CommandLine",
    "}",
    "} | ConvertTo-Json -Compress",
  ].join(" ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script]);
  return parseProcessJson(stdout);
}

async function listUnixProcessInfos() {
  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,comm=,args="]);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/))
    .filter(Boolean)
    .map((match) => ({
      pid: match[1],
      parentPid: match[2],
      name: match[3],
      commandLine: match[4],
    }));
}

async function listProcessInfos() {
  try {
    return isWindows ? await listWindowsProcessInfos() : await listUnixProcessInfos();
  } catch {
    return [];
  }
}

function portReleaseContext() {
  return {
    knownTooGraphPids: loadKnownTooGraphPids(),
    rootDir,
    backendDir,
    frontendDir,
    backendPort: appPort,
    frontendPort: appPort,
    appPort,
  };
}

async function terminatePids(pids) {
  if (isWindows) {
    await Promise.all(
      pids.map((pid) =>
        execFileAsync("taskkill", ["/PID", pid, "/T", "/F"]).catch(() => undefined),
      ),
    );
    return;
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // The process may already be gone.
    }
  }
  await sleep(1000);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGKILL");
    } catch {
      // The process may already be gone.
    }
  }
}

async function createReleasePlan(port) {
  const pids = await findPortPids(port);
  if (pids.length === 0) {
    return null;
  }

  return createPortReleasePlan({
    port,
    portPids: pids,
    processInfos: await listProcessInfos(),
    context: portReleaseContext(),
  });
}

async function killPortPids(port) {
  const plan = await createReleasePlan(port);
  if (!plan) {
    return;
  }

  if (plan.blockedOwners.length > 0) {
    console.error(`Port ${port} is used by process(es) that do not look like TooGraph:`);
    for (const owner of plan.blockedOwners) {
      console.error(`  ${owner}`);
    }
    throw new Error(`Port ${port} is occupied by another program. Stop that program or change PORT.`);
  }

  if (plan.killPids.length === 0) {
    throw new Error(`Port ${port} is occupied, but no live TooGraph process could be found to terminate.`);
  }

  console.log(`Releasing TooGraph process(es) on port ${port}: ${plan.killPids.join(", ")}`);
  await terminatePids(plan.killPids);
  await sleep(1000);
  const remainingPids = await findPortPids(port);
  if (remainingPids.length > 0) {
    throw new Error(`Failed to release port ${port}; still used by PID(s): ${remainingPids.join(", ")}`);
  }
}

async function releaseLegacyTooGraphPort(port) {
  if (!port || port === appPort) {
    return;
  }

  const plan = await createReleasePlan(port);
  if (!plan || plan.killPids.length === 0) {
    return;
  }

  console.log(`Stopping legacy TooGraph process(es) on port ${port}: ${plan.killPids.join(", ")}`);
  await terminatePids(plan.killPids);
}

function writePidState() {
  writeFileSync(
    pidPath,
    `${JSON.stringify(
      {
        rootDir,
        startedAt: new Date().toISOString(),
        launcherPid: process.pid,
        server: {
          pid: serverProcess?.pid,
          port: appPort,
        },
      },
      null,
      2,
    )}\n`,
  );
}

function clearPidState() {
  if (existsSync(pidPath)) {
    try {
      const state = JSON.parse(readFileSync(pidPath, "utf8"));
      if (String(state.launcherPid ?? "") !== String(process.pid)) {
        return;
      }
    } catch {
      // Remove unreadable state written by this launcher path.
    }
  }
  rmSync(pidPath, { force: true });
}

async function resolvePythonCommand() {
  const candidates = [];
  if (process.env.PYTHON) {
    candidates.push({ command: process.env.PYTHON, prefixArgs: [] });
  }

  if (process.env.CONDA_PREFIX) {
    candidates.push({
      command: isWindows
        ? join(process.env.CONDA_PREFIX, "python.exe")
        : join(process.env.CONDA_PREFIX, "bin", "python"),
      prefixArgs: [],
    });
  }

  if (isWindows && process.env.CONDA_EXE) {
    candidates.push({
      command: resolve(dirname(process.env.CONDA_EXE), "..", "python.exe"),
      prefixArgs: [],
    });
  }

  if (isWindows) {
    candidates.push({ command: "C:\\ProgramData\\miniconda3\\python.exe", prefixArgs: [] });
    candidates.push(
      { command: "py", prefixArgs: ["-3"] },
      { command: "python", prefixArgs: [] },
      { command: "python3", prefixArgs: [] },
    );
  } else {
    candidates.push(
      { command: "python3", prefixArgs: [] },
      { command: "python", prefixArgs: [] },
    );
  }

  for (const candidate of candidates) {
    try {
      await execFileAsync(
        candidate.command,
        [
          ...candidate.prefixArgs,
          "-c",
          "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)",
        ],
        { timeout: 5000 },
      );
      return candidate;
    } catch {
      // Try the next Python executable name.
    }
  }

  return null;
}

async function waitForHttp(url, retries, delayMs) {
  for (let index = 0; index < retries; index += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // The service may still be booting.
    }
    await sleep(delayMs);
  }
  return false;
}

function writeLogHeader(stream, label) {
  stream.write(`Starting ${label} at ${new Date().toISOString()}\n`);
  stream.write("=".repeat(72));
  stream.write("\n");
}

function spawnLoggedProcess(command, args, options, logPath, label) {
  const logStream = createWriteStream(logPath, { flags: "w" });
  writeLogHeader(logStream, label);

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: !isWindows,
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.once("spawn", () => {
    const pidLine = `${label} PID: ${child.pid}`;
    console.log(pidLine);
    logStream.write(`${pidLine}\n`);
  });
  child.once("error", (error) => {
    logStream.write(`\nFailed to start ${label}: ${error.message}\n`);
  });
  child.once("exit", (code, signal) => {
    logStream.write(`\n${label} exited with code ${code ?? "null"} signal ${signal ?? "null"}\n`);
    logStream.end();
  });

  return child;
}

async function printLogTail(logPath) {
  const command = isWindows
    ? ["powershell.exe", ["-NoProfile", "-Command", `Get-Content -LiteralPath '${logPath.replace(/'/g, "''")}' -Tail 20`]]
    : ["tail", ["-20", logPath]];

  try {
    const { stdout, stderr } = await execFileAsync(command[0], command[1]);
    const output = `${stdout}${stderr}`.trim();
    if (output) {
      console.log(output);
    }
  } catch {
    // The log may not exist yet.
  }
}

async function stopProcessTree(child) {
  if (!child?.pid) {
    return;
  }

  if (isWindows) {
    await execFileAsync("taskkill", ["/PID", String(child.pid), "/T", "/F"]).catch(() => undefined);
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      // The process may already be gone.
    }
  }
}

async function stopServices() {
  if (stopping) {
    return;
  }

  stopping = true;
  if (!serverProcess) {
    return;
  }

  console.log("\nStopping TooGraph service...");
  await stopProcessTree(serverProcess);
  clearPidState();
  console.log("Service stopped.");
}

async function buildFrontend() {
  if (!existsSync(resolve(frontendDir, "node_modules"))) {
    console.warn("Warning: frontend/node_modules was not found. Run `npm --prefix frontend install` first if startup fails.");
  }

  const buildPlan = resolveFrontendBuildPlan({
    frontendDir,
    distDir: frontendDistDir,
    env: process.env,
  });
  if (!buildPlan.shouldBuild) {
    console.log("Frontend build is up to date; skipping.");
    return;
  }

  const build = npmCommand(["run", "build"]);
  if (buildPlan.reason === "forced") {
    console.log("Building frontend... (forced by TOOGRAPH_FORCE_FRONTEND_BUILD)");
  } else if (buildPlan.reason === "missing_dist") {
    console.log("Building frontend... (frontend/dist/index.html was not found)");
  } else if (buildPlan.reason === "missing_manifest") {
    console.log("Building frontend... (frontend build manifest was not found)");
  } else if (buildPlan.reason === "invalid_manifest") {
    console.log("Building frontend... (frontend build manifest is invalid)");
  } else if (buildPlan.reason === "source_changed") {
    console.log("Building frontend... (frontend input hash changed)");
  } else {
    console.log("Building frontend...");
  }
  await runCommand(build.command, build.args, {
    cwd: frontendDir,
    env: process.env,
    label: "Frontend build",
  });
  writeFrontendBuildManifest({
    frontendDir,
    distDir: frontendDistDir,
  });
  console.log("Frontend build manifest updated.");
}

async function main() {
  console.log("Starting TooGraph...");
  console.log(`  URL : http://127.0.0.1:${appPort}`);
  console.log(`  Port: ${appPort}`);
  console.log(`  Log : ${serverLogPath}`);
  console.log("");

  const python = await resolvePythonCommand();
  if (!python) {
    throw new Error("Python 3.11+ was not found. Install Python or set PYTHON to its executable path.");
  }

  await buildFrontend();
  await killPortPids(appPort);
  await releaseLegacyTooGraphPort(legacyBackendPort);

  serverProcess = spawnLoggedProcess(
    python.command,
    [
      ...python.prefixArgs,
      "-m",
      "uvicorn",
      "app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      appPort,
    ],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        TOOGRAPH_FRONTEND_DIST: frontendDistDir,
      },
    },
    serverLogPath,
    "Server",
  );

  writePidState();

  const serverReady = await waitForHttp(`http://127.0.0.1:${appPort}/health`, 30, 500);
  if (!serverReady) {
    console.error(`TooGraph failed to start. Check ${serverLogPath}`);
    await printLogTail(serverLogPath);
    await stopServices();
    process.exit(1);
  }

  console.log("");
  console.log("TooGraph started.");
  console.log(`  Open: http://127.0.0.1:${appPort}`);
  console.log(`  Health: http://127.0.0.1:${appPort}/health`);
  console.log("");
  console.log("Press Ctrl+C to stop.");
  console.log("");

  serverProcess.once("exit", async () => {
    if (stopping) {
      return;
    }
    console.error(`TooGraph server exited unexpectedly. Check ${serverLogPath}`);
    await printLogTail(serverLogPath);
    await stopServices();
    process.exit(1);
  });
}

process.on("SIGINT", async () => {
  await stopServices();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await stopServices();
  process.exit(0);
});

main().catch(async (error) => {
  console.error(error.message);
  await stopServices();
  process.exit(1);
});
