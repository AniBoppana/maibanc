import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";

export const budgetsRouter = Router();

const budgetSchema = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  period: z.literal("monthly").default("monthly"),
});

/**
 * GET /api/budgets
 * Returns all budgets for the signed-in user.
 */
budgetsRouter.get("/", requireAuth, async (req, res) => {
  const budgets = await prisma.budget.findMany({ where: { userId: req.userId! } });
  res.json({ budgets });
});

/**
 * POST /api/budgets
 * Creates or updates a budget for a given category and period.
 * Body: { category: string, amount: number, period?: "monthly" }
 */
budgetsRouter.post("/", requireAuth, async (req, res) => {
  const parsed = budgetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const budget = await prisma.budget.upsert({
    where: {
      userId_category_period: {
        userId: req.userId!,
        category: parsed.data.category,
        period: parsed.data.period,
      },
    },
    create: { userId: req.userId!, ...parsed.data },
    update: { amount: parsed.data.amount },
  });

  res.status(201).json({ budget });
});

/**
 * DELETE /api/budgets/:id
 * Deletes a budget by id.
 */
budgetsRouter.delete("/:id", requireAuth, async (req, res) => {
  const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
  if (!budget || budget.userId !== req.userId) {
    res.status(404).json({ error: "Budget not found." });
    return;
  }
  await prisma.budget.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
