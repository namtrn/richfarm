import { watch, type FSWatcher } from "chokidar";

/**
 * MCD-4 dependency decision: `chokidar` v4 (pinned 4.0.3) was chosen over
 * `@parcel/watcher` because it needs no native build/deploy step in this
 * Express/better-sqlite3 stack. Chokidar exposes no native overflow signal,
 * so backpressure is owned by the bounded candidate queue below instead.
 */

export type WatchCandidateKind =
  | "add"
  | "change"
  | "unlink"
  | "addDir"
  | "unlinkDir";

export interface ContentWatchCallbacks {
  onCandidate(absolutePath: string, kind: WatchCandidateKind): void;
  onError(error: Error): void;
  onReady(): void;
}

export interface ContentWatchAdapter {
  readonly kind: "chokidar" | "test";
  stop(): Promise<void>;
}

export function createChokidarAdapter(options: {
  watchRoots: readonly string[];
  callbacks: ContentWatchCallbacks;
  awaitWriteFinishMs?: number;
}): ContentWatchAdapter {
  const watcher: FSWatcher = watch([...options.watchRoots], {
    ignoreInitial: true,
    persistent: true,
    ignorePermissionErrors: false,
    ...(options.awaitWriteFinishMs
      ? {
          awaitWriteFinish: {
            stabilityThreshold: options.awaitWriteFinishMs,
            pollInterval: Math.max(10, Math.floor(options.awaitWriteFinishMs / 5)),
          },
        }
      : {}),
  });

  watcher.on("add", (filePath) => options.callbacks.onCandidate(filePath, "add"));
  watcher.on("change", (filePath) => options.callbacks.onCandidate(filePath, "change"));
  watcher.on("unlink", (filePath) => options.callbacks.onCandidate(filePath, "unlink"));
  watcher.on("addDir", (dirPath) => options.callbacks.onCandidate(dirPath, "addDir"));
  watcher.on("unlinkDir", (dirPath) => options.callbacks.onCandidate(dirPath, "unlinkDir"));
  watcher.on("error", (error) =>
    options.callbacks.onError(
      error instanceof Error ? error : new Error(String(error)),
    ),
  );
  watcher.once("ready", () => options.callbacks.onReady());

  return {
    kind: "chokidar",
    stop: () => watcher.close(),
  };
}

export type DebounceSchedule = (
  fn: () => void,
  delayMs: number,
) => () => void;

const defaultSchedule: DebounceSchedule = (fn, delayMs) => {
  const timer = setTimeout(fn, delayMs);
  timer.unref?.();
  return () => clearTimeout(timer);
};

export interface CandidateQueuePushResult {
  queued: boolean;
  overflowFlush: boolean;
  pendingSize: number;
}

export interface CandidateQueue {
  push(absolutePath: string): CandidateQueuePushResult;
  pendingPaths(): string[];
  size(): number;
  overflowCount(): number;
  flushNow(): void;
  dispose(): void;
}

/**
 * Per-path debounced, bounded candidate queue. Duplicate paths collapse into
 * one pending entry; the whole batch flushes together after the debounce
 * window. The queue never drops evidence: at capacity it flushes immediately
 * (backpressure) and counts the overflow so health can report degradation.
 */
export function createCandidateQueue(options: {
  debounceMs: number;
  maxQueueSize: number;
  flush(paths: readonly string[]): void;
  schedule?: DebounceSchedule;
}): CandidateQueue {
  const schedule = options.schedule ?? defaultSchedule;
  const pending = new Map<string, true>();
  let cancelTimer: (() => void) | null = null;
  let overflows = 0;

  const clearTimer = () => {
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
  };

  const flushBatch = () => {
    clearTimer();
    if (pending.size === 0) {
      return;
    }
    const batch = [...pending.keys()].sort();
    pending.clear();
    options.flush(batch);
  };

  return {
    push(absolutePath: string): CandidateQueuePushResult {
      let overflowFlush = false;
      if (!pending.has(absolutePath) && pending.size >= options.maxQueueSize) {
        overflows += 1;
        overflowFlush = true;
        flushBatch();
      }
      pending.set(absolutePath, true);
      // Always arm the debounce timer after adding work: an overflow flush
      // clears the previous timer, and without re-arming, the last pushed
      // path would sit in pending forever when no further events arrive.
      if (!cancelTimer) {
        cancelTimer = schedule(flushBatch, options.debounceMs);
      }
      return {
        queued: true,
        overflowFlush,
        pendingSize: pending.size,
      };
    },
    pendingPaths: () => [...pending.keys()].sort(),
    size: () => pending.size,
    overflowCount: () => overflows,
    flushNow: flushBatch,
    dispose: clearTimer,
  };
}
