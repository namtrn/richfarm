/// <reference types="node" />

import http from "node:http";
import https from "node:https";
import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";

export type DashboardApiLogger = Pick<Console, "log" | "error">;

export interface DashboardApiSupervisorOptions {
  apiHealthUrl?: string;
  apiHealthTimeoutMs?: number;
  apiCommand?: string;
  apiArgs?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  healthCheck?: (url: string, timeoutMs: number) => Promise<boolean>;
  spawnProcess?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  terminateChild?: (child: ChildProcess, signal: NodeJS.Signals) => void;
  logger?: DashboardApiLogger;
  platform?: NodeJS.Platform;
  restartBaseMs?: number;
  restartMaxMs?: number;
  stableRunMs?: number;
  healthPollMs?: number;
}

export interface DashboardApiSupervisorState {
  active: boolean;
  childRunning: boolean;
  restartScheduled: boolean;
  usingExternalApi: boolean;
}

const DEFAULT_API_HEALTH_URL = "http://localhost:4000/api/health";
const DEFAULT_API_ARGS = ["--prefix", "apps/api", "run", "dev"];

function isApiReachable(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      resolve(reachable);
    };

    try {
      const request = url.startsWith("https:")
        ? https.get(url, (response) => {
            response.resume();
            finish(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300);
          })
        : http.get(url, (response) => {
            response.resume();
            finish(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300);
          });
      request.setTimeout(timeoutMs, () => {
        request.destroy();
        finish(false);
      });
      request.once("error", () => finish(false));
    } catch {
      finish(false);
    }
  });
}

function terminateProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
  platform: NodeJS.Platform,
): void {
  if (child.exitCode !== null || child.killed) return;

  if (platform === "win32" && child.pid) {
    const result = spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return;
  } else if (child.pid && platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through to the direct child when process groups are unavailable.
    }
  }

  try {
    child.kill(signal);
  } catch {
    // The child may have exited between the state check and cleanup.
  }
}

export function createDashboardApiSupervisor(
  options: DashboardApiSupervisorOptions = {},
) {
  const apiHealthUrl = options.apiHealthUrl ?? DEFAULT_API_HEALTH_URL;
  const apiHealthTimeoutMs = options.apiHealthTimeoutMs ?? 750;
  const apiCommand = options.apiCommand ?? (process.platform === "win32" ? "npm.cmd" : "npm");
  const apiArgs = [...(options.apiArgs ?? DEFAULT_API_ARGS)];
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const platform = options.platform ?? process.platform;
  const restartBaseMs = options.restartBaseMs ?? 1_000;
  const restartMaxMs = options.restartMaxMs ?? 10_000;
  const stableRunMs = options.stableRunMs ?? 10_000;
  const healthPollMs = options.healthPollMs ?? 5_000;
  const healthCheck = options.healthCheck ?? isApiReachable;
  const spawnProcess = options.spawnProcess ?? ((command, args, spawnOptions) =>
    spawn(command, args, spawnOptions));
  const terminateChild = options.terminateChild ?? ((child, signal) =>
    terminateProcessTree(child, signal, platform));

  let active = false;
  let starting = false;
  let child: ChildProcess | null = null;
  let childStartedAt = 0;
  let restartTimer: NodeJS.Timeout | null = null;
  let healthTimer: NodeJS.Timeout | null = null;
  let restartAttempt = 0;
  let usingExternalApi = false;

  const log = (message: string) => logger.log?.(`[dashboard-dev] ${message}`);
  const logError = (message: string, error?: unknown) => {
    if (error) logger.error?.(`[dashboard-dev] ${message}`, error);
    else logger.error?.(`[dashboard-dev] ${message}`);
  };

  const scheduleRestart = (reason: string) => {
    if (!active || restartTimer) return;
    const delay = Math.min(
      restartMaxMs,
      restartBaseMs * (2 ** Math.min(restartAttempt, 4)),
    );
    restartAttempt += 1;
    logError(`${reason}; restarting API in ${delay}ms.`);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void ensureRunning();
    }, delay);
    restartTimer.unref?.();
  };

  async function ensureRunning(): Promise<void> {
    if (!active || starting || child || restartTimer) return;
    starting = true;
    try {
      if (await healthCheck(apiHealthUrl, apiHealthTimeoutMs)) {
        if (!usingExternalApi) log("API is already running; dashboard will use it.");
        usingExternalApi = true;
        restartAttempt = 0;
        return;
      }

      usingExternalApi = false;
      const nextChild = spawnProcess(apiCommand, apiArgs, {
        cwd,
        env: { ...env },
        stdio: "inherit",
        shell: false,
        detached: platform !== "win32",
      });
      child = nextChild;
      childStartedAt = Date.now();
      log(`Starting API: ${apiCommand} ${apiArgs.join(" ")}`);

      nextChild.once("error", (error) => {
        if (child !== nextChild) return;
        child = null;
        logError("API failed to start", error);
        scheduleRestart("API start failure");
      });
      nextChild.once("exit", (code, signal) => {
        if (child !== nextChild) return;
        child = null;
        if (!active) return;
        if (Date.now() - childStartedAt >= stableRunMs) restartAttempt = 0;
        const detail = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
        logError(`API stopped unexpectedly (${detail})`);
        scheduleRestart("API stopped");
      });
    } catch (error) {
      logError("Unable to start API", error);
      scheduleRestart("API start failure");
    } finally {
      starting = false;
    }
  }

  const start = () => {
    if (active) return;
    active = true;
    void ensureRunning();
    healthTimer = setInterval(() => {
      if (!child && !starting && !restartTimer) void ensureRunning();
    }, healthPollMs);
    healthTimer.unref?.();
  };

  const stop = () => {
    active = false;
    usingExternalApi = false;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    const currentChild = child;
    child = null;
    if (currentChild) terminateChild(currentChild, "SIGTERM");
  };

  return {
    start,
    stop,
    getState: (): DashboardApiSupervisorState => ({
      active,
      childRunning: child !== null,
      restartScheduled: restartTimer !== null,
      usingExternalApi,
    }),
  };
}
