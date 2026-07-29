#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const readline = require("node:readline");

const repoRoot = path.resolve(__dirname, "..");
const mobileRoot = path.join(repoRoot, "apps", "mobile");
const adb = process.env.ADB_PATH || "adb";
const maestro = process.env.MAESTRO_PATH || "maestro";
const metroStatusUrl = "http://127.0.0.1:8081/status";
const signupFlow = ".maestro/e2e-auth-signup.yaml";
const featureFlow = ".maestro/e2e-auth-signin-features.yaml";
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const artifactDir = path.join(repoRoot, "artifacts", "e2e", `android-auth-${runId}`);

let metroProcess = null;
let metroLog = "";
let activeDevice = null;
let logsWritten = false;

function log(message) {
  process.stdout.write(`[android-auth-e2e] ${message}\n`);
}

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "pipe",
    timeout: options.timeout,
    maxBuffer: options.maxBuffer ?? 50 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    fail(result.stderr || result.stdout || `${command} ${args.join(" ")} failed`);
  }
  return result;
}

function requestMetroStatus() {
  return new Promise((resolve) => {
    const request = http.get(metroStatusUrl, (response) => {
      const projectRoot = response.headers["x-react-native-project-root"];
      response.resume();
      resolve({
        ok: response.statusCode === 200,
        projectRoot: typeof projectRoot === "string" ? projectRoot : "",
      });
    });
    request.on("error", () => resolve({ ok: false, projectRoot: "" }));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve({ ok: false, projectRoot: "" });
    });
  });
}

async function waitForMetro(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await requestMetroStatus();
    if (status.ok && path.resolve(status.projectRoot) === mobileRoot) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail("Metro did not become ready for apps/mobile within 60 seconds.");
}

