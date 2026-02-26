import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { revenuecatWebhook } from "./webhooks/revenuecat";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);
http.route({
  path: "/webhooks/revenuecat",
  method: "POST",
  handler: revenuecatWebhook,
});

export default http;
