import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { getBudgetPacing } from "../services/forecastService";
import { getEffectiveCategoryAmounts } from "../services/effectiveCategories";

export const alertsRouter = Router();

const LOW_BALANCE_THRESHOLD = 100;
const UNUSUAL_SPEND_MULTIPLIER = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function readableCategory(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * GET /api/alerts
 * Computes alerts on the fly from live data rather than storing them —
 * low balances, budgets tracking over, and single transactions that are
 * unusually large for their category. In-app only: no email/push, so this
 * is cheap to recompute per request instead of needing a schedule + queue.
 */
alertsRouter.get("/", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const alerts: { id: string; severity: "warning" | "critical"; message: string }[] = [];

  const accounts = await prisma.account.findMany({
    where: { item: { userId }, type: "depository" },
    select: { id: true, name: true, nickname: true, currentBalance: true },
  });
  for (const a of accounts) {
    if (a.currentBalance != null && a.currentBalance < LOW_BALANCE_THRESHOLD) {
      const label = a.nickname ?? a.name;
      alerts.push({
        id: `low-balance-${a.id}`,
        severity: a.currentBalance < 0 ? "critical" : "warning",
        message:
          a.currentBalance < 0
            ? `${label} is overdrawn at $${a.currentBalance.toFixed(2)}.`
            : `${label} is running low at $${a.currentBalance.toFixed(2)}.`,
      });
    }
  }

  const pacing = await getBudgetPacing(userId);
  for (const p of pacing) {
    if (!p.onTrack) {
      alerts.push({
        id: `budget-${p.category}`,
        severity: p.projectedPctOfBudget >= 125 ? "critical" : "warning",
        message: `${readableCategory(p.category)} is projected to hit $${p.projectedMonthEnd.toFixed(2)} this month, over your $${p.budget.toFixed(2)} budget.`,
      });
    }
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const [recent, historical] = await Promise.all([
    getEffectiveCategoryAmounts(userId, { gte: sevenDaysAgo }),
    getEffectiveCategoryAmounts(userId, { gte: threeMonthsAgo, lte: sevenDaysAgo }),
  ]);

  const historicalByCategory = new Map<string, number[]>();
  for (const h of historical) {
    if (!historicalByCategory.has(h.category)) historicalByCategory.set(h.category, []);
    historicalByCategory.get(h.category)!.push(h.amount);
  }

  for (const r of recent) {
    const hist = historicalByCategory.get(r.category);
    // Require a few prior transactions before calling anything "unusual" —
    // otherwise a category used for the first time always looks like a spike.
    if (!hist || hist.length < 3) continue;
    const avg = hist.reduce((s, n) => s + n, 0) / hist.length;
    if (avg > 0 && r.amount > avg * UNUSUAL_SPEND_MULTIPLIER) {
      alerts.push({
        id: `unusual-${r.category}-${r.date.getTime()}-${r.amount}`,
        severity: "warning",
        message: `A $${r.amount.toFixed(2)} charge in ${readableCategory(r.category)} is well above your usual ~$${avg.toFixed(2)}.`,
      });
    }
  }

  res.json({ alerts });
});
