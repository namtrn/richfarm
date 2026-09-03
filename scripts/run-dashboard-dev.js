#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const services = [
  {
    name: "api",
    args: ["--prefix", "apps/api", "run", "dev"],
  },
  {
    name: "dashboard",
    args: ["--prefix", "apps/dashboard", "run", "dev"],
    // The dashboard's Vite plugin owns the API lifecycle when it is started
    // directly. This combined launcher already owns the API child itself.
    env: { RICHFARM_DASHBOARD_API_AUTOSTART: "false" },
  },
];

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

/**
 * Stop a child and its descendants where the platform supports process
 * groups. The children are spawned detached on Unix below, so a negative PID
 * targets the complete service tree. Windows has an equivalent taskkill tree
 * operation; the direct child.kill fallback still handles unusual hosts.
 */
function terminateProcessTree(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.killed) return;

  if (process.platform === "win32" && child.pid) {
    const result = spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return;
  } else if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      // The process may not have created a group (or may have just exited).
      // Fall through to the direct-child kill in either case.
    }
  }

  try {
    child.kill(signal);
  } catch {
    // A child that has already exited needs no further cleanup.
  }
}

/**
 * Create the dashboard development runner. The returned runner is a promise
 * based lifecycle so tests can exercise spawn, failure, and signal behavior
 * without starting real workspace processes.
 */
function createDevOrchestrator({
  spawnProcess = spawn,
  terminateChild = terminateProcessTree,
  signalSource = process,
  installSignalHandlers = true,
  logger = console,
  cwd = repoRoot,
  platform = process.platform,
} = {}) {
  let started = false;
  let stopping = false;
  let exitCode = 0;
  let resolveCompletion;
  let signalHandler;
  let boundSignalHandlers;
  const records = [];
  const completion = new Promise((resolve) => {
    resolveCompletion = resolve;
  });

  function log(message) {
    logger.log?.(`[dashboard-dev] ${message}`);
  }

  function logError(message, error) {
    if (error) {
      logger.error?.(`[dashboard-dev] ${message}`, error);
    } else {
      logger.error?.(`[dashboard-dev] ${message}`);
    }
  }

  function removeSignalHandlers() {
    if (!boundSignalHandlers || !signalSource?.removeListener) return;
    signalSource.removeListener("SIGINT", boundSignalHandlers.SIGINT);
    signalSource.removeListener("SIGTERM", boundSignalHandlers.SIGTERM);
    boundSignalHandlers = undefined;
    signalHandler = undefined;
  }

  function maybeComplete() {
    if (!stopping || records.some((record) => !record.closed)) return;
    removeSignalHandlers();
    resolveCompletion(exitCode);
  }

  function requestStop(reason, code = 0, signal = "SIGTERM") {
    if (!stopping) {
      stopping = true;
      exitCode = code;
      if (reason) log(reason);
    } else if (code !== 0) {
      // Preserve a service failure if a later signal/close follows it.
      exitCode = code;
    }

    for (const record of records) {
      if (!record.closed) terminateChild(record.child, signal);
    }
    maybeComplete();
    return completion;
  }

  function handleExit(record, code, signal) {
    if (record.closed) return;
    record.closed = true;

    if (!stopping) {
      if (record.name === "dashboard" && code === 0 && !signal) {
        requestStop("Dashboard stopped; stopping the API.", 0, "SIGTERM");
      } else {
        const detail = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
        logError(`${record.name} stopped unexpectedly (${detail}); stopping the other service.`);
        requestStop(`${record.name} failure`, 1, "SIGTERM");
      }
      return;
    }

    maybeComplete();
  }

  function handleError(record, error) {
    if (record.closed) return;
    record.closed = true;
    logError(`Unable to start ${record.name}.`, error);
    requestStop(`${record.name} failed to start`, 1, "SIGTERM");
  }

  function startService(service) {
    const command = npmCommand;
    const options = {
      cwd,
      env: { ...process.env, ...(service.env ?? {}) },
      stdio: "inherit",
      shell: false,
      // On Unix this gives us a process group for descendant cleanup. The
      // Windows taskkill path above provides the equivalent tree ownership.
      detached: platform !== "win32",
    };
    log(`Starting ${service.name}: ${formatCommand(command, service.args)}`);

    let child;
    try {
      child = spawnProcess(command, service.args, options);
    } catch (error) {
      const record = { ...service, child: null, closed: true };
      records.push(record);
      logError(`Unable to start ${service.name}.`, error);
      requestStop(`${service.name} failed to start`, 1, "SIGTERM");
      return record;
    }

    const record = { ...service, child, closed: false };
    records.push(record);
    child.once("error", (error) => handleError(record, error));
    child.once("exit", (code, signal) => handleExit(record, code, signal));
    return record;
  }

  function start() {
    if (started) throw new Error("Dashboard development runner already started");
    started = true;

    if (installSignalHandlers && signalSource?.on) {
      signalHandler = (signal) => {
        requestStop(`Received ${signal}; stopping API and dashboard.`, 0, signal);
      };
      // EventEmitter signal listeners receive no signal-name argument, so
      // bind each event explicitly before forwarding it to the children.
      boundSignalHandlers = {
        SIGINT: () => signalHandler("SIGINT"),
        SIGTERM: () => signalHandler("SIGTERM"),
      };
      signalSource.on("SIGINT", boundSignalHandlers.SIGINT);
      signalSource.on("SIGTERM", boundSignalHandlers.SIGTERM);
    }

    for (const service of services) {
      if (stopping) break;
      startService(service);
    }
    maybeComplete();
    return completion;
  }

  return {
    start,
    stop: (signal = "SIGTERM", code = 0) => requestStop("Stopping API and dashboard.", code, signal),
    completion,
    records,
  };
}

async function main() {
  const orchestrator = createDevOrchestrator();
  const code = await orchestrator.start();
  process.exitCode = code;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[dashboard-dev] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  createDevOrchestrator,
  formatCommand,
  services,
  terminateProcessTree,
};
