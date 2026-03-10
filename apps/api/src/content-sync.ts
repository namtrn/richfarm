import { execFile } from "child_process";
import { Router } from "express";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export function createContentSyncRouter() {
  const router = Router();
  const repoRoot = path.resolve(__dirname, "../..");

  router.post("/sync-convex-to-json", async (_req, res, next) => {
    try {
      const { stdout, stderr } = await execFileAsync("npm", ["run", "sync:convex-to-json"], {
        cwd: repoRoot,
        timeout: 10 * 60 * 1000,
        maxBuffer: 10 * 1024 * 1024,
      });

      res.json({
        ok: true,
        message: "Convex content synced to JSON source",
        stdout,
        stderr,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
