import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import type { SqliteDatabase } from "./db";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
}

export interface AuthUser {
  id: number;
  email: string;
  role: "admin" | "editor" | "viewer";
}

interface DbUserRow {
  id: number;
  email: string;
  password_hash: string;
  role: "admin" | "editor" | "viewer";
  is_active: number;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

function signToken(user: AuthUser, config: AuthConfig): string {
  const options: jwt.SignOptions = {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
    issuer: "richfarm-backend",
    audience: "richfarm-dashboard",
  };

  return jwt.sign({ sub: String(user.id), email: user.email, role: user.role }, config.jwtSecret, {
    ...options,
  });
}

export function createAuthRouter(db: SqliteDatabase, config: AuthConfig): Router {
  const router = Router();

  router.post("/login", (req: Request, res: Response) => {
    const payload = loginSchema.parse(req.body);
    const user = db
      .prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`)
      .get(payload.email.trim().toLowerCase()) as DbUserRow | undefined;

    if (!user || user.is_active !== 1) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const validPassword = bcrypt.compareSync(payload.password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const token = signToken(authUser, config);
    res.json({ token, user: authUser });
  });

  router.get("/me", requireAuth(config), (req: Request, res: Response) => {
    res.json({ user: req.authUser });
  });

  return router;
}

export function requireAuth(config: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }

    const token = authHeader.slice("Bearer ".length);

    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        issuer: "richfarm-backend",
        audience: "richfarm-dashboard",
      }) as jwt.JwtPayload;

      const id = Number(decoded.sub);
      const email = String(decoded.email ?? "");
      const role = decoded.role;

      if (!Number.isFinite(id) || !email || (role !== "admin" && role !== "editor" && role !== "viewer")) {
        res.status(401).json({ error: "Invalid token payload" });
        return;
      }

      req.authUser = {
        id,
        email,
        role,
      };

      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

export function requireRole(roles: Array<AuthUser["role"]>) {
  const roleSet = new Set(roles);

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!roleSet.has(req.authUser.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
