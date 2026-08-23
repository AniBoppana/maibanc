import { prisma } from "../db/client";

export type CategoryAmount = { category: string; amount: number; date: Date };

/**
 * Flattens the user's spend transactions into category-attributed amounts.
 * A split transaction contributes one entry per split (its own amount);
 * an unsplit transaction contributes one entry using its manual
 * userCategory override, falling back to Plaid's raw category. This is the
 * single source of truth every category-based report (Forecast, Budgets,
 * Dashboard) should read from — never the raw `category` column directly.
 */
export async function getEffectiveCategoryAmounts(
  userId: string,
  range: { gte?: Date; lte?: Date } = {}
): Promise<CategoryAmount[]> {
  const transactions = await prisma.transaction.findMany({
    where: {
      account: { item: { userId } },
      amount: { gt: 0 },
      pending: false,
      ...(range.gte || range.lte
        ? { date: { ...(range.gte ? { gte: range.gte } : {}), ...(range.lte ? { lte: range.lte } : {}) } }
        : {}),
    },
    select: {
      amount: true,
      date: true,
      category: true,
      userCategory: true,
      splits: { select: { category: true, amount: true } },
    },
  });

  const result: CategoryAmount[] = [];
  for (const t of transactions) {
    if (t.splits.length > 0) {
      for (const s of t.splits) {
        result.push({ category: s.category, amount: s.amount, date: t.date });
      }
    } else {
      result.push({ category: t.userCategory ?? t.category ?? "Uncategorized", amount: t.amount, date: t.date });
    }
  }
  return result;
}

/** Every category name the user has ever used — Plaid's raw taxonomy plus manual overrides and split categories. */
export async function getAllKnownCategories(userId: string): Promise<string[]> {
  const [raw, userCats, splitCats] = await Promise.all([
    prisma.transaction.findMany({
      where: { account: { item: { userId } }, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
    }),
    prisma.transaction.findMany({
      where: { account: { item: { userId } }, userCategory: { not: null } },
      select: { userCategory: true },
      distinct: ["userCategory"],
    }),
    prisma.transactionSplit.findMany({
      where: { transaction: { account: { item: { userId } } } },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);

  const set = new Set<string>();
  raw.forEach((r) => r.category && set.add(r.category));
  userCats.forEach((r) => r.userCategory && set.add(r.userCategory));
  splitCats.forEach((r) => set.add(r.category));

  return Array.from(set).sort();
}
