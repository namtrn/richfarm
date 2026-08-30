import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REPOSITORY_ROOT,
  resolveRepositoryPath,
} from "./audit-canonical-identity";

describe("canonical identity audit CLI path contract", () => {
  it("resolves relative paths against the repository root, not npm --prefix cwd", () => {
    expect(resolveRepositoryPath("apps/api/data/richfarm.db")).toBe(
      path.join(REPOSITORY_ROOT, "apps/api/data/richfarm.db"),
    );
    expect(resolveRepositoryPath("/tmp/cid-report.json")).toBe("/tmp/cid-report.json");
  });
});
