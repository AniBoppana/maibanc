import { prisma } from "../db/client";
import { estimateAnnualTax } from "./taxConstants";

export type ReportFilter = { from?: Date; to?: Date; accountIds?: string[] };

function accountScope(userId: string, filter: ReportFilter) {
  return {
    item: { userId },
    ...(filter.accountIds && filter.accountIds.length > 0 ? { id: { in: filter.accountIds } } : {}),
  };
}

function dateScope(filter: ReportFilter) {
  if (!filter.from && !filter.to) return {};
  return {
    date: {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    },
  };
}

function monthsBetween(from?: Date, to?: Date): number {
  if (!from || !to) return 12;
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
  return Math.max(1, months);
}

/** Effective category (manual override / split, falling back to Plaid's raw category), scoped to a date range and account set. */
async function effectiveAmounts(userId: string, filter: ReportFilter, amountFilter: "spend" | "income" | "all") {
  const transactions = await prisma.transaction.findMany({
    where: {
      account: accountScope(userId, filter),
      pending: false,
      ...(amountFilter === "spend" ? { amount: { gt: 0 } } : amountFilter === "income" ? { amount: { lt: 0 } } : {}),
      ...dateScope(filter),
    },
    select: {
      amount: true,
      date: true,
      category: true,
      userCategory: true,
      splits: { select: { category: true, amount: true } },
    },
  });

  const rows: { category: string; amount: number; date: Date }[] = [];
  for (const t of transactions) {
    if (t.splits.length > 0) {
      for (const s of t.splits) rows.push({ category: s.category, amount: s.amount, date: t.date });
    } else {
      rows.push({ category: t.userCategory ?? t.category ?? "Uncategorized", amount: t.amount, date: t.date });
    }
  }
  return rows;
}

/** Cash Flow: income vs. expenses per month over the range. */
export async function cashFlowReport(userId: string, filter: ReportFilter) {
  const transactions = await prisma.transaction.findMany({
    where: { account: accountScope(userId, filter), pending: false, ...dateScope(filter) },
    select: { amount: true, date: true },
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

  return {
    monthly,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netCashFlow: Math.round((totalIncome - totalExpenses) * 100) / 100,
  };
}

/** Income & Expense by Category: itemized totals, income and expense kept separate. */
export async function incomeExpenseReport(userId: string, filter: ReportFilter) {
  const [spend, income] = await Promise.all([
    effectiveAmounts(userId, filter, "spend"),
    effectiveAmounts(userId, filter, "income"),
  ]);

  const totalsFor = (rows: { category: string; amount: number }[]) => {
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.category, (totals.get(r.category) ?? 0) + Math.abs(r.amount));
    return Array.from(totals.entries())
      .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
  };

  const expenses = totalsFor(spend);
  const incomeByCategory = totalsFor(income);

  return {
    expenses,
    income: incomeByCategory,
    totalExpenses: Math.round(expenses.reduce((s, c) => s + c.total, 0) * 100) / 100,
    totalIncome: Math.round(incomeByCategory.reduce((s, c) => s + c.total, 0) * 100) / 100,
  };
}

/** Spending by Category: expense-only breakdown with percentages, for a pie/legend view. */
export async function spendingByCategoryReport(userId: string, filter: ReportFilter) {
  const rows = await effectiveAmounts(userId, filter, "spend");
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.category, (totals.get(r.category) ?? 0) + r.amount);
  const total = Array.from(totals.values()).reduce((s, v) => s + v, 0);

  const categories = Array.from(totals.entries())
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount * 100) / 100,
      percent: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { categories, total: Math.round(total * 100) / 100 };
}

/**
 * Balance Sheet: current balances of the selected accounts, grouped into
 * assets/liabilities. Always "as of now" — the data model only keeps
 * historical balances via daily snapshots (see Net Worth), not a fully
 * reconstructable point-in-time balance sheet for an arbitrary past date.
 */
export async function balanceSheetReport(userId: string, filter: ReportFilter) {
  const accounts = await prisma.account.findMany({
    where: accountScope(userId, filter),
    select: { id: true, name: true, nickname: true, type: true, subtype: true, currentBalance: true },
  });

  const assets = accounts.filter((a) => ["depository", "investment"].includes(a.type));
  const liabilities = accounts.filter((a) => ["credit", "loan"].includes(a.type));
  const sum = (list: typeof accounts) => list.reduce((s, a) => s + (a.currentBalance ?? 0), 0);

  return {
    asOf: new Date().toISOString().slice(0, 10),
    assets: assets.map((a) => ({ id: a.id, name: a.nickname ?? a.name, subtype: a.subtype, balance: a.currentBalance ?? 0 })),
    liabilities: liabilities.map((a) => ({ id: a.id, name: a.nickname ?? a.name, subtype: a.subtype, balance: a.currentBalance ?? 0 })),
    totalAssets: Math.round(sum(assets) * 100) / 100,
    totalLiabilities: Math.round(sum(liabilities) * 100) / 100,
    netWorth: Math.round((sum(assets) - sum(liabilities)) * 100) / 100,
  };
}

