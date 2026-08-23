import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";

export const accountsRouter = Router();

type AccountRow = { type: string; currentBalance: number | null };

/**
 * GET /api/accounts
 * Returns all accounts for the signed-in user with current balances.
 * Also returns a computed net worth (assets minus liabilities).
 */
accountsRouter.get("/", requireAuth, async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { item: { userId: req.userId! } },
    include: {
      item: { select: { institutionName: true, status: true } },
    },
    orderBy: { type: "asc" },
  });

  const assets = accounts
    .filter((a: AccountRow) => ["depository", "investment"].includes(a.type))
    .reduce((sum: number, a: AccountRow) => sum + (a.currentBalance ?? 0), 0);

  const liabilities = accounts
    .filter((a: AccountRow) => ["credit", "loan"].includes(a.type))
    .reduce((sum: number, a: AccountRow) => sum + (a.currentBalance ?? 0), 0);

  res.json({
    accounts,
    netWorth: Math.round((assets - liabilities) * 100) / 100,
    totalAssets: Math.round(assets * 100) / 100,
    totalLiabilities: Math.round(liabilities * 100) / 100,
  });
});

/**
 * PATCH /api/accounts/:id/business
 * Body: { isBusiness: boolean }
 * Flags an account as business (vs. personal) for the Business P&L page.
 */
accountsRouter.patch("/:id/business", requireAuth, async (req, res) => {
  const { isBusiness } = req.body as { isBusiness?: boolean };
  if (typeof isBusiness !== "boolean") {
    res.status(400).json({ error: "isBusiness must be a boolean." });
    return;
  }

  const account = await prisma.account.findUnique({
    where: { id: req.params.id },
    include: { item: true },
  });
  if (!account || account.item.userId !== req.userId) {
    res.status(404).json({ error: "Account not found." });
    return;
  }

  const updated = await prisma.account.update({
    where: { id: req.params.id },
    data: { isBusiness },
  });
  res.json({ account: updated });
});

/**
 * PATCH /api/accounts/:id/nickname
 * Body: { nickname: string | null }
 * Sets (or clears, with null) a display nickname for an account — purely
 * cosmetic, never sent to Plaid, never affects sync.
 */
accountsRouter.patch("/:id/nickname", requireAuth, async (req, res) => {
  const { nickname } = req.body as { nickname?: string | null };
  if (nickname !== null && typeof nickname !== "string") {
    res.status(400).json({ error: "nickname must be a string or null." });
    return;
  }
  const trimmed = nickname?.trim() || null;

  const account = await prisma.account.findUnique({
    where: { id: req.params.id },
    include: { item: true },
  });
  if (!account || account.item.userId !== req.userId) {
    res.status(404).json({ error: "Account not found." });
    return;
  }

  const updated = await prisma.account.update({
    where: { id: req.params.id },
    data: { nickname: trimmed },
  });
  res.json({ account: updated });
});
