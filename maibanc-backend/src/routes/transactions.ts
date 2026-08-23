import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { decrypt } from "../services/encryption";
import { syncAllItemsForUser } from "../services/transactionSync";
import { getMonthlySummary } from "../services/forecastService";
import { getAllKnownCategories } from "../services/effectiveCategories";

export const transactionsRouter = Router();

const listQuerySchema = z.object({
  category: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

/**
 * GET /api/transactions
 * Lists the signed-in user's transactions, newest first.
 * Supports filtering by category, date range, and cursor-based pagination.
 */
transactionsRouter.get("/", requireAuth, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { category, from, to, limit, cursor } = parsed.data;

  const transactions = await prisma.transaction.findMany({
    where: {
      account: { item: { userId: req.userId! } },
      // Effective category: the manual override if one exists, else the raw
      // Plaid category. A transaction with a userCategory never matches a
      // filter on its old raw category — the override is meant to replace it.
      ...(category
        ? { OR: [{ userCategory: category }, { AND: [{ userCategory: null }, { category }] }] }
        : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      account: { select: { id: true, name: true, nickname: true, mask: true, type: true } },
      reassignedAccount: { select: { id: true, name: true, nickname: true } },
      splits: true,
    },
  });

  res.json({ transactions });
});

/**
 * GET /api/transactions/categories
 * Every category the user has ever used: Plaid's raw taxonomy, manual
 * overrides, and split categories combined.
 */
transactionsRouter.get("/categories", requireAuth, async (req, res) => {
  const categories = await getAllKnownCategories(req.userId!);
  res.json({ categories });
});

/**
 * GET /api/transactions/monthly-summary
 * Groups transactions by month and sums by category (for the chart).
 */
transactionsRouter.get("/monthly-summary", requireAuth, async (req, res) => {
  const months = Number(req.query.months ?? 6);
  const summary = await getMonthlySummary(req.userId!, months);
  res.json({ summary });
});

const TAX_CATEGORIES = [
  "DEDUCTIBLE",
  "BUSINESS",
  "CHARITABLE",
  "MEDICAL",
  "EDUCATION",
  "HOME_OFFICE",
  "MILEAGE_TRAVEL",
] as const;

const taxTagSchema = z.object({
  taxCategory: z.enum(TAX_CATEGORIES).nullable(),
});

/**
 * PATCH /api/transactions/:id/tax-category
 * Body: { taxCategory: one of TAX_CATEGORIES | null }
 * Tags (or clears) a transaction's tax category for the Tax Report.
 */
transactionsRouter.patch("/:id/tax-category", requireAuth, async (req, res) => {
  const parsed = taxTagSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const txn = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: { account: { include: { item: true } } },
  });
  if (!txn || txn.account.item.userId !== req.userId) {
    res.status(404).json({ error: "Transaction not found." });
    return;
  }

  const updated = await prisma.transaction.update({
    where: { id: req.params.id },
    data: { taxCategory: parsed.data.taxCategory },
  });
  res.json({ transaction: updated });
});

const categorySchema = z.object({
  category: z.string().min(1).max(60).nullable(),
  createRule: z.boolean().optional(),
});

/**
 * PATCH /api/transactions/:id/category
 * Body: { category: string | null, createRule?: boolean }
 * Sets a manual category override (wins over Plaid's raw category
 * everywhere it's displayed or aggregated). With createRule: true, also
 * saves a CategoryRule so future transactions from the same merchant are
 * categorized automatically.
 */
transactionsRouter.patch("/:id/category", requireAuth, async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const txn = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: { account: { include: { item: true } } },
  });
  if (!txn || txn.account.item.userId !== req.userId) {
    res.status(404).json({ error: "Transaction not found." });
    return;
  }

  const updated = await prisma.transaction.update({
    where: { id: req.params.id },
    data: { userCategory: parsed.data.category },
  });

  if (parsed.data.createRule && parsed.data.category) {
    const matchValue = txn.merchantName ?? txn.name;
    await prisma.categoryRule.create({
      data: { userId: req.userId!, matchValue, category: parsed.data.category },
    });
  }

  res.json({ transaction: updated });
});

