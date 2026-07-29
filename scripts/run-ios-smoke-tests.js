#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const mobileRoot = path.join(repoRoot, "apps", "mobile");
const metroStatusUrl = "http://127.0.0.1:8081/status";
const devClientUrl = "richfarm://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081";
const defaultFlows = [
  ".maestro/smoke-all-buttons.yaml",
  ".maestro/smoke-home-library-health.yaml",
  ".maestro/smoke-library-deeplink.yaml",
  ".maestro/smoke-garden-create-bed.yaml",
  ".maestro/smoke-library-real-use.yaml",
  ".maestro/smoke-reminder-create.yaml",
  ".maestro/smoke-reminder-fake-time.yaml",
  ".maestro/smoke-auth-e2e.yaml",
  ".maestro/smoke-scan-tab.yaml",
];

let metroProcess = null;

function log(message) {
  process.stdout.write(`[ios-smoke] ${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function requestStatus() {
  return new Promise((resolve) => {
    const req = http.get(metroStatusUrl, (res) => {
      const projectRoot = res.headers["x-react-native-project-root"];
      res.resume();
      resolve({
        ok: res.statusCode === 200,
        projectRoot: typeof projectRoot === "string" ? projectRoot : "",
      });
    });
    req.on("error", () => resolve({ ok: false, projectRoot: "" }));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve({ ok: false, projectRoot: "" });
    });
  });
}

async function waitForMetro(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await requestStatus();
    if (status.ok && path.resolve(status.projectRoot) === mobileRoot) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function ensureMetro() {
  const current = await requestStatus();
  if (current.ok && path.resolve(current.projectRoot) === mobileRoot) {
    log("Metro is already running for apps/mobile.");
    return;
  }

  if (current.ok) {
    throw new Error(
      `Port 8081 is already serving a different project: ${current.projectRoot || "unknown project"}`
    );
  }

  log("Starting Expo dev-client Metro on 127.0.0.1:8081.");
  metroProcess = spawn("npm", ["--prefix", "apps/mobile", "start", "--", "--dev-client", "--localhost"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      EXPO_PUBLIC_E2E_AUTH_MODE: process.env.EXPO_PUBLIC_E2E_AUTH_MODE ?? "mock",
      EXPO_PUBLIC_E2E_REMINDER_MODE: process.env.EXPO_PUBLIC_E2E_REMINDER_MODE ?? "mock",
      EXPO_PUBLIC_E2E_NOW: process.env.EXPO_PUBLIC_E2E_NOW ?? "2026-05-14T08:30:00+07:00",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  metroProcess.stdout.on("data", (chunk) => process.stdout.write(chunk));
  metroProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));

  const ready = await waitForMetro(60_000);
  if (!ready) {
    throw new Error("Metro did not become ready for apps/mobile within 60 seconds.");
  }
}

function parseJsonCommand(command, args) {
  const result = run(command, args);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed`);
  }
  return JSON.parse(result.stdout);
}

function chooseSimulator() {
  const booted = parseJsonCommand("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
  for (const devices of Object.values(booted.devices ?? {})) {
    const simulator = devices.find((device) => device.isAvailable && device.name.startsWith("iPhone"));
    if (simulator) return simulator.udid;
  }

  const available = parseJsonCommand("xcrun", ["simctl", "list", "devices", "available", "-j"]);
  const runtimes = Object.entries(available.devices ?? {}).sort(([a], [b]) => b.localeCompare(a));
  for (const [, devices] of runtimes) {
    const simulator = devices.find((device) => device.isAvailable && device.name.startsWith("iPhone"));
    if (simulator) {
      log(`Booting ${simulator.name}.`);
      const boot = run("xcrun", ["simctl", "boot", simulator.udid]);
      if (boot.status !== 0 && !`${boot.stderr}${boot.stdout}`.includes("Unable to boot device in current state")) {
        throw new Error(boot.stderr || boot.stdout || "Failed to boot simulator.");
      }
      return simulator.udid;
    }
  }

  throw new Error("No available iPhone simulator found.");
}

function openDevClient(simulatorId) {
  run("xcrun", ["simctl", "terminate", simulatorId, "com.richfarm.app"]);
  log("Opening iOS dev client with the app scheme.");
  const result = run("xcrun", ["simctl", "openurl", simulatorId, devClientUrl]);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to open dev-client URL.");
  }
}

function runMaestro(flow, simulatorId) {
  log(`Running Maestro flow: ${flow}`);
  const child = spawn("maestro", ["test", "--device", simulatorId, flow], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const flows = process.argv.slice(2);
  const selectedFlows = flows.length > 0 ? flows : defaultFlows;

  try {
    const simulatorId = chooseSimulator();
    await ensureMetro();
    openDevClient(simulatorId);
    for (const flow of selectedFlows) {
      const code = await runMaestro(flow, simulatorId);
      if (code !== 0) {
        process.exitCode = code;
        return;
      }
    }
    process.exitCode = 0;
  } finally {
    if (metroProcess) {
      log("Stopping Expo dev-client Metro started by this script.");
      metroProcess.kill("SIGINT");
    }
  }
}

main().catch((error) => {
  console.error(`[ios-smoke] ${error.message}`);
  if (metroProcess) {
    metroProcess.kill("SIGINT");
  }
  process.exit(1);
});