/** Transaction Detail: the raw filtered ledger, newest first. */
export async function transactionDetailReport(userId: string, filter: ReportFilter) {
  const transactions = await prisma.transaction.findMany({
    where: { account: accountScope(userId, filter), ...dateScope(filter) },
    orderBy: { date: "desc" },
    take: 1000,
    include: { account: { select: { id: true, name: true, nickname: true } } },
  });

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.date,
      account: t.account.nickname ?? t.account.name,
      name: t.name,
      category: t.userCategory ?? t.category,
      taxCategory: t.taxCategory,
      amount: t.amount,
    })),
    count: transactions.length,
  };
}

/** Tax Summary: totals by tax category over an arbitrary range, same categories used for the tax export CSV. */
export async function taxSummaryReport(userId: string, filter: ReportFilter) {
  const tagged = await prisma.transaction.findMany({
    where: { account: accountScope(userId, filter), taxCategory: { not: null }, ...dateScope(filter) },
    select: { taxCategory: true, amount: true },
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
    .map(([taxCategory, { total, count }]) => ({ taxCategory, total: Math.round(total * 100) / 100, count }))
    .sort((a, b) => b.total - a.total);

  const months = monthsBetween(filter.from, filter.to);
  const businessTotal = byCategory.get("BUSINESS")?.total ?? 0;
  const annualizedNet = (businessTotal / months) * 12;

  return { summary, estimatedTax: estimateAnnualTax(annualizedNet) };
}

/** Business P&L: income vs. expenses for business-attributed accounts over an arbitrary range. */
export async function businessPnlReport(userId: string, filter: ReportFilter) {
  const scope = accountScope(userId, filter);
  const transactions = await prisma.transaction.findMany({
    where: {
      pending: false,
      ...dateScope(filter),
      OR: [
        { reassignedAccountId: null, account: { ...scope, isBusiness: true } },
        { reassignedAccountId: { not: null }, reassignedAccount: { ...scope, isBusiness: true } },
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
  const months = monthsBetween(filter.from, filter.to);

  return {
    monthly,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netIncome: Math.round(netIncome * 100) / 100,
    estimatedTax: estimateAnnualTax((netIncome / months) * 12),
  };
}

/** Budget vs. Actual: each budget's cap against effective spend for the selected range. */
export async function budgetVsActualReport(userId: string, filter: ReportFilter) {
  const [budgets, rows] = await Promise.all([
    prisma.budget.findMany({ where: { userId } }),
    effectiveAmounts(userId, filter, "spend"),
  ]);

  const spentByCategory = new Map<string, number>();
  for (const r of rows) spentByCategory.set(r.category, (spentByCategory.get(r.category) ?? 0) + r.amount);

  const items = budgets.map((b) => {
    const actual = spentByCategory.get(b.category) ?? 0;
    return {
      category: b.category,
      budget: b.amount,
      actual: Math.round(actual * 100) / 100,
      difference: Math.round((b.amount - actual) * 100) / 100,
      overBudget: actual > b.amount,
    };
  });

  return { items };
}

export const REPORT_TYPES = [
  "cash-flow",
  "income-expense",
  "spending-by-category",
  "balance-sheet",
  "transaction-detail",
  "tax-summary",
  "business-pnl",
  "budget-vs-actual",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export async function runReport(type: ReportType, userId: string, filter: ReportFilter) {
  switch (type) {
    case "cash-flow":
      return cashFlowReport(userId, filter);
    case "income-expense":
      return incomeExpenseReport(userId, filter);
    case "spending-by-category":
      return spendingByCategoryReport(userId, filter);
    case "balance-sheet":
      return balanceSheetReport(userId, filter);
    case "transaction-detail":
      return transactionDetailReport(userId, filter);
    case "tax-summary":
      return taxSummaryReport(userId, filter);
    case "business-pnl":
      return businessPnlReport(userId, filter);
    case "budget-vs-actual":
      return budgetVsActualReport(userId, filter);
  }
}
