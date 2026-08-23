import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getCategoryAverages,
  detectRecurring,
  getBudgetPacing,
  getBalanceProjection,
} from "../services/forecastService";

export const forecastRouter = Router();

/**
 * GET /api/forecast
 * One-stop response for the dashboard. Returns:
 *   - categoryAverages: monthly average spend per category (trailing 3 months)
 *   - recurring: auto-detected subscriptions and recurring bills
 *   - budgetPacing: how each budget is tracking vs month-to-date spend
 *   - balanceProjection: estimated end-of-month balance based on daily rate
 */
forecastRouter.get("/", requireAuth, async (req, res) => {
  try {
    const [categoryAverages, recurring, budgetPacing, balanceProjection] = await Promise.all([
      getCategoryAverages(req.userId!),
      detectRecurring(req.userId!),
      getBudgetPacing(req.userId!),
      getBalanceProjection(req.userId!),
    ]);

    res.json({ categoryAverages, recurring, budgetPacing, balanceProjection });
  } catch (err) {
    console.error("Forecast error:", err);
    res.status(500).json({ error: "Failed to compute forecast." });
  }
});
