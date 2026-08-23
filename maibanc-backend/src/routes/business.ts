import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { estimateAnnualTax } from "../services/taxConstants";

export const businessRouter = Router();

/**
 * GET /api/business/pnl?months=12
 * Income vs. expenses per month for accounts flagged isBusiness, plus a
 * quarterly estimated-tax figure (federal + CA) from the trailing 12
 * months' real net income, annualized.
 */
businessRouter.get("/pnl", requireAuth, async (req, res) => {
  const months = Math.min(24, Math.max(1, Number(req.query.months ?? 12)));
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const transactions = await prisma.transaction.findMany({
    where: {
      account: { item: { userId: req.userId! } },
      date: { gte: since },
      pending: false,
      // Effective account (reassignedAccount, falling back to the real
      // account) must be flagged business — a personal-card charge
      // reassigned to a business account counts here; a business-card
      // charge reassigned AWAY to a personal account does not.
      OR: [
        { reassignedAccountId: null, account: { isBusiness: true } },
        { reassignedAccountId: { not: null }, reassignedAccount: { isBusiness: true } },
      ],
    },
    select: { amount: true, date: true },
    orderBy: { date: "asc" },
  });

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const t of transactions) {
    const key = t.date.toISOString().slice(0, 7);
    const entry = byMonth.get(key) ?? { income: 0, expenses: 0 };
    if (t.amount < 0) entry.income += -t.amount;
    else entry.expenses += t.amount;
    byMonth.set(key, entry);
  }

  const monthly = Array.from(byMonth.entries())
    .map(([month, { income, expenses }]) => ({
      month,
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round((income - expenses) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const totalIncome = monthly.reduce((s, m) => s + m.income, 0);
  const totalExpenses = monthly.reduce((s, m) => s + m.expenses, 0);
  const netIncome = totalIncome - totalExpenses;
  const annualizedNet = (netIncome / months) * 12;

  const businessAccounts = await prisma.account.count({
    where: { item: { userId: req.userId! }, isBusiness: true },
  });

  res.json({
    hasBusinessAccounts: businessAccounts > 0,
    monthly,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netIncome: Math.round(netIncome * 100) / 100,
    estimatedTax: estimateAnnualTax(annualizedNet),
  });
});
