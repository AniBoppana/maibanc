import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { getEffectiveCategoryAmounts } from "../services/effectiveCategories";

export const groupsRouter = Router();

const memberSchema = z.object({
  type: z.enum(["category", "account"]),
  value: z.string().min(1),
});

const bodySchema = z.object({
  name: z.string().min(1).max(80),
  members: z.array(memberSchema).min(1),
});

async function validateMembers(userId: string, members: { type: string; value: string }[]) {
  const accountIds = members.filter((m) => m.type === "account").map((m) => m.value);
  if (accountIds.length === 0) return true;
  const owned = await prisma.account.count({
    where: { id: { in: accountIds }, item: { userId } },
  });
  return owned === accountIds.length;
}

/**
 * GET /api/groups
 * Each group's total sums its members: an account member contributes its
 * live current balance; a category member contributes that category's
 * effective spend for the current month (the same window Budgets uses for
 * "spent so far"), since categories don't have a balance of their own.
 */
groupsRouter.get("/", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const groups = await prisma.groupedCategory.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

  const accountIds = new Set<string>();
  for (const g of groups) {
    for (const m of g.members as { type: string; value: string }[]) {
      if (m.type === "account") accountIds.add(m.value);
    }
  }

  const [accounts, monthSpend] = await Promise.all([
    accountIds.size > 0
      ? prisma.account.findMany({
          where: { id: { in: Array.from(accountIds) } },
          select: { id: true, name: true, nickname: true, currentBalance: true },
        })
      : Promise.resolve([]),
    getEffectiveCategoryAmounts(userId, { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const spendByCategory = new Map<string, number>();
  for (const s of monthSpend) {
    spendByCategory.set(s.category, (spendByCategory.get(s.category) ?? 0) + s.amount);
  }

  const result = groups.map((g) => {
    const members = g.members as { type: "category" | "account"; value: string }[];
    const items = members.map((m) => {
      if (m.type === "account") {
        const account = accountById.get(m.value);
        return {
          type: "account" as const,
          value: m.value,
          label: account ? account.nickname ?? account.name : "Unknown account",
          amount: account?.currentBalance ?? 0,
        };
      }
      return {
        type: "category" as const,
        value: m.value,
        label: m.value,
        amount: Math.round((spendByCategory.get(m.value) ?? 0) * 100) / 100,
      };
    });
    return {
      id: g.id,
      name: g.name,
      items,
      total: Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100,
    };
  });

  res.json({ groups: result });
});

groupsRouter.post("/", requireAuth, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await validateMembers(req.userId!, parsed.data.members))) {
    res.status(404).json({ error: "One or more account members were not found." });
    return;
  }

  const group = await prisma.groupedCategory.create({
    data: { userId: req.userId!, name: parsed.data.name, members: parsed.data.members },
  });
  res.status(201).json({ group });
});

groupsRouter.patch("/:id", requireAuth, async (req, res) => {
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.groupedCategory.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  if (parsed.data.members && !(await validateMembers(req.userId!, parsed.data.members))) {
    res.status(404).json({ error: "One or more account members were not found." });
    return;
  }

  const group = await prisma.groupedCategory.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.members ? { members: parsed.data.members } : {}),
    },
  });
  res.json({ group });
});

groupsRouter.delete("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.groupedCategory.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  await prisma.groupedCategory.delete({ where: { id: existing.id } });
  res.status(204).send();
});
