import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDashboardApiSupervisor } from "./dashboardApiSupervisor";

class FakeChild extends EventEmitter {
  pid = 42;
  exitCode: number | null = null;
  killed = false;
  killSignals: NodeJS.Signals[] = [];

  kill(signal?: NodeJS.Signals): boolean {
    this.killed = true;
    if (signal) this.killSignals.push(signal);
    this.emit("exit", 0, signal ?? null);
    return true;
  }
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard API supervisor", () => {
  it("starts the API and restarts it after an unexpected exit", async () => {
    vi.useFakeTimers();
    const children: FakeChild[] = [];
    const spawnProcess = vi.fn(() => {
      const child = new FakeChild();
      children.push(child);
      return child as unknown as ChildProcess;
    });
    const healthCheck = vi.fn(async () => false);
    const supervisor = createDashboardApiSupervisor({
      healthCheck,
      spawnProcess,
      terminateChild: (child, signal) => (child as unknown as FakeChild).kill(signal),
      restartBaseMs: 10,
      restartMaxMs: 10,
      healthPollMs: 60_000,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    supervisor.start();
    await flushPromises();
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(supervisor.getState()).toMatchObject({ active: true, childRunning: true });

    children[0].emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(10);
    await flushPromises();

    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(supervisor.getState().childRunning).toBe(true);

    supervisor.stop();
    expect(children[1].killSignals).toEqual(["SIGTERM"]);
  });

  it("uses an already-running API and starts one when that API later disappears", async () => {
    vi.useFakeTimers();
    const spawnProcess = vi.fn(() => new FakeChild() as unknown as ChildProcess);
    const healthCheck = vi
      .fn<(_url: string, _timeoutMs: number) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const supervisor = createDashboardApiSupervisor({
      healthCheck,
      spawnProcess,
      healthPollMs: 10,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    supervisor.start();
    await flushPromises();
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(supervisor.getState().usingExternalApi).toBe(true);

    await vi.advanceTimersByTimeAsync(10);
    await flushPromises();
    expect(spawnProcess).toHaveBeenCalledTimes(1);

    supervisor.stop();
  });
});
