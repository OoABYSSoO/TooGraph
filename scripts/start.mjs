import { spawn, execFile } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(rootDir, "backend");
const frontendDir = resolve(rootDir, "frontend");

const isWindows = process.platform === "win32";
const backendPort = String(process.env.BACKEND_PORT || "8765");
const frontendPort = String(process.env.FRONTEND_PORT || "3477");
const backendLogPath = resolve(rootDir, ".dev_backend.log");
const frontendLogPath = resolve(rootDir, ".dev_frontend.log");

let backendProcess;
let frontendProcess;
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

async function killPortPids(port) {
  const pids = await findPortPids(port);
  if (pids.length === 0) {
    return;
  }

  console.log(`Releasing port ${port} used by PID(s): ${pids.join(", ")}`);
  if (isWindows) {
    await Promise.all(
      pids.map((pid) =>
        execFileAsync("taskkill", ["/PID", pid, "/T", "/F"]).catch(() => undefined),
      ),
    );
  } else {
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        // The process may already be gone.
      }
    }
    await sleep(1000);
    for (const pid of await findPortPids(port)) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        // The process may already be gone.
      }
    }
  }

  await sleep(1000);
  const remainingPids = await findPortPids(port);
  if (remainingPids.length > 0) {
    throw new Error(`Failed to release port ${port}; still used by PID(s): ${remainingPids.join(", ")}`);
  }
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
    console.log(`${label} PID: ${child.pid}`);
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
  if (!frontendProcess && !backendProcess) {
    return;
  }

  console.log("\nStopping GraphiteUI services...");
  await Promise.all([stopProcessTree(frontendProcess), stopProcessTree(backendProcess)]);
  console.log("Services stopped.");
}

async function main() {
  console.log("Starting GraphiteUI dev environment...");
  console.log(`  Backend port : ${backendPort}`);
  console.log(`  Frontend port: ${frontendPort}`);
  console.log(`  Backend log  : ${backendLogPath}`);
  console.log(`  Frontend log : ${frontendLogPath}`);
  console.log("");

  const python = await resolvePythonCommand();
  if (!python) {
    throw new Error("Python 3.11+ was not found. Install Python or set PYTHON to its executable path.");
  }

  if (!existsSync(resolve(frontendDir, "node_modules"))) {
    console.warn("Warning: frontend/node_modules was not found. Run `npm.cmd install` in frontend first if startup fails.");
  }

  await killPortPids(backendPort);
  await killPortPids(frontendPort);

  backendProcess = spawnLoggedProcess(
    python.command,
    [
      ...python.prefixArgs,
      "-m",
      "uvicorn",
      "app.main:app",
      "--reload",
      "--port",
      backendPort,
    ],
    {
      cwd: backendDir,
      env: process.env,
    },
    backendLogPath,
    "Backend",
  );

  const npmExecutable = process.env.NPM || (isWindows ? "npm.cmd" : "npm");
  const npmCommand = isWindows ? process.env.ComSpec || "cmd.exe" : npmExecutable;
  const npmArgs = ["run", "dev", "--", "--host", "127.0.0.1", "--port", frontendPort];
  frontendProcess = spawnLoggedProcess(
    npmCommand,
    isWindows ? ["/d", "/s", "/c", npmExecutable, ...npmArgs] : npmArgs,
    {
      cwd: frontendDir,
      env: {
        ...process.env,
        INTERNAL_API_BASE_URL: `http://127.0.0.1:${backendPort}`,
      },
    },
    frontendLogPath,
    "Frontend",
  );

  const backendReady = await waitForHttp(`http://127.0.0.1:${backendPort}/health`, 20, 500);
  if (!backendReady) {
    console.error(`Backend failed to start. Check ${backendLogPath}`);
    await printLogTail(backendLogPath);
    await stopServices();
    process.exit(1);
  }

  const frontendReady = await waitForHttp(`http://127.0.0.1:${frontendPort}`, 30, 500);
  if (!frontendReady) {
    console.error(`Frontend failed to start. Check ${frontendLogPath}`);
    await printLogTail(frontendLogPath);
    await stopServices();
    process.exit(1);
  }

  console.log("");
  console.log("GraphiteUI services started.");
  console.log(`  Frontend: http://127.0.0.1:${frontendPort}`);
  console.log(`  Backend:  http://127.0.0.1:${backendPort}`);
  console.log("");
  console.log("Press Ctrl+C to stop both services.");
  console.log("");

  const exitOnChildStop = async (label, logPath) => {
    if (stopping) {
      return;
    }
    console.error(`${label} process exited unexpectedly. Check ${logPath}`);
    await printLogTail(logPath);
    await stopServices();
    process.exit(1);
  };

  backendProcess.once("exit", () => exitOnChildStop("Backend", backendLogPath));
  frontendProcess.once("exit", () => exitOnChildStop("Frontend", frontendLogPath));
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
