import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { estimateAnnualTax } from "../services/taxConstants";

export const taxRouter = Router();

function yearRange(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

/**
 * GET /api/tax/summary?year=2026
 * Year-to-date totals grouped by tax category, plus an estimated-tax
 * projection (federal + CA) based on this year's BUSINESS-tagged income
 * annualized to a full year.
 */
taxRouter.get("/summary", requireAuth, async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear());

  const tagged = await prisma.transaction.findMany({
    where: {
      account: { item: { userId: req.userId! } },
      taxCategory: { not: null },
      date: yearRange(year),
    },
    select: { taxCategory: true, amount: true, date: true },
  });

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const t of tagged) {
    const key = t.taxCategory!;
    const entry = byCategory.get(key) ?? { total: 0, count: 0 };
    entry.total += t.amount;
    entry.count += 1;
    byCategory.set(key, entry);
  }

  const summary = Array.from(byCategory.entries())
    .map(([taxCategory, { total, count }]) => ({
      taxCategory,
      total: Math.round(total * 100) / 100,
      count,
    }))
    .sort((a, b) => b.total - a.total);

  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  const businessTotal = byCategory.get("BUSINESS")?.total ?? 0;
  // Business-tagged spend is money OUT under Plaid's sign convention; net
  // business income for a tax estimate isn't derivable from expense tags
  // alone (no income-side tag exists yet), so annualize the business
  // EXPENSE total as a stand-in "net earnings" figure for the estimator
  // until Business P&L supplies a real income-vs-expense net.
  const annualizedNet = year === now.getFullYear() && dayOfYear > 0
    ? (businessTotal / dayOfYear) * 365
    : businessTotal;

  res.json({
    year,
    summary,
    estimatedTax: estimateAnnualTax(annualizedNet),
  });
});

/**
 * GET /api/tax/export.csv?year=2026
 * CSV of every tax-tagged transaction for the year, for a CPA.
 */
taxRouter.get("/export.csv", requireAuth, async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear());

  const transactions = await prisma.transaction.findMany({
    where: {
      account: { item: { userId: req.userId! } },
      taxCategory: { not: null },
      date: yearRange(year),
    },
    orderBy: { date: "asc" },
    include: { account: { select: { name: true } } },
  });

  const header = ["Date", "Account", "Description", "Category", "Tax Category", "Amount"];
  const rows = transactions.map((t) =>
    [
      t.date.toISOString().slice(0, 10),
      t.account.name,
      t.name,
      t.category ?? "",
      t.taxCategory ?? "",
      t.amount.toFixed(2),
    ]
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="maibanc-tax-${year}.csv"`);
  res.send(csv);
});