async function ensureMetro() {
  const status = await requestMetroStatus();
  if (status.ok) {
    if (path.resolve(status.projectRoot) !== mobileRoot) {
      fail(`Port 8081 belongs to another project: ${status.projectRoot || "unknown"}`);
    }
    if (process.env.E2E_ALLOW_EXISTING_METRO !== "1") {
      fail(
        "Metro is already running. Stop it first so this runner can guarantee real auth mode, " +
        "or set E2E_ALLOW_EXISTING_METRO=1 if it was started without EXPO_PUBLIC_E2E_AUTH_MODE=mock."
      );
    }
    log("Using the existing Metro process; its output cannot be included in Metro error scanning.");
    return;
  }

  log("Starting Metro in real-auth mode.");
  metroProcess = spawn(
    "npm",
    ["--prefix", "apps/mobile", "start", "--", "--dev-client", "--localhost"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        EXPO_PUBLIC_E2E_AUTH_MODE: "real",
        EXPO_PUBLIC_E2E_REMINDER_MODE: "real",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const collect = (chunk) => {
    const value = chunk.toString();
    metroLog += value;
    process.stdout.write(value);
  };
  metroProcess.stdout.on("data", collect);
  metroProcess.stderr.on("data", collect);
  await waitForMetro(60_000);
}

function chooseDevice() {
  const output = run(adb, ["devices"]).stdout;
  const devices = output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === "device")
    .map((parts) => parts[0]);
  const requested = process.env.ANDROID_SERIAL;
  if (requested) {
    if (!devices.includes(requested)) fail(`ANDROID_SERIAL ${requested} is not connected.`);
    return requested;
  }
  if (devices.length !== 1) {
    fail(`Expected exactly one Android device; found ${devices.length}. Set ANDROID_SERIAL explicitly.`);
  }
  return devices[0];
}

async function prewarmDevClient(device) {
  const url = "richfarm://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081";
  log("Prewarming the development client and initial JS bundle.");
  run(adb, ["-s", device, "shell", "am", "force-stop", "com.richfarm.app"]);
  run(adb, [
    "-s", device,
    "shell", "am", "start",
    "-a", "android.intent.action.VIEW",
    "-d", url,
    "com.richfarm.app",
  ]);
  await new Promise((resolve) => setTimeout(resolve, 20_000));
}

function maestroEnv() {
  const stamp = Date.now();
  return {
    E2E_NAME: process.env.E2E_NAME || "RichFarm E2E User",
    E2E_EMAIL: process.env.E2E_EMAIL,
    E2E_PASSWORD: process.env.E2E_PASSWORD,
    E2E_GARDEN_NAME: process.env.E2E_GARDEN_NAME || `E2E Garden ${stamp}`,
    E2E_PLANT_NAME: process.env.E2E_PLANT_NAME || `E2E Basil ${stamp}`,
    E2E_REMINDER_TITLE: process.env.E2E_REMINDER_TITLE || `E2E Water ${stamp}`,
  };
}

function runMaestro(device, flow, values, phase) {
  const args = ["test", "--device", device];
  for (const [key, value] of Object.entries(values)) {
    args.push("-e", `${key}=${value}`);
  }
  args.push("--debug-output", path.join(artifactDir, `maestro-${phase}`));
  args.push(flow);
  log(`Running ${flow}.`);
  run(maestro, args, { stdio: "inherit" });
}

function askForVerificationUrl() {
  if (!process.stdin.isTTY) {
    fail(
      "Signup succeeded, but verification is required. Set E2E_VERIFICATION_URL or " +
      "E2E_FETCH_VERIFICATION_COMMAND. The command must print the newest verification URL to stdout."
    );
  }
  return new Promise((resolve, reject) => {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    prompt.question("[android-auth-e2e] Paste the verification URL from the test inbox: ", (answer) => {
      prompt.close();
      const value = answer.trim();
      if (!/^https?:\/\//i.test(value)) {
        reject(new Error("The pasted verification URL must start with http:// or https://."));
        return;
      }
      resolve(value);
    });
  });
}

async function resolveVerificationUrl() {
  if (process.env.E2E_VERIFICATION_URL) return process.env.E2E_VERIFICATION_URL.trim();
  const command = process.env.E2E_FETCH_VERIFICATION_COMMAND;
  if (!command) return askForVerificationUrl();
  log("Fetching the verification URL with E2E_FETCH_VERIFICATION_COMMAND.");
  const result = run("/bin/zsh", ["-lc", command], {
    env: { ...process.env },
    timeout: 60_000,
  });
  const matches = result.stdout.match(/https?:\/\/[^\s"'<>]+/g);
  if (!matches?.length) fail("The verification command did not print an HTTP(S) URL.");
  return matches.at(-1);
}

function openVerificationUrl(device, url) {
  log("Opening the verification URL on the Android device.");
  run(adb, ["-s", device, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url], {
    timeout: 30_000,
  });
}

function collectDeviceLogs(device) {
  const result = run(adb, ["-s", device, "logcat", "-d", "-v", "threadtime"], {
    allowFailure: true,
    timeout: 30_000,
  });
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function findErrors(deviceLog, bundlerLog) {
  const allow = (process.env.E2E_LOG_ALLOWLIST || "")
    .split("||")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new RegExp(value, "i"));
  const candidates = [
    ...deviceLog.split("\n").filter((line) =>
      /FATAL EXCEPTION|AndroidRuntime.*\bE\b|ReactNativeJS.*\bE\b|Unhandled (Promise|JS Exception)|Invariant Violation|Unable to load script|TypeError:|ReferenceError:/i.test(line)
    ),
    ...bundlerLog.split("\n").filter((line) =>
      /\bERROR\b|Unhandled (Promise|JS Exception)|Invariant Violation|Unable to resolve module|Cannot find module|TypeError:|ReferenceError:/i.test(line)
    ),
  ];
  return [...new Set(candidates.filter((line) => !allow.some((pattern) => pattern.test(line))))];
}

function writeDiagnosticLogs() {
  if (logsWritten) return [];
  logsWritten = true;
  const deviceLog = activeDevice ? collectDeviceLogs(activeDevice) : "";
  fs.writeFileSync(path.join(artifactDir, "adb-logcat.txt"), deviceLog);
  fs.writeFileSync(path.join(artifactDir, "metro.txt"), metroLog);
  const errors = findErrors(deviceLog, metroLog);
  fs.writeFileSync(path.join(artifactDir, "detected-errors.txt"), errors.join("\n"));
  return errors;
}

async function main() {
  const values = maestroEnv();
  if (!values.E2E_EMAIL || !values.E2E_PASSWORD) {
    fail("E2E_EMAIL and E2E_PASSWORD are required. Use a fresh inbox and a password of at least 8 characters.");
  }
  if (values.E2E_PASSWORD.length < 8) fail("E2E_PASSWORD must contain at least 8 characters.");

  fs.mkdirSync(artifactDir, { recursive: true });
  const device = chooseDevice();
  activeDevice = device;
  log(`Using Android device ${device}.`);
  await ensureMetro();
  run(adb, ["-s", device, "reverse", "tcp:8081", "tcp:8081"]);
  run(adb, ["-s", device, "logcat", "-c"]);
  await prewarmDevClient(device);

  runMaestro(device, signupFlow, values, "signup");
  const verificationUrl = await resolveVerificationUrl();
  openVerificationUrl(device, verificationUrl);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  runMaestro(device, featureFlow, values, "signin-features");

  const errors = writeDiagnosticLogs();
  if (errors.length) {
    fail(
      `UI flow passed, but ${errors.length} error log line(s) were detected. ` +
      `See ${path.relative(repoRoot, path.join(artifactDir, "detected-errors.txt"))}.`
    );
  }

  log(`PASS. Logs saved in ${path.relative(repoRoot, artifactDir)}.`);
}

main()
  .catch((error) => {
    fs.mkdirSync(artifactDir, { recursive: true });
    const detected = writeDiagnosticLogs();
    const suffix = detected.length
      ? ` Log scanner also found ${detected.length} error line(s) in ${path.relative(repoRoot, artifactDir)}.`
      : ` Diagnostics: ${path.relative(repoRoot, artifactDir)}.`;
    console.error(`[android-auth-e2e] FAIL: ${error.message}${suffix}`);
    process.exitCode = 1;
  })
  .finally(() => {
    if (metroProcess) {
      log("Stopping Metro started by this runner.");
      metroProcess.kill("SIGINT");
    }
  });
