import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getNetWorthHistory, takeDailySnapshot } from "../services/netWorthService";

export const networthRouter = Router();

/**
 * GET /api/networth/history?days=365
 * Daily net worth series (reconstructed from real transaction history,
 * upgraded to recorded snapshots once they exist) plus a breakdown by
 * account subtype as of today.
 */
networthRouter.get("/history", requireAuth, async (req, res) => {
  const days = Math.min(730, Math.max(30, Number(req.query.days ?? 365)));
  await takeDailySnapshot(req.userId!);
  const result = await getNetWorthHistory(req.userId!, days);
  res.json(result);
});
