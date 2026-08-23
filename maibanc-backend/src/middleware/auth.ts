import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { prisma } from "../db/client";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // ── Dev bypass ───────────────────────────────────────────────────────────────
  // In development, pass X-Dev-User-Id: user_xxx in the request header
  // to skip Clerk auth entirely. Never runs in production.
  if (process.env.NODE_ENV === "development") {
    const devUserId = req.headers["x-dev-user-id"] as string | undefined;
    if (devUserId) {
      try {
        const existing = await prisma.user.findUnique({ where: { id: devUserId } });
        if (!existing) {
          const clerkUser = await clerkClient.users.getUser(devUserId);
          await prisma.user.create({
            data: {
              id: devUserId,
              email: clerkUser.emailAddresses[0]?.emailAddress ?? null,
            },
          });
        }
        req.userId = devUserId;
        return next();
      } catch (err) {
        res.status(400).json({ error: "Invalid X-Dev-User-Id header." });
        return;
      }
    }
  }

  // ── Normal Clerk auth ────────────────────────────────────────────────────────
  const { userId, isAuthenticated } = getAuth(req);

  if (!isAuthenticated || !userId) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      const clerkUser = await clerkClient.users.getUser(userId);
      await prisma.user.create({
        data: {
          id: userId,
          email: clerkUser.emailAddresses[0]?.emailAddress ?? null,
        },
      });
    }
  } catch (err) {
    console.error("Failed to provision local user record:", err);
    res.status(500).json({ error: "Failed to provision user." });
    return;
  }

  req.userId = userId;
  next();
}