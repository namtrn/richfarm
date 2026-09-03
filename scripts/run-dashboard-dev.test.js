const { EventEmitter } = require("node:events");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createDevOrchestrator, services } = require("./run-dashboard-dev");

class FakeChild extends EventEmitter {
  constructor({ autoExitOnKill = true } = {}) {
    super();
    this.pid = 10_000 + FakeChild.nextPid;
    FakeChild.nextPid += 1;
    this.exitCode = null;
    this.killed = false;
    this.killSignals = [];
    this.autoExitOnKill = autoExitOnKill;
  }

  kill(signal) {
    this.killed = true;
    this.killSignals.push(signal);
    if (this.autoExitOnKill) {
      queueMicrotask(() => this.emit("exit", null, signal));
    }
    return true;
  }
}

FakeChild.nextPid = 1;

function createHarness(options = {}) {
  const children = [];
  const calls = [];
  const logs = [];
  const errors = [];
  const spawnProcess = (command, args, spawnOptions) => {
    calls.push({ command, args, spawnOptions });
    if (options.throwOn === calls.length) {
      throw new Error(`spawn failed for ${args[1]}`);
    }
    const child = new FakeChild(options.childOptions);
    children.push(child);
    return child;
  };
  const signalSource = new EventEmitter();
  const orchestrator = createDevOrchestrator({
    spawnProcess,
    terminateChild: (child, signal) => child.kill(signal),
    signalSource,
    installSignalHandlers: options.installSignalHandlers ?? true,
    platform: "linux",
    logger: {
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
    },
  });
  return { calls, children, logs, errors, signalSource, orchestrator };
}

test("starts API and dashboard without shell-specific background syntax", async () => {
  const harness = createHarness();
  const completion = harness.orchestrator.start();

  assert.equal(harness.calls.length, 2);
  assert.deepEqual(harness.calls.map(({ args }) => args), services.map(({ args }) => args));
  assert.equal(harness.calls[0].spawnOptions.shell, false);
  assert.equal(harness.calls[1].spawnOptions.shell, false);
  assert.equal(harness.calls[0].spawnOptions.detached, true);
  assert.equal(
    harness.calls[1].spawnOptions.env.RICHFARM_DASHBOARD_API_AUTOSTART,
    "false",
  );

  harness.children[1].emit("exit", 0, null);
  assert.equal(await completion, 0);
  assert.deepEqual(harness.children[0].killSignals, ["SIGTERM"]);
});

test("stops the sibling and returns failure when a service exits unexpectedly", async () => {
  const harness = createHarness();
  const completion = harness.orchestrator.start();

  harness.children[0].emit("exit", 1, null);

  assert.equal(await completion, 1);
  assert.deepEqual(harness.children[1].killSignals, ["SIGTERM"]);
  assert.ok(harness.errors.some((message) => message.includes("api stopped unexpectedly")));
});

test("cleans up both children on SIGINT and removes signal listeners", async () => {
  const harness = createHarness();
  const completion = harness.orchestrator.start();

  harness.signalSource.emit("SIGINT");

  assert.deepEqual(harness.children.map((child) => child.killSignals), [["SIGINT"], ["SIGINT"]]);
  assert.equal(await completion, 0);
  assert.equal(harness.signalSource.listenerCount("SIGINT"), 0);
  assert.equal(harness.signalSource.listenerCount("SIGTERM"), 0);
});

test("reports a spawn failure and terminates an already-started sibling", async () => {
  const harness = createHarness({ throwOn: 2 });
  const completion = harness.orchestrator.start();

  assert.equal(await completion, 1);
  assert.deepEqual(harness.children[0].killSignals, ["SIGTERM"]);
  assert.ok(harness.errors.some((message) => message.includes("Unable to start dashboard")));
});
