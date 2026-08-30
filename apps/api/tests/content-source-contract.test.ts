import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_REQUIRED_LOCALES,
  FULL_HASH_AUDIT_DEFAULT_BUDGET,
  FULL_HASH_AUDIT_INTERVAL_MS,
  MONITOR_LEASE_RENEWAL_INTERVAL_MS,
  MONITOR_LEASE_TTL_MS,
  PENDING_EVENT_VISIBILITY_SLA_MS,
  RETENTION_MAX_DATABASE_BYTES_DEFAULT,
  RETENTION_TERMINAL_EVENT_DAYS_DEFAULT,
  assertReviewTransition,
  canTransitionReviewState,
  isTerminalReviewState,
  ownerStatusForMissingManifest,
} from "../src/content-source/contract";
import {
  InvalidContentSourcePathError,
  caseFoldCollisionKey,
  classifyRelativeContentPath,
  findCaseFoldCollisions,
  normalizeRepositoryRelativePath,
  owningManifestRelativePath,
} from "../src/content-source/paths";

const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");

describe("MCD-1 pinned monitor contracts", () => {
  it("pins lease, SLA, audit interval, and retention defaults", () => {
    expect(MONITOR_LEASE_TTL_MS).toBe(30_000);
    expect(MONITOR_LEASE_RENEWAL_INTERVAL_MS).toBe(10_000);
    expect(PENDING_EVENT_VISIBILITY_SLA_MS).toBe(30_000);
    expect(FULL_HASH_AUDIT_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
    expect(FULL_HASH_AUDIT_DEFAULT_BUDGET.windowDurationMs).toBeGreaterThan(0);
    expect(FULL_HASH_AUDIT_DEFAULT_BUDGET.maxFilesPerWindow).toBeGreaterThan(0);
    expect(RETENTION_TERMINAL_EVENT_DAYS_DEFAULT).toBe(90);
    expect(RETENTION_MAX_DATABASE_BYTES_DEFAULT).toBe(512 * 1024 * 1024);
  });

  it("enforces the review state machine with terminal states", () => {
    expect(canTransitionReviewState("pending", "approved")).toBe(true);
    expect(canTransitionReviewState("pending", "blocked")).toBe(true);
    expect(canTransitionReviewState("blocked", "dismissed")).toBe(true);
    expect(canTransitionReviewState("approved", "applied")).toBe(true);
    expect(canTransitionReviewState("approved", "superseded")).toBe(true);
    expect(() => assertReviewTransition("applied", "pending")).toThrow(
      "REVIEW_STATE_TRANSITION_INVALID",
    );
    expect(() => assertReviewTransition("superseded", "approved")).toThrow();
    expect(isTerminalReviewState("applied")).toBe(true);
    expect(isTerminalReviewState("dismissed")).toBe(true);
    expect(isTerminalReviewState("superseded")).toBe(true);
    expect(isTerminalReviewState("pending")).toBe(false);
    expect(isTerminalReviewState("blocked")).toBe(false);
    expect(isTerminalReviewState("approved")).toBe(false);
  });

  it("separates one-time legacy baseline status from post-baseline missing manifests", () => {
    expect(ownerStatusForMissingManifest({ baselineSealed: false })).toBe(
      "legacy_missing_manifest",
    );
    expect(ownerStatusForMissingManifest({ baselineSealed: true })).toBe(
      "missing_manifest",
    );
  });

  it("derives required locales from configuration, not hard-coded policy", () => {
    expect(DEFAULT_REQUIRED_LOCALES).toEqual(["en", "vi"]);
    const fiveLocalePolicy = ["en", "vi", "ja", "ko", "zh"];
    const vi = classifyRelativeContentPath("content/plants/tomato/vi.md");
    const ja = classifyRelativeContentPath("content/plants/tomato/ja.md");
    const jaWithPolicy = classifyRelativeContentPath("content/plants/tomato/ja.md", {
      requiredLocales: fiveLocalePolicy,
    });
    expect(vi?.locale).toBe("vi");
    expect(ja).toBeNull();
    expect(jaWithPolicy?.locale).toBe("ja");
  });
});

describe("MCD-1 content source path rules", () => {
  it("classifies manifests and markdown under watched roots only", () => {
    expect(classifyRelativeContentPath("content/plants/tomato/content.json"))
      .toMatchObject({
        rootKey: "plants",
        entityKind: "plant",
        fileKind: "manifest",
        entityDir: "tomato",
        locale: null,
      });
    expect(classifyRelativeContentPath("content/plants/tomato/vi.md")).toMatchObject({
      entityKind: "plant",
      fileKind: "markdown",
      locale: "vi",
    });
    expect(
      classifyRelativeContentPath("content/pests-diseases/aphids/en.md"),
    ).toMatchObject({
      rootKey: "pests-diseases",
      entityKind: "pest_disease",
      locale: "en",
    });
    expect(owningManifestRelativePath("content/plants/tomato")).toBe(
      "content/plants/tomato/content.json",
    );
  });

  it("rejects unsupported paths instead of watching them", () => {
    expect(classifyRelativeContentPath("content/plants/README.md")).toBeNull();
    expect(classifyRelativeContentPath("content/plans/x.md")).toBeNull();
    expect(classifyRelativeContentPath("content/plants/tomato/notes.txt")).toBeNull();
    expect(classifyRelativeContentPath("docs/tasks/x.md")).toBeNull();
    expect(classifyRelativeContentPath("content/plants/rootfile.md")).toBeNull();
    expect(classifyRelativeContentPath("content/plants/tomato/fr.md")).toBeNull();
  });

  it("normalizes repository-relative paths and rejects traversal and outside roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "csrc-path-"));
    try {
      const inside = path.join(root, "content", "plants", "tomato", "vi.md");
      expect(normalizeRepositoryRelativePath(root, inside)).toBe(
        "content/plants/tomato/vi.md",
      );
      expect(() =>
        normalizeRepositoryRelativePath(root, path.join(root, "..", "outside.md")),
      ).toThrow(InvalidContentSourcePathError);
      expect(() =>
        normalizeRepositoryRelativePath(root, "/etc/passwd"),
      ).toThrow(InvalidContentSourcePathError);
      expect(() => normalizeRepositoryRelativePath(root, root)).toThrow(
        InvalidContentSourcePathError,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects Unicode case-folded collisions independent of filesystem behavior", () => {
    const collisions = findCaseFoldCollisions([
      "content/plants/Tomato/vi.md",
      "content/plants/tomato/vi.md",
      "content/plants/basella/vi.md",
    ]);
    expect(collisions.size).toBe(1);
    expect(collisions.get(caseFoldCollisionKey("content/plants/tomato/vi.md"))).toEqual([
      "content/plants/Tomato/vi.md",
      "content/plants/tomato/vi.md",
    ]);
    expect(findCaseFoldCollisions(["a.md", "a.md"]).size).toBe(0);
    expect(findCaseFoldCollisions(["a.md", "b.md"]).size).toBe(0);
  });

  it("covers case-collision discovery against the real filesystem (APFS-safe)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "csrc-casefold-"));
    try {
      const dir = path.join(root, "content", "plants", "tomato");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "vi.md"), "lowercase", "utf8");

      // A Git checkout can carry two contract paths that collapse onto one
      // physical file on default macOS APFS. Discovery compares tracked
      // candidates with physically observed paths before watching/indexing.
      const trackedCandidates = [
        "content/plants/Tomato/vi.md",
        "content/plants/tomato/vi.md",
      ];
      const physicallyObserved = fs
        .readdirSync(dir)
        .filter((name) => name.toLowerCase() === "vi.md")
        .map((name) => `content/plants/tomato/${name}`);
      const collisions = findCaseFoldCollisions([
        ...trackedCandidates,
        ...physicallyObserved,
      ]);
      expect(collisions.size).toBe(1);
      const [colliding] = [...collisions.values()];
      expect(colliding).toContain("content/plants/Tomato/vi.md");
      expect(colliding).toContain("content/plants/tomato/vi.md");

      let caseInsensitiveFs = false;
      try {
        if (fs.readFileSync(path.join(dir, "VI.md"), "utf8") === "lowercase") {
          caseInsensitiveFs = true;
        }
      } catch {
        caseInsensitiveFs = false;
      }
      if (caseInsensitiveFs) {
        expect(physicallyObserved.length).toBe(1);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("demonstrates this process can read the real Git-authored content tree", () => {
    for (const relRoot of ["content/plants", "content/pests-diseases"]) {
      const absolute = path.join(REPOSITORY_ROOT, relRoot);
      expect(fs.existsSync(absolute)).toBe(true);
      const entries = fs
        .readdirSync(absolute, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      expect(entries.length).toBeGreaterThan(0);
      const markdown = entries
        .flatMap((dir) =>
          fs.readdirSync(path.join(absolute, dir)).map((file) => `${dir}/${file}`),
        )
        .filter((file) => file.endsWith(".md"));
      expect(markdown.length).toBeGreaterThan(0);
      const sample = fs.readFileSync(
        path.join(absolute, markdown[0]!),
        "utf8",
      );
      expect(typeof sample).toBe("string");
      expect(sample.length).toBeGreaterThanOrEqual(0);
    }
  });
});