const reassignSchema = z.object({
  reassignedAccountId: z.string().nullable(),
});

/**
 * PATCH /api/transactions/:id/reassign
 * Body: { reassignedAccountId: string | null }
 * Attributes a transaction to a different account for bookkeeping (e.g. a
 * business expense accidentally charged to a personal card). The real
 * Plaid transaction and account are never touched — this only changes
 * which account Business P&L and per-account views attribute it to.
 */
transactionsRouter.patch("/:id/reassign", requireAuth, async (req, res) => {
  const parsed = reassignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const txn = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: { account: { include: { item: true } } },
  });
  if (!txn || txn.account.item.userId !== req.userId) {
    res.status(404).json({ error: "Transaction not found." });
    return;
  }

  if (parsed.data.reassignedAccountId) {
    const target = await prisma.account.findUnique({
      where: { id: parsed.data.reassignedAccountId },
      include: { item: true },
    });
    if (!target || target.item.userId !== req.userId) {
      res.status(404).json({ error: "Target account not found." });
      return;
    }
  }

  const updated = await prisma.transaction.update({
    where: { id: req.params.id },
    data: { reassignedAccountId: parsed.data.reassignedAccountId },
  });
  res.json({ transaction: updated });
});

const splitSchema = z.object({
  splits: z
    .array(z.object({ category: z.string().min(1).max(60), amount: z.number() }))
    .min(2, "A split needs at least two allocations."),
});

/**
 * POST /api/transactions/:id/split
 * Body: { splits: [{ category, amount }, ...] } — amounts must sum to the
 * transaction's own amount. Replaces any existing splits.
 */
transactionsRouter.post("/:id/split", requireAuth, async (req, res) => {
  const parsed = splitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const txn = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: { account: { include: { item: true } } },
  });
  if (!txn || txn.account.item.userId !== req.userId) {
    res.status(404).json({ error: "Transaction not found." });
    return;
  }

  const sum = parsed.data.splits.reduce((s, x) => s + x.amount, 0);
  if (Math.round(sum * 100) !== Math.round(txn.amount * 100)) {
    res.status(400).json({ error: `Splits must sum to $${txn.amount.toFixed(2)}, got $${sum.toFixed(2)}.` });
    return;
  }

  await prisma.$transaction([
    prisma.transactionSplit.deleteMany({ where: { transactionId: txn.id } }),
    prisma.transactionSplit.createMany({
      data: parsed.data.splits.map((s) => ({ transactionId: txn.id, category: s.category, amount: s.amount })),
    }),
  ]);

  const withSplits = await prisma.transaction.findUnique({
    where: { id: txn.id },
    include: { splits: true },
  });
  res.json({ transaction: withSplits });
});

/**
 * DELETE /api/transactions/:id/split
 * Clears any splits, reverting the transaction to its own single category.
 */
transactionsRouter.delete("/:id/split", requireAuth, async (req, res) => {
  const txn = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: { account: { include: { item: true } } },
  });
  if (!txn || txn.account.item.userId !== req.userId) {
    res.status(404).json({ error: "Transaction not found." });
    return;
  }

  await prisma.transactionSplit.deleteMany({ where: { transactionId: txn.id } });
  res.status(204).send();
});

/**
 * POST /api/transactions/sync
 * Manually re-syncs all connected items.
 */
transactionsRouter.post("/sync", requireAuth, async (req, res) => {
  try {
    const itemCount = await syncAllItemsForUser(req.userId!, decrypt);
    res.json({ syncedItems: itemCount });
  } catch (err: any) {
    console.error("Manual sync error:", err?.response?.data ?? err);
    res.status(500).json({ error: "Failed to sync transactions." });
  }
});
