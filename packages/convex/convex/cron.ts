import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("send reminder notifications", { minutes: 1 }, internal.notifications.sendDueReminders, {});
crons.interval("cleanup archived plants", { minutes: 1440 }, internal.plants.cleanupArchivedPlants, {});
crons.interval("cleanup stale anonymous users", { minutes: 1440 }, internal.authCleanup.cleanupStaleAnonymousUsers, {
  maxAgeDays: 30,
  batchSize: 100,
});

export default crons;
