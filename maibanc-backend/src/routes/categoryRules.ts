import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";

export const categoryRulesRouter = Router();

/**
 * GET /api/category-rules
 * Lists the user's "always categorize X as Y" rules.
 */
categoryRulesRouter.get("/", requireAuth, async (req, res) => {
  const rules = await prisma.categoryRule.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
  });
  res.json({ rules });
});

const createRuleSchema = z.object({
  matchValue: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
});

/**
 * POST /api/category-rules
 * Body: { matchValue: string, category: string }
 * Creates a rule and immediately applies it to every existing transaction
 * whose merchant/name contains matchValue (case-insensitive) and has no
 * manual category set yet.
 */
categoryRulesRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const rule = await prisma.categoryRule.create({
    data: { userId: req.userId!, matchValue: parsed.data.matchValue, category: parsed.data.category },
  });

  const { count } = await prisma.transaction.updateMany({
    where: {
      account: { item: { userId: req.userId! } },
      userCategory: null,
      OR: [
        { name: { contains: parsed.data.matchValue, mode: "insensitive" } },
        { merchantName: { contains: parsed.data.matchValue, mode: "insensitive" } },
      ],
    },
    data: { userCategory: parsed.data.category },
  });

  res.status(201).json({ rule, appliedTo: count });
});

/**
 * DELETE /api/category-rules/:id
 * Removes a rule. Does not undo categories it already applied.
 */
categoryRulesRouter.delete("/:id", requireAuth, async (req, res) => {
  const rule = await prisma.categoryRule.findUnique({ where: { id: req.params.id } });
  if (!rule || rule.userId !== req.userId) {
    res.status(404).json({ error: "Rule not found." });
    return;
  }
  await prisma.categoryRule.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
