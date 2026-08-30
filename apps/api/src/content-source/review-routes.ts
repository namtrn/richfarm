import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import type { SqliteDatabase } from "../db";
import type { PestDiseaseCatalogEntry } from "../content-manifests";
import {
  applyProposal,
  approveEvents,
  buildEventPreview,
  dismissEvents,
  getQuarantineSummary,
  listReviewEvents,
  type ReviewActor,
} from "./review-service";
import type { ContentEntityKind, ContentDetectorSource, ContentReviewState } from "./contract";

export interface ContentReviewRouterDeps {
  db: SqliteDatabase;
  repositoryRoot: string;
  requiredLocales?: readonly string[];
  getMonitorHealth?: () => unknown;
  catalogProvider?: () => readonly PestDiseaseCatalogEntry[];
}

const eventIdsSchema = z.object({
  eventIds: z.array(z.string().min(1)).min(1).max(200),
  reason: z.string().trim().min(3).max(500),
});

function actorFrom(req: Request): ReviewActor {
  const authUser = req.authUser;
  if (!authUser) {
    throw new Error("CONTENT_REVIEW_ACTOR_MISSING");
  }
  return { id: `${authUser.id}:${authUser.email}`, role: authUser.role };
}

export function createContentReviewRouter(deps: ContentReviewRouterDeps): Router {
  const router = Router();

  router.get("/events", (req: Request, res: Response) => {
    const reviewStates = typeof req.query.reviewState === "string"
      ? (req.query.reviewState.split(",").filter(Boolean) as ContentReviewState[])
      : undefined;
    const detectorSources = typeof req.query.detectorSource === "string"
      ? (req.query.detectorSource.split(",").filter(Boolean) as ContentDetectorSource[])
      : undefined;
    const entityKind = typeof req.query.entityKind === "string" && req.query.entityKind
      ? (req.query.entityKind as ContentEntityKind)
      : undefined;
    const page = listReviewEvents(deps.db, {
      reviewStates,
      detectorSources,
      entityKind,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json(page);
  });

  router.get("/events/:eventId/preview", (req: Request, res: Response) => {
    try {
      res.json(buildEventPreview(deps.db, deps.repositoryRoot, String(req.params.eventId)));
    } catch (error) {
      if (error instanceof Error && error.message === "CONTENT_CHANGE_EVENT_NOT_FOUND") {
        res.status(404).json({ error: "Event not found" });
        return;
      }
      throw error;
    }
  });

  router.post("/approve", (req: Request, res: Response) => {
    const payload = eventIdsSchema.parse(req.body);
    const result = approveEvents(deps.db, deps.repositoryRoot, {
      eventIds: payload.eventIds,
      actor: actorFrom(req),
      reason: payload.reason,
      requiredLocales: deps.requiredLocales,
    });
    res.json(result);
  });

  router.post("/dismiss", (req: Request, res: Response) => {
    const payload = eventIdsSchema.parse(req.body);
    const result = dismissEvents(deps.db, {
      eventIds: payload.eventIds,
      actor: actorFrom(req),
      reason: payload.reason,
    });
    res.json(result);
  });

  router.post("/proposals/:proposalId/apply", (req: Request, res: Response) => {
    const payload = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const outcome = applyProposal(deps.db, deps.repositoryRoot, {
      proposalId: String(req.params.proposalId),
      actor: actorFrom(req),
      reason: payload.reason,
      catalog: deps.catalogProvider?.(),
    });
    res.status(outcome.status === "applied" ? 200 : 409).json(outcome);
  });

  router.get("/monitor-status", (_req: Request, res: Response) => {
    res.json({
      health: deps.getMonitorHealth ? deps.getMonitorHealth() : null,
      quarantined: getQuarantineSummary(deps.db),
    });
  });

  return router;
}
