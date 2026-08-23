import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";

export const savingsGoalsRouter = Router();

/**
 * GET /api/savings-goals
 * Progress is the linked account's live balance when one is set, otherwise
 * the manually tracked currentAmount.
 */
savingsGoalsRouter.get("/", requireAuth, async (req, res) => {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId: req.userId! },
    include: { linkedAccount: { select: { id: true, name: true, nickname: true, currentBalance: true } } },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      targetDate: g.targetDate,
      linkedAccount: g.linkedAccount
        ? { id: g.linkedAccount.id, name: g.linkedAccount.nickname ?? g.linkedAccount.name }
        : null,
      currentAmount: g.linkedAccount ? g.linkedAccount.currentBalance ?? 0 : g.currentAmount,
    })),
  });
});

const createSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  targetDate: z.string().optional(),
  linkedAccountId: z.string().optional(),
  currentAmount: z.number().min(0).optional(),
});

savingsGoalsRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, targetAmount, targetDate, linkedAccountId, currentAmount } = parsed.data;

  if (linkedAccountId) {
    const account = await prisma.account.findFirst({
      where: { id: linkedAccountId, item: { userId: req.userId! } },
    });
    if (!account) {
      res.status(404).json({ error: "Linked account not found." });
      return;
    }
  }

  const goal = await prisma.savingsGoal.create({
    data: {
      userId: req.userId!,
      name,
      targetAmount,
      targetDate: targetDate ? new Date(targetDate) : null,
      linkedAccountId: linkedAccountId ?? null,
      currentAmount: currentAmount ?? 0,
    },
  });
  res.status(201).json({ goal });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  targetAmount: z.number().positive().optional(),
  targetDate: z.string().nullable().optional(),
  currentAmount: z.number().min(0).optional(),
});

savingsGoalsRouter.patch("/:id", requireAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!goal) {
    res.status(404).json({ error: "Goal not found." });
    return;
  }

  const { targetDate, ...rest } = parsed.data;
  const updated = await prisma.savingsGoal.update({
    where: { id: goal.id },
    data: {
      ...rest,
      ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
    },
  });
  res.json({ goal: updated });
});

savingsGoalsRouter.delete("/:id", requireAuth, async (req, res) => {
  const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!goal) {
    res.status(404).json({ error: "Goal not found." });
    return;
  }
  await prisma.savingsGoal.delete({ where: { id: goal.id } });
  res.status(204).send();
});
