import { Router } from "express";
import Groq from "groq-sdk";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import {
  getCategoryAverages,
  detectRecurring,
  getBudgetPacing,
  getBalanceProjection,
} from "../services/forecastService";

export const insightsRouter = Router();

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
});

const SUGGESTED_PROMPTS = [
  "How much did I spend on food last month?",
  "Am I on track for retirement?",
  "Where can I cut spending?",
  "What's my biggest recurring charge?",
];

insightsRouter.get("/prompts", requireAuth, (_req, res) => {
  res.json({ prompts: SUGGESTED_PROMPTS });
});

/**
 * POST /api/insights/chat
 * Body: { messages: [{role: 'user'|'assistant', content: string}, ...] }
 * Assembles the user's real accounts/transactions/budgets/forecast as
 * context, then asks Groq (openai/gpt-oss-120b) to answer. The model
 * may emit a fenced ```chart block (JSON: {type, title, data}) alongside
 * its prose when a breakdown question calls for a visual; the frontend
 * renders that block as a chart and strips it from the displayed text.
 */
insightsRouter.post("/chat", requireAuth, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    res.status(503).json({
      error: "GROQ_API_KEY is not set on the backend yet. Add it to maibanc-backend/.env and restart the server.",
    });
    return;
  }

  const userId = req.userId!;

  const [accounts, recentTransactions, budgets, categoryAverages, recurring, budgetPacing, balanceProjection] =
    await Promise.all([
      prisma.account.findMany({ where: { item: { userId } } }),
      prisma.transaction.findMany({
        where: { account: { item: { userId } }, date: { gte: new Date(Date.now() - 60 * 86_400_000) } },
        orderBy: { date: "desc" },
        take: 150,
        select: { name: true, amount: true, date: true, category: true },
      }),
      prisma.budget.findMany({ where: { userId } }),
      getCategoryAverages(userId),
      detectRecurring(userId),
      getBudgetPacing(userId),
      getBalanceProjection(userId),
    ]);

  const assets = accounts
    .filter((a: { type: string }) => ["depository", "investment"].includes(a.type))
    .reduce((s: number, a: { currentBalance: number | null }) => s + (a.currentBalance ?? 0), 0);
  const liabilities = accounts
    .filter((a: { type: string }) => ["credit", "loan"].includes(a.type))
    .reduce((s: number, a: { currentBalance: number | null }) => s + (a.currentBalance ?? 0), 0);

  const context = {
    netWorth: Math.round((assets - liabilities) * 100) / 100,
    totalAssets: Math.round(assets * 100) / 100,
    totalLiabilities: Math.round(liabilities * 100) / 100,
    accounts: accounts.map((a: any) => ({
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      balance: a.currentBalance,
    })),
    budgets: budgets.map((b: any) => ({ category: b.category, monthlyAmount: b.amount })),
    budgetPacing,
    categoryAveragesLast3Months: categoryAverages,
    recurringCharges: recurring,
    balanceProjection,
    recentTransactionsLast60Days: recentTransactions.map((t: any) => ({
      name: t.name,
      amount: t.amount,
      date: t.date.toISOString().slice(0, 10),
      category: t.category,
    })),
  };

  const systemPrompt = `You are Maibanc's financial insights assistant. Answer the user's questions about their own personal finances using ONLY the real data provided below as JSON — never invent numbers, accounts, or transactions that aren't in it. If the data doesn't answer the question, say so plainly rather than guessing.

Be concise and direct, like a sharp financial advisor, not a chatbot padded with caveats. Use real dollar figures from the data.

Plaid sign convention in the data: a positive transaction amount is money OUT (spending), negative is money IN (income/credit).

When the answer is naturally a breakdown across categories or a comparison of a few numbers (e.g. "spending by category", "budget vs actual"), append ONE fenced code block labeled \`chart\` containing strict JSON in this exact shape, after your prose answer:
\`\`\`chart
{"type":"pie"|"bar","title":"short title","data":[{"label":"...","value":123.45}]}
\`\`\`
Only include the chart block when a visual genuinely helps; most answers need no chart at all.

USER'S REAL FINANCIAL DATA:
${JSON.stringify(context)}`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "system", content: systemPrompt }, ...parsed.data.messages],
      temperature: 0.4,
      max_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    res.json({ reply });
  } catch (err: any) {
    console.error("Groq insights error:", err?.response?.data ?? err);
    res.status(502).json({ error: "The insights model could not be reached." });
  }
});
