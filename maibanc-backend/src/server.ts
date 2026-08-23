import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { clerkMiddleware } from "@clerk/express";

import { plaidRouter } from "./routes/plaid";
import { transactionsRouter } from "./routes/transactions";
import { accountsRouter } from "./routes/accounts";
import { budgetsRouter } from "./routes/budgets";
import { forecastRouter } from "./routes/forecast";
import { investmentsRouter } from "./routes/investments";
import { networthRouter } from "./routes/networth";
import { taxRouter } from "./routes/tax";
import { businessRouter } from "./routes/business";
import { insightsRouter } from "./routes/insights";
import { categoryRulesRouter } from "./routes/categoryRules";
import { devTokenRouter } from "./routes/devToken";

// ── Startup env check ─────────────────────────────────────────────────────────
const REQUIRED_ENV = [
  "CLERK_SECRET_KEY",
  "PLAID_CLIENT_ID",
  "PLAID_SECRET",
  "DATABASE_URL",
  "ENCRYPTION_KEY",
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`\nMissing required environment variables: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill these in before starting the server.\n");
  process.exit(1);
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
    credentials: true,
  })
);
app.use(express.json());

// Populates req.auth via getAuth() — does not block unauthenticated requests.
// requireAuth middleware (per-route) is what actually enforces login.
app.use(clerkMiddleware());

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, env: process.env.PLAID_ENV }));
app.use("/dev-token", devTokenRouter);

app.use("/api/plaid", plaidRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/budgets", budgetsRouter);
app.use("/api/forecast", forecastRouter);
app.use("/api/investments", investmentsRouter);
app.use("/api/networth", networthRouter);
app.use("/api/tax", taxRouter);
app.use("/api/business", businessRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/category-rules", categoryRulesRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found." }));

// ── Start ─────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`\n  Finance backend running → http://localhost:${port}`);
  console.log(`  Plaid environment: ${process.env.PLAID_ENV}`);
  console.log(`  Health check: http://localhost:${port}/health\n`);
});
