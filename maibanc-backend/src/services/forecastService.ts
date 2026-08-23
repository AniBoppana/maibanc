import { prisma } from "../db/client";
import { getEffectiveCategoryAmounts } from "./effectiveCategories";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Average monthly spend per category over the trailing `months` months.
 * Plaid convention: positive amount = money out. Respects manual category
 * overrides and split transactions (see effectiveCategories.ts).
 */
export async function getCategoryAverages(userId: string, months = 3) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const amounts = await getEffectiveCategoryAmounts(userId, { gte: since });

  const totals = new Map<string, number>();
  for (const a of amounts) {
    totals.set(a.category, (totals.get(a.category) ?? 0) + a.amount);
  }

  return Array.from(totals.entries())
    .map(([category, total]) => ({
      category,
      monthlyAverage: Math.round((total / months) * 100) / 100,
    }))
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage);
}

/**
 * Detects recurring charges (subscriptions, rent, bills) by grouping on
 * merchant + rounded amount and checking for roughly monthly intervals.
 */
export async function detectRecurring(userId: string, months = 4) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const transactions = await prisma.transaction.findMany({
    where: {
      account: { item: { userId } },
      date: { gte: since },
      amount: { gt: 0 },
      pending: false,
    },
    select: { amount: true, date: true, merchantName: true, name: true, category: true, userCategory: true },
    orderBy: { date: "asc" },
  });

  const groups = new Map<string, typeof transactions>();
  for (const t of transactions) {
    const merchant = t.merchantName ?? t.name;
    const key = `${merchant}__${Math.round(t.amount)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const recurring = [];
  for (const [, txns] of groups) {
    if (txns.length < 2) continue;

    const intervals: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      intervals.push((txns[i].date.getTime() - txns[i - 1].date.getTime()) / DAY_MS);
    }
    const avgInterval = intervals.reduce((a: number, b: number) => a + b, 0) / intervals.length;

    if (avgInterval >= 25 && avgInterval <= 35) {
      const last = txns[txns.length - 1];
      recurring.push({
        merchant: last.merchantName ?? last.name,
        category: last.userCategory ?? last.category,
        averageAmount:
          Math.round(
            (txns.reduce((s: number, t: { amount: number }) => s + t.amount, 0) / txns.length) *
              100
          ) / 100,
        occurrences: txns.length,
        lastSeen: last.date,
        nextExpected: new Date(last.date.getTime() + avgInterval * DAY_MS),
      });
    }
  }

  return recurring.sort((a, b) => b.averageAmount - a.averageAmount);
}

/**
 * Compares month-to-date spend against each budget and projects
 * where you'll land by month-end at the current daily pace.
 */
export async function getBudgetPacing(userId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();

  const [budgets, amounts] = await Promise.all([
    prisma.budget.findMany({ where: { userId } }),
    getEffectiveCategoryAmounts(userId, { gte: startOfMonth }),
  ]);

  const spentByCategory = new Map<string, number>();
  for (const a of amounts) {
    spentByCategory.set(a.category, (spentByCategory.get(a.category) ?? 0) + a.amount);
  }

  return budgets.map((budget: { category: string; amount: number }) => {
    const spentSoFar = spentByCategory.get(budget.category) ?? 0;
    const projected = Math.round((spentSoFar / dayOfMonth) * daysInMonth * 100) / 100;
    const pctOfBudget = budget.amount > 0 ? Math.round((projected / budget.amount) * 100) : 0;

    return {
      category: budget.category,
      budget: budget.amount,
      spentSoFar: Math.round(spentSoFar * 100) / 100,
      projectedMonthEnd: projected,
      projectedPctOfBudget: pctOfBudget,
      onTrack: projected <= budget.amount,
    };
  });
}

/**
 * Projects end-of-month balance using current balances and a linear
 * daily spend/income rate based on month-to-date activity.
 */
export async function getBalanceProjection(userId: string) {
  const accounts = await prisma.account.findMany({
    where: { item: { userId }, type: { in: ["depository"] } },
    select: { currentBalance: true },
  });

  const currentBalance = accounts.reduce(
    (sum: number, a: { currentBalance: number | null }) => sum + (a.currentBalance ?? 0),
    0
  );

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  const [spendAgg, incomeAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        account: { item: { userId } },
        date: { gte: startOfMonth },
        amount: { gt: 0 },
        pending: false,
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        account: { item: { userId } },
        date: { gte: startOfMonth },
        amount: { lt: 0 },
        pending: false,
      },
      _sum: { amount: true },
    }),
  ]);

  const dailySpend = (spendAgg._sum.amount ?? 0) / dayOfMonth;
  const dailyIncome = Math.abs(incomeAgg._sum.amount ?? 0) / dayOfMonth;

  const projectedEndOfMonthBalance =
    currentBalance - dailySpend * daysRemaining + dailyIncome * daysRemaining;

  return {
    currentBalance: Math.round(currentBalance * 100) / 100,
    daysRemainingInMonth: daysRemaining,
    projectedRemainingSpend: Math.round(dailySpend * daysRemaining * 100) / 100,
    projectedRemainingIncome: Math.round(dailyIncome * daysRemaining * 100) / 100,
    projectedEndOfMonthBalance: Math.round(projectedEndOfMonthBalance * 100) / 100,
  };
}

/**
 * Groups transactions by calendar month and sums by category.
 * Returns the last `months` months for the month-over-month chart.
 */
export async function getMonthlySummary(userId: string, months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const amounts = await getEffectiveCategoryAmounts(userId, { gte: since });

  const byMonth = new Map<string, Record<string, number>>();
  for (const a of amounts) {
    const month = a.date.toISOString().slice(0, 7); // "YYYY-MM"
    if (!byMonth.has(month)) byMonth.set(month, {});
    const entry = byMonth.get(month)!;
    entry[a.category] = Math.round(((entry[a.category] ?? 0) + a.amount) * 100) / 100;
  }

  return Array.from(byMonth.entries()).map(([month, categories]) => ({ month, categories }));
}
