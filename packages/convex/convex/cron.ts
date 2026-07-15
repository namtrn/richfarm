import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("send reminder notifications", { minutes: 1 }, internal.notifications.sendDueReminders, {});
crons.interval("cleanup stale anonymous users", { minutes: 1440 }, internal.authCleanup.cleanupStaleAnonymousUsers, {
  maxAgeDays: 30,
  batchSize: 100,
});
crons.interval("cleanup orphan sync uploads", { minutes: 1440 }, internal.storage.cleanupOrphanSyncUploads, {
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  limit: 500,
});

export default crons;
