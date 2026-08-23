import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { decrypt } from "../services/encryption";
import { syncInvestmentsForItem } from "../services/investmentsSync";
import { getSP500History } from "../services/marketData";

export const investmentsRouter = Router();

const ALLOCATION_GROUPS: Record<string, string> = {
  equity: "Stocks",
  etf: "Stocks",
  "mutual fund": "Stocks",
  "fixed income": "Bonds",
  cash: "Cash",
  cryptocurrency: "Crypto",
};

function allocationGroupFor(securityType: string | null): string {
  if (!securityType) return "Other";
  return ALLOCATION_GROUPS[securityType] ?? "Other";
}

/**
 * GET /api/investments
 * Syncs holdings for every connected item, then returns holdings grouped
 * by account plus an asset-allocation breakdown. Items linked before the
 * Investments product was added simply return no holdings for this user.
 */
investmentsRouter.get("/", requireAuth, async (req, res) => {
  const items = await prisma.plaidItem.findMany({
    where: { userId: req.userId!, status: "active" },
  });

  for (const item of items) {
    try {
      await syncInvestmentsForItem(item.id, decrypt(item.accessToken));
    } catch (err) {
      console.error(`Investments sync failed for item ${item.id}:`, err);
    }
  }

  const accounts = await prisma.account.findMany({
    where: { item: { userId: req.userId! }, holdings: { some: {} } },
    include: {
      holdings: { include: { security: true } },
      item: { select: { institutionName: true } },
    },
  });

  const accountGroups = accounts.map((account) => {
    const holdings = account.holdings.map((h) => {
      const gainDollar = h.costBasis != null ? h.institutionValue - h.costBasis : null;
      const gainPercent = h.costBasis && h.costBasis > 0 ? (gainDollar! / h.costBasis) * 100 : null;
      return {
        id: h.id,
        symbol: h.security.tickerSymbol,
        name: h.security.name,
        type: h.security.type,
        quantity: h.quantity,
        costBasis: h.costBasis,
        currentValue: Math.round(h.institutionValue * 100) / 100,
        currentPrice: h.institutionPrice,
        gainDollar: gainDollar != null ? Math.round(gainDollar * 100) / 100 : null,
        gainPercent: gainPercent != null ? Math.round(gainPercent * 100) / 100 : null,
      };
    });
    const accountValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    return {
      accountId: account.id,
      accountName: account.nickname ?? account.name,
      accountSubtype: account.subtype,
      institutionName: account.item.institutionName,
      accountValue: Math.round(accountValue * 100) / 100,
      holdings,
    };
  });

  const allocation = new Map<string, number>();
  for (const account of accounts) {
    for (const h of account.holdings) {
      const group = allocationGroupFor(h.security.type);
      allocation.set(group, (allocation.get(group) ?? 0) + h.institutionValue);
    }
  }
  const totalValue = Array.from(allocation.values()).reduce((a, b) => a + b, 0);
  const allocationBreakdown = Array.from(allocation.entries())
    .map(([group, value]) => ({
      group,
      value: Math.round(value * 100) / 100,
      percent: totalValue > 0 ? Math.round((value / totalValue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  res.json({
    totalValue: Math.round(totalValue * 100) / 100,
    accounts: accountGroups,
    allocation: allocationBreakdown,
  });
});

/**
 * GET /api/investments/performance
 * Real S&P 500 (SPY) trailing-90-day series from Alpha Vantage, plus the
 * user's real aggregate unrealized gain/loss % across all holdings (from
 * Plaid's cost basis vs. current value). These are NOT apples-to-apples —
 * each holding's cost basis dates to a different purchase — so the route
 * returns both figures separately rather than pretending to chart one
 * true "portfolio vs. benchmark" line Plaid's data doesn't support yet.
 */
investmentsRouter.get("/performance", requireAuth, async (req, res) => {
  const sp500 = await getSP500History(90);

  const holdings = await prisma.holding.findMany({
    where: { account: { item: { userId: req.userId! } } },
  });

  const totalCostBasis = holdings.reduce((s, h) => s + (h.costBasis ?? 0), 0);
  const totalValue = holdings.reduce((s, h) => s + h.institutionValue, 0);
  const unrealizedGainDollar = totalValue - totalCostBasis;
  const unrealizedGainPercent =
    totalCostBasis > 0 ? Math.round((unrealizedGainDollar / totalCostBasis) * 1000) / 10 : null;

  const sp500ReturnPercent =
    sp500.length >= 2
      ? Math.round(((sp500[sp500.length - 1].close - sp500[0].close) / sp500[0].close) * 1000) / 10
      : null;

  res.json({
    sp500Series: sp500,
    sp500ReturnPercent,
    sp500WindowDays: sp500.length,
    portfolioUnrealizedGainPercent: unrealizedGainPercent,
    portfolioUnrealizedGainDollar: totalCostBasis > 0 ? Math.round(unrealizedGainDollar * 100) / 100 : null,
  });
});
